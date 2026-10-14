// LOCAL TEST FIXTURE for the wallet product-face e2e suite. NOT the Studio
// runtime. It serves the pinned, content-addressed artifact emitted by Studio
// (e2e/fixtures/product-face/<applicationId>/<version>/<hash>/) and a clearly
// labelled FAKE of the contract runtime endpoints that verifies the wallet's
// one-time assertions with the ephemeral test public key and performs the
// "issuer transfer" through the local fake api-v3 test hook.
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "fixtures", "product-face");
const PORT = Number(process.env.PRODUCT_FACE_FIXTURE_PORT || 4101);
const ORIGIN = `http://localhost:${PORT}`;
const WALLET_ORIGIN =
  process.env.PRODUCT_FACE_WALLET_ORIGIN || "http://demo.localhost:3000";
const MOCK_API = process.env.PRODUCT_FACE_MOCK_API || "http://127.0.0.1:4010";
const PUBLIC_KEY = process.env.PRODUCT_FACE_ASSERTION_PUBLIC_KEY
  ? createPublicKey(
      process.env.PRODUCT_FACE_ASSERTION_PUBLIC_KEY.replace(/\\n/g, "\n"),
    )
  : undefined;
const KEY_ID = process.env.PRODUCT_FACE_ASSERTION_KEY_ID || "";
// contract r15 faceEnabledHandover.walletEntryConfig: the wallet host entry
// comes from the runtime's own configuration (Studio's
// TIG_PRODUCT_FACE_WALLET_ENTRY), never from the link. It is the canonical
// JSON {"slug","walletOrigin"}; walletOrigin must be one of the face's wallet
// origins, and the entry URL is derived here. Anything else (missing,
// malformed, extra keys, another origin) leaves handover unprovisioned.
function walletEntryUrl(raw) {
  let value;
  try {
    value = JSON.parse(String(raw || ""));
  } catch {
    return null;
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify({ slug: value.slug, walletOrigin: value.walletOrigin }) !==
      raw ||
    !/^[a-z0-9][a-z0-9-]{1,62}$/.test(String(value.slug)) ||
    value.walletOrigin !== WALLET_ORIGIN
  ) {
    return null;
  }
  return `${value.walletOrigin}/products/${value.slug}/handover`;
}
const WALLET_ENTRY_URL = walletEntryUrl(process.env.PRODUCT_FACE_WALLET_ENTRY);
const HANDOVER_TICKET_TTL_MS = 10 * 60 * 1000;
const SETTLED = [
  "Registered",
  "Authenticity verified",
  "In service",
  "Transferred",
];
const PENDING = ["Transfer pending"];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// Units each test handover grant covers (fake evidence, in memory only).
const GRANTS = {
  "MH-HANDOVER-A": ["6a00000000000000000000a1"],
  "MH-HANDOVER-B": ["6a00000000000000000000b2"],
  "MH-HANDOVER-AB": ["6a00000000000000000000a1", "6a00000000000000000000b2"],
};

const DEFAULT_MODE = {
  transferState: "Registered",
  holdRegistrations: false,
  // G6b: when set, settle.propose has no proposal and states this reason.
  proposalUnavailable: "",
  // Reserve answers lost after the reservation was made (the BFF never sees them).
  loseReserveResponses: 0,
  // G8 cancel race: the holder's cancel lands inside the next transfer
  // reserve's window (after the reservation, before the offer decision).
  cancelInsideNextTransferReserve: false,
};
let mode = { ...DEFAULT_MODE };
const freshStats = () => ({
  assertions: {},
  registrations: 0,
  jti: new Set(),
  reserve: { won: 0, already_claimed: 0, already_reserved: 0, lost: 0 },
  handover: { issued: 0, redeemed: 0, refused: 0 },
  transfer: {
    offered: 0,
    accepted: 0,
    cancelled: 0,
    won: 0,
    refused: 0,
    already_claimed: 0,
    committed: 0,
    acceptIssued: 0,
    acceptRedeemed: 0,
  },
});
let stats = freshStats();
const evidence = new Map();
const held = [];
// Durable fake runtime state (in memory): registrations and the unit-level
// single flight, originated settle proposals, and settle reservations.
const registrations = new Map(); // operationId -> {objectId, recordId, holder, status}
const unitOperations = new Map(); // objectId -> operationId
const proposals = new Map(); // registration operationId -> proposal
const reservations = new Map(); // objectId -> reservation
// r14 one-time handover tickets: ticket -> {evidence, units, exp, used}.
const handoverTickets = new Map();
// G8 (contract r16): offers by id, offer tickets, each unit's live offer, the
// step proposals and reservations, and one-time acceptance tickets.
const offers = new Map();
const offerTickets = new Map();
const unitOffers = new Map();
const transferProposals = new Map(); // `${offerId}:${step}` -> proposal
const transferReservations = new Map(); // `${offerId}:${step}` -> reservation
const acceptTickets = new Map();
const resetState = () => {
  evidence.clear();
  handoverTickets.clear();
  offers.clear();
  offerTickets.clear();
  unitOffers.clear();
  transferProposals.clear();
  transferReservations.clear();
  acceptTickets.clear();
  registrations.clear();
  unitOperations.clear();
  proposals.clear();
  reservations.clear();
};

const withoutAssertion = (body) =>
  Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== "assertion"),
  );
const sha256 = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) request.destroy();
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve(undefined);
      }
    });
  });
}

async function manifestFor(applicationId, version, hash) {
  const raw = await readFile(
    path.join(ROOT, applicationId, version, hash, "manifest.json"),
    "utf8",
  );
  return JSON.parse(raw);
}

/** Verifies the wallet assertion for one exact request; consumes its jti once. */
async function verifyAssertion(token, expected) {
  if (!PUBLIC_KEY || typeof token !== "string")
    return "face_wallet_assertion_unprovisioned";
  const [header, claims, signature] = token.split(".");
  if (!header || !claims || !signature) return "face_assertion_invalid";
  const parsedHeader = JSON.parse(
    Buffer.from(header, "base64url").toString("utf8"),
  );
  if (
    parsedHeader.alg !== "EdDSA" ||
    parsedHeader.typ !== "dual-face-assertion+jwt" ||
    parsedHeader.kid !== KEY_ID
  ) {
    return "face_assertion_invalid";
  }
  if (
    !verify(
      null,
      Buffer.from(`${header}.${claims}`),
      PUBLIC_KEY,
      Buffer.from(signature, "base64url"),
    )
  ) {
    return "face_assertion_invalid";
  }
  const c = JSON.parse(Buffer.from(claims, "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  const manifest = expected.manifest;
  if (
    c.iss !== WALLET_ORIGIN ||
    c.aud !== `${manifest.applicationId}@${ORIGIN}` ||
    c.origin !== ORIGIN ||
    c.app_id !== manifest.applicationId ||
    c.app_version !== manifest.version ||
    c.artifact !== manifest.artifactHash ||
    c.publisher !== manifest.publisher ||
    c.programme !== manifest.programmeId ||
    c.operation !== expected.operation ||
    c.op_id !== expected.opId ||
    canonical(c.target) !== canonical(expected.target) ||
    c.request_hash !== expected.requestHash ||
    !(c.exp > now) ||
    c.exp - c.iat > 60 ||
    Math.abs(now - c.iat) > 60
  ) {
    return "face_assertion_mismatch";
  }
  if (stats.jti.has(c.jti)) return "face_assertion_replayed";
  stats.jti.add(c.jti);
  stats.assertions[c.operation] = (stats.assertions[c.operation] ?? 0) + 1;
  return { claims: c };
}

async function readback(objectId, holder) {
  const response = await fetch(`${MOCK_API}/public/objects/${objectId}`);
  if (!response.ok) return { status: "outcome_unknown" };
  const object = await response.json();
  const ownerIsHolder = object.owner.toLowerCase() === holder.toLowerCase();
  const state = object.custom?.state ?? null;
  const target = object.custom?.lifecycle?.target_state ?? null;
  if (!ownerIsHolder) return { status: "pending", object };
  if (PENDING.includes(state))
    return { status: "ownership_moved_state_pending", object };
  if (SETTLED.includes(state) && (!target || target === state))
    return { status: "registered", object };
  return { status: "recovery_required", object };
}

const ZERO = {
  writesExecuted: 0,
  dualWritesExecuted: 0,
  unknownWriteOutcomes: 0,
  secretReturned: false,
};

const opaqueHandle = () => randomBytes(32).toString("base64url");
const PROPOSAL_TTL_MS = 15 * 60_000;

async function holderActions(objectId, holder, sinceIso) {
  const response = await fetch(
    `${MOCK_API}/__test__/action-logs?object_id=${objectId}`,
  );
  if (!response.ok) return undefined;
  const { action_logs: logs } = await response.json();
  const since = Date.parse(sinceIso);
  return logs.filter(
    (log) =>
      log.name === "update" &&
      String(log.account).toLowerCase() === holder.toLowerCase() &&
      Date.parse(log.when_created ?? log.created_at ?? sinceIso) >=
        since - 1000,
  );
}

/**
 * G6b: the runtime originates the brand's proposal for the holder's own
 * unit (the COMPLETE custom map, Studio-shaped), or states why there is none.
 */
async function originateProposal(operationId, objectId, holder) {
  if (mode.proposalUnavailable) {
    return { unavailable: mode.proposalUnavailable };
  }
  const existing = proposals.get(operationId);
  if (existing && Date.parse(existing.expires_at) > Date.now()) return existing;
  const current = await (
    await fetch(`${MOCK_API}/__test__/objects/${objectId}`)
  ).json();
  const custom = { ...(current.custom ?? {}) };
  delete custom.lifecycle;
  const input = {
    data: {
      custom: {
        ...custom,
        state: "Authenticity verified",
        lifecycle: { target_state: "Authenticity verified" },
        action_hash: createHash("sha256")
          .update(`${objectId}:${operationId}`)
          .digest("hex"),
      },
    },
  };
  const proposal = {
    proposal_id: `psp-${randomBytes(12).toString("hex")}`,
    operation_id: operationId,
    object_id: objectId,
    action: "update",
    input,
    proposal_hash: sha256(
      canonical({ object_id: objectId, action: "update", input }),
    ),
    expires_at: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
    holder,
  };
  proposals.set(operationId, proposal);
  return proposal;
}

const proposalView = (proposal) =>
  proposal?.unavailable
    ? {
        status: "unavailable",
        reason: proposal.unavailable,
        nextStep: "brand_operator_proposal",
      }
    : { status: "proposed", expiresAt: proposal.expires_at };

async function registrationAnswer(operationId, objectId, holder, extra = {}) {
  const result = await readback(objectId, holder);
  const status =
    result.status === "pending" ? "outcome_unknown" : result.status;
  const record = registrations.get(operationId);
  if (record) record.status = status;
  let settle = {};
  if (status === "ownership_moved_state_pending") {
    const reserved = reservations.get(objectId);
    const proposal = await originateProposal(operationId, objectId, holder);
    settle = {
      nextStep:
        reserved && reserved.state !== "committed"
          ? "check_settle_status"
          : proposal.unavailable
            ? "brand_operator_proposal"
            : "settle_on_wallet",
      settleProposal: proposalView(proposal),
    };
  }
  return {
    ok: true,
    status,
    operationId,
    objectId,
    actionId: null,
    ...settle,
    ...ZERO,
    ...extra,
  };
}

/** The /evidence answer: the opaque handle and the units it covers. */
async function evidenceAnswer(handle, units) {
  const listed = [];
  for (const objectId of units) {
    const object = await (
      await fetch(`${MOCK_API}/public/objects/${objectId}`)
    ).json();
    listed.push({
      recordId: `rec-${objectId.slice(-4)}`,
      objectId,
      title: object.metadata.name,
      serialNumber: object.custom.serialNumber,
      model: object.custom.model,
      registration: object.owner.toLowerCase().endsWith("155ae")
        ? "available"
        : "already_registered",
    });
  }
  return {
    status: "evidence_accepted",
    evidence: handle,
    units: listed,
    secretReturned: false,
  };
}

async function runtime(request, response, url, manifest) {
  const body = await readJson(request);
  if (!body)
    return send(response, 400, {
      status: "refused",
      reason: "face_request_invalid",
    });
  const route = url.pathname.slice("/api/product-face/v1".length);

  if (route === "/handover") {
    // r15: without a valid wallet host entry, refuse before the grant is used.
    if (!WALLET_ENTRY_URL) {
      stats.handover.refused += 1;
      return send(response, 503, {
        status: "face_wallet_entry_unprovisioned",
        ...ZERO,
      });
    }
    // r14 step 2: the EXISTING evidence exchange, then a one-time ticket
    // bound to this application, version and artifact. Only {walletEntryUrl,
    // ticket} is answered; the grant never leaves the runtime.
    const units = GRANTS[String(body.grant || "").trim()];
    if (!units) {
      stats.handover.refused += 1;
      return send(response, 400, {
        status: "face_evidence_grant_invalid",
        ...ZERO,
      });
    }
    const handle = opaqueHandle();
    evidence.set(handle, units);
    const ticket = randomBytes(32).toString("base64url");
    handoverTickets.set(ticket, {
      evidence: handle,
      units,
      exp: Date.now() + HANDOVER_TICKET_TTL_MS,
      used: false,
      applicationId: manifest.applicationId,
      version: manifest.version,
      artifactHash: manifest.artifactHash,
    });
    stats.handover.issued += 1;
    return send(response, 200, {
      walletEntryUrl: WALLET_ENTRY_URL,
      ticket,
    });
  }

  if (route === "/handover/redeem") {
    // r14 step 5: atomically consumed once; answers exactly what /evidence
    // answers.
    const entry = handoverTickets.get(String(body.ticket || ""));
    const refusal = !entry
      ? "face_handover_ticket_invalid"
      : entry.used
        ? "face_handover_ticket_used"
        : entry.exp <= Date.now()
          ? "face_handover_ticket_expired"
          : entry.applicationId !== manifest.applicationId ||
              entry.artifactHash !== manifest.artifactHash
            ? "face_handover_ticket_binding_mismatch"
            : "";
    if (refusal) {
      stats.handover.refused += 1;
      return send(response, 409, {
        status: "refused",
        reason: refusal,
        ...ZERO,
      });
    }
    entry.used = true;
    stats.handover.redeemed += 1;
    return send(
      response,
      200,
      await evidenceAnswer(entry.evidence, entry.units),
    );
  }

  if (route === "/accept") {
    // G8 acceptance entry (r16, the r14 pattern): the open offer's ticket for a
    // one-time acceptance ticket; the wallet entry comes from this runtime's
    // own configuration. The offer itself is not consumed here.
    if (request.headers.origin !== ORIGIN) {
      return send(response, 403, {
        status: "face_accept_same_origin_required",
        ...ZERO,
      });
    }
    if (!WALLET_ENTRY_URL) {
      return send(response, 503, {
        status: "face_wallet_entry_unprovisioned",
        ...ZERO,
      });
    }
    const offer = offerByTicket(body.offer);
    if (!offer)
      return send(response, 404, {
        status: "transfer_offer_not_found",
        ...ZERO,
      });
    if (offer.state !== "offered") {
      return send(response, 409, {
        status:
          offer.state === "cancelled"
            ? "transfer_offer_cancelled"
            : "transfer_offer_used",
        ...ZERO,
      });
    }
    const ticket = randomBytes(32).toString("base64url");
    acceptTickets.set(ticket, {
      offer: body.offer,
      exp: Date.now() + HANDOVER_TICKET_TTL_MS,
      used: false,
    });
    stats.transfer.acceptIssued += 1;
    return send(response, 200, { walletEntryUrl: WALLET_ENTRY_URL, ticket });
  }

  if (route === "/accept/redeem") {
    if (request.headers.origin !== ORIGIN) {
      return send(response, 403, {
        status: "face_accept_same_origin_required",
        ...ZERO,
      });
    }
    const entry = acceptTickets.get(String(body.ticket || ""));
    const code = !entry
      ? "face_accept_ticket_unknown"
      : entry.used
        ? "face_accept_ticket_used"
        : entry.exp <= Date.now()
          ? "face_accept_ticket_expired"
          : "";
    if (code) return send(response, 409, { ok: false, status: code, ...ZERO });
    entry.used = true;
    stats.transfer.acceptRedeemed += 1;
    return send(response, 200, {
      ok: true,
      status: "transfer_offer_ticket",
      offer: entry.offer,
      ...ZERO,
      secretReturned: true,
    });
  }

  if (route === "/evidence") {
    const units = GRANTS[String(body.grant || "").trim()];
    if (!units)
      return send(response, 400, { status: "face_evidence_grant_invalid" });
    // r9: an opaque, random handle only; nothing in it names a session.
    const handle = opaqueHandle();
    evidence.set(handle, units);
    return send(response, 200, await evidenceAnswer(handle, units));
  }

  if (route === "/registrations") {
    const objectId = (evidence.get(body.evidence) || []).find(
      (id) => `rec-${id.slice(-4)}` === body.recordId,
    );
    if (!objectId)
      return send(response, 400, {
        status: "refused",
        reason: "face_evidence_unit_not_covered",
      });
    const verified = await verifyAssertion(body.assertion, {
      manifest,
      operation: "registration.submit",
      opId: body.operationId,
      target: { object_id: objectId },
      // r6: the hash over the entire exact request body, assertion excluded.
      requestHash: sha256(canonical(withoutAssertion(body))),
    });
    if (typeof verified === "string")
      return send(response, 403, { status: "refused", reason: verified });
    const holder = verified.claims.holder;
    // r8 unit-level single flight: one registration per unit while another
    // is pending or unknown; the same operation replays its recorded result.
    const current = unitOperations.get(objectId);
    if (current && current !== body.operationId) {
      const other = registrations.get(current);
      if (
        other &&
        !["registered", "refused", "not_submitted"].includes(other.status)
      ) {
        return send(response, 409, {
          ok: false,
          status: "refused",
          reason: "operation_conflict",
          operationId: body.operationId,
          objectId,
          existingOperationId: current,
          ...ZERO,
        });
      }
    }
    if (current === body.operationId && registrations.has(current)) {
      return send(
        response,
        200,
        await registrationAnswer(current, objectId, holder, { replayed: true }),
      );
    }
    unitOperations.set(objectId, body.operationId);
    registrations.set(body.operationId, {
      objectId,
      recordId: body.recordId,
      holder,
      status: "outcome_unknown",
    });
    stats.registrations += 1;
    if (mode.holdRegistrations) {
      // Simulates a lost frame mid-operation: the request is never answered.
      held.push(response);
      return;
    }
    await fetch(`${MOCK_API}/__test__/issuer-transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object_id: objectId,
        to: holder,
        state: mode.transferState,
        ...(PENDING.includes(mode.transferState)
          ? { lifecycle_target: "Authenticity verified" }
          : {}),
      }),
    });
    return send(
      response,
      200,
      await registrationAnswer(body.operationId, objectId, holder, {
        writeOutcome: "committed",
        accounting: {
          providerWritesExecuted: 0,
          dualWritesExecuted: 1,
          readbacksExecuted: 1,
          unknownWriteOutcomes: 0,
        },
      }),
    );
  }

  if (route === "/registrations/status") {
    const target =
      JSON.parse(
        Buffer.from(
          String(body.assertion || "..").split(".")[1] || "",
          "base64url",
        ).toString("utf8") || "{}",
      ).target ?? {};
    const verified = await verifyAssertion(body.assertion, {
      manifest,
      operation: "registration.status",
      opId: body.operationId,
      target: { object_id: target.object_id },
      requestHash: sha256(canonical({ operationId: body.operationId })),
    });
    if (typeof verified === "string")
      return send(response, 403, { status: "refused", reason: verified });
    return send(
      response,
      200,
      await registrationAnswer(
        body.operationId,
        target.object_id,
        verified.claims.holder,
      ),
    );
  }

  if (route === "/operations") {
    const { assertion, ...rest } = body;
    const objectId = body.target?.object_id;
    // r8: the reserve assertion's request_hash is over exactly
    // {proposal_id, settle_operation_id, object_id}.
    const requestHash =
      body.operation === "registration.settle.reserve"
        ? sha256(
            canonical({
              proposal_id: body.input?.proposal_id,
              settle_operation_id: body.operationId,
              object_id: objectId,
            }),
          )
        : sha256(canonical(rest));
    const verified = await verifyAssertion(assertion, {
      manifest,
      operation: body.operation,
      opId: body.operationId,
      target: body.target,
      requestHash,
    });
    if (typeof verified === "string")
      return send(response, 403, {
        status: "refused",
        reason: verified,
        ...ZERO,
      });
    const holder = verified.claims.holder;
    if (body.operation === "products.private.read") {
      return send(response, 200, {
        status: "private_product_read",
        product: {
          registeredAt: "2026-10-14",
          registrationKind: "first owner (fake)",
          documents: [
            { title: `Warranty for ${objectId}`, body: "Local fake document." },
          ],
        },
        ...ZERO,
      });
    }
    if (body.operation === "registration.pending.read") {
      // r9: the ORIGINAL pending registration of this unit for this holder.
      const operationId = unitOperations.get(objectId);
      const record = operationId && registrations.get(operationId);
      if (!record || record.holder.toLowerCase() !== holder.toLowerCase()) {
        return send(response, 404, {
          ok: false,
          status: "not_submitted",
          reason: "registration_pending_not_found",
          objectId,
          ...ZERO,
        });
      }
      const answer = await registrationAnswer(operationId, objectId, holder);
      const reserved = reservations.get(objectId);
      return send(response, 200, {
        ...answer,
        recordId: record.recordId,
        ...(reserved && reserved.state !== "committed"
          ? {
              settleReservation: {
                settle_operation_id: reserved.settleOperationId,
                state: reserved.state,
              },
            }
          : {}),
      });
    }
    if (body.operation === "registration.settle.propose") {
      if (request.headers.origin)
        return send(response, 403, {
          status: "face_trusted_read_server_only",
          ...ZERO,
        });
      const proposal = await originateProposal(
        body.operationId,
        objectId,
        holder,
      );
      if (proposal.unavailable) {
        return send(response, 409, {
          ok: false,
          status: "settle_proposal_unavailable",
          reason: proposal.unavailable,
          nextStep: "brand_operator_proposal",
          ...ZERO,
        });
      }
      const view = { ...proposal };
      delete view.holder;
      return send(response, 200, {
        ok: true,
        status: "settle_proposed",
        ...view,
        ...ZERO,
      });
    }
    if (body.operation === "registration.settle.reserve") {
      // r8/r11: server to server only; ONE durable dispatch claim per unit.
      if (request.headers.origin)
        return send(response, 403, {
          status: "face_trusted_read_server_only",
          ...ZERO,
        });
      const proposalId = body.input?.proposal_id;
      const proposal = [...proposals.values()].find(
        (item) =>
          item.proposal_id === proposalId && item.object_id === objectId,
      );
      if (!proposal || proposal.holder.toLowerCase() !== holder.toLowerCase()) {
        return send(response, 404, {
          ok: false,
          status: "face_settle_proposal_required",
          ...ZERO,
        });
      }
      const view = (reservation) => ({
        proposal_id: reservation.proposalId,
        settle_operation_id: reservation.settleOperationId,
        object_id: objectId,
        operation_id: reservation.registrationOperationId,
        state: reservation.state,
        action_id: reservation.actionId,
        reserved_at: reservation.reservedAt,
      });
      const existing = reservations.get(objectId);
      if (existing) {
        // Every later call, the same settle operation included, is
        // already_claimed and must never be used to execute.
        const same = existing.settleOperationId === body.operationId;
        stats.reserve[same ? "already_claimed" : "already_reserved"] += 1;
        return send(response, same ? 200 : 409, {
          ok: same,
          status: same ? "granted" : "already_reserved",
          ...(same ? { idempotent: true } : {}),
          dispatch: "already_claimed",
          reservation: view(existing),
          ...ZERO,
        });
      }
      // The atomic step: create-if-absent in this single-threaded fake.
      const reservation = {
        proposalId,
        settleOperationId: body.operationId,
        registrationOperationId: proposal.operation_id,
        holder,
        state: "granted",
        actionId: null,
        reservedAt: new Date().toISOString(),
      };
      reservations.set(objectId, reservation);
      if (mode.loseReserveResponses > 0) {
        mode.loseReserveResponses -= 1;
        stats.reserve.lost += 1;
        request.socket.destroy();
        return;
      }
      stats.reserve.won += 1;
      return send(response, 200, {
        ok: true,
        status: "granted",
        dispatch: "won",
        reservation: view(reservation),
        ...ZERO,
      });
    }
    if (body.operation === "registration.settle.verify") {
      const reservation = reservations.get(objectId);
      if (
        !reservation ||
        reservation.settleOperationId !== body.input?.settle_operation_id ||
        reservation.registrationOperationId !== body.operationId
      ) {
        return send(response, 409, {
          ok: false,
          status: "ownership_moved_state_pending",
          reason: "face_settle_reservation_required",
          operationId: body.operationId,
          objectId,
          ...ZERO,
        });
      }
      reservation.actionId = body.input.action_id;
      const answer = await registrationAnswer(
        body.operationId,
        objectId,
        holder,
        {
          actionId: body.input.action_id,
        },
      );
      if (answer.status === "registered") reservation.state = "committed";
      return send(response, 200, answer);
    }
    if (body.operation === "registration.settle.status") {
      // Read-only: the reservation and the holder's own action on the fake
      // Dual. Found => verify; not found => outcome_unknown. Never executes.
      const reservation = reservations.get(objectId);
      if (!reservation || reservation.settleOperationId !== body.operationId) {
        return send(response, 404, {
          ok: false,
          status: "not_submitted",
          reason: "face_settle_reservation_not_found",
          objectId,
          ...ZERO,
        });
      }
      let actionId = reservation.actionId;
      if (!actionId) {
        const found = await holderActions(
          objectId,
          holder,
          reservation.reservedAt,
        );
        if (!found) {
          return send(response, 202, {
            ok: false,
            status: "outcome_unknown",
            reason: "face_settle_readback_unavailable",
            operationId: reservation.registrationOperationId,
            objectId,
            nextStep: "check_status",
            ...ZERO,
          });
        }
        if (!found.length) {
          return send(response, 202, {
            ok: false,
            status: "outcome_unknown",
            reason: "face_settle_action_not_found",
            operationId: reservation.registrationOperationId,
            objectId,
            nextStep: "check_status",
            settleOperationId: reservation.settleOperationId,
            ...ZERO,
          });
        }
        actionId = found[0].id;
        reservation.actionId = actionId;
      }
      const answer = await registrationAnswer(
        reservation.registrationOperationId,
        objectId,
        holder,
        {
          actionId,
          settleStatus: {
            settleOperationId: reservation.settleOperationId,
            recoveredFromDual: true,
            executedNothing: true,
          },
        },
      );
      if (answer.status === "registered") reservation.state = "committed";
      return send(response, 200, answer);
    }
    if (String(body.operation).startsWith("transfer.")) {
      return transferOperation(request, response, body, holder, manifest);
    }
    return send(response, 200, { status: "ok", ...ZERO });
  }
  return send(response, 404, { status: "not_found" });
}

// ---------------------------------------------------------------- G8
// LOCAL FAKE of the runtime's protected transfer (contract r16): the same
// one-CAS offer state machine (offered -> accepted -> submitted, or ->
// cancelled), a one-use reservation per step, holder-signed steps verified
// against the fake api-v3 action log. Nothing here signs or executes.
const TRANSFERABLE = [
  "Registered",
  "Authenticity verified",
  "In service",
  "Transferred",
];
const OFFER_TTL_MS = 24 * 60 * 60 * 1000;
const offerView = (offer, role) => ({
  offer_id: offer.offerId,
  state: offer.state,
  role,
  expires_at: offer.expiresAt,
  submitted: offer.submitted,
  steps: {
    request: offer.steps.request?.state ?? "not_started",
    transfer: offer.steps.transfer?.state ?? "not_started",
  },
  nextStep:
    offer.state === "offered"
      ? role === "holder"
        ? "share_acceptance_link"
        : "accept"
      : ["accepted", "request_committed"].includes(offer.state)
        ? role === "holder"
          ? "sign_transfer_on_wallet"
          : "wait_for_holder"
        : null,
});
const sameWallet = (a, b) =>
  String(a).toLowerCase() === String(b).toLowerCase();
const stepOf = (offer) =>
  offer.state === "accepted"
    ? "request"
    : offer.state === "request_committed"
      ? "transfer"
      : "";
const refusal = (response, status, code, extra = {}) =>
  send(response, status, {
    ok: false,
    status: code,
    reason: code,
    ...ZERO,
    ...extra,
  });

async function objectNow(objectId) {
  const found = await fetch(`${MOCK_API}/__test__/objects/${objectId}`);
  return found.ok ? found.json() : undefined;
}

async function stepAction(objectId, holder, name, sinceIso) {
  const found = await fetch(
    `${MOCK_API}/__test__/action-logs?object_id=${objectId}`,
  );
  if (!found.ok) return undefined;
  const { action_logs: logs } = await found.json();
  const since = Date.parse(sinceIso) - 1000;
  return logs.find(
    (log) =>
      log.name === name &&
      sameWallet(log.account, holder) &&
      Date.parse(log.when_created) >= since,
  );
}

function offerByTicket(ticket) {
  const offerId = offerTickets.get(String(ticket || ""));
  return offerId ? offers.get(offerId) : undefined;
}

async function commitStep(response, offer, step, holder, action) {
  if (step === "transfer") {
    const object = await objectNow(offer.objectId);
    if (!object || !sameWallet(object.owner, offer.recipient)) {
      return refusal(response, 409, "transfer_recipient_not_owner");
    }
  }
  offer.steps[step] = {
    ...offer.steps[step],
    state: "committed",
    actionId: action.id,
  };
  offer.state = step === "request" ? "request_committed" : "transferred";
  const reservation = transferReservations.get(`${offer.offerId}:${step}`);
  if (reservation) reservation.state = "committed";
  stats.transfer.committed += 1;
  return send(response, 200, {
    ok: true,
    status: step === "request" ? "transfer_request_committed" : "transferred",
    step,
    offer: offerView(offer, "holder"),
    dual: {
      actionId: action.id,
      executedBy: "holder_wallet",
      runtimeDualWritesExecuted: 0,
    },
    ...ZERO,
  });
}

async function transferOperation(request, response, body, holder, manifest) {
  const operation = body.operation;
  const input = body.input ?? {};
  const target = body.target ?? {};
  const serverOnly = ["transfer.propose", "transfer.reserve"].includes(
    operation,
  );
  if (serverOnly && request.headers.origin) {
    return refusal(response, 403, "face_trusted_read_server_only");
  }
  if (operation === "transfer.offer") {
    const object = await objectNow(target.object_id);
    if (!object || !sameWallet(object.owner, holder)) {
      return refusal(response, 403, "face_holder_not_record_owner");
    }
    if (!TRANSFERABLE.includes(object.custom?.state)) {
      return refusal(response, 409, "transfer_not_available");
    }
    const live = offers.get(unitOffers.get(target.object_id));
    if (live && !["cancelled", "expired", "transferred"].includes(live.state)) {
      return refusal(response, 409, "transfer_in_progress", {
        offer: offerView(live, "holder"),
      });
    }
    const ticket = randomBytes(32).toString("base64url");
    const offer = {
      offerId: `pto-${randomBytes(12).toString("hex")}`,
      objectId: target.object_id,
      holder: holder.toLowerCase(),
      state: "offered",
      expiresAt: new Date(Date.now() + OFFER_TTL_MS).toISOString(),
      submitted: false,
      steps: {},
      recipient: null,
      acceptOperationId: null,
      ticketHash: sha256(ticket),
    };
    offers.set(offer.offerId, offer);
    offerTickets.set(ticket, offer.offerId);
    unitOffers.set(target.object_id, offer.offerId);
    stats.transfer.offered += 1;
    return send(response, 200, {
      ok: true,
      status: "transfer_offered",
      offer: offerView(offer, "holder"),
      acceptance: {
        link: `${ORIGIN}/face/accept/${manifest.applicationId}#offer=${ticket}`,
        expiresAt: offer.expiresAt,
        oneTime: true,
      },
      ...ZERO,
      secretReturned: true,
    });
  }
  if (operation === "transfer.offer.read" || operation === "transfer.accept") {
    const offer = offerByTicket(input.ticket);
    if (!offer) return refusal(response, 404, "transfer_offer_not_found");
    if (sameWallet(offer.holder, holder)) {
      return refusal(response, 409, "transfer_recipient_is_holder");
    }
    const mine = offer.recipient && sameWallet(offer.recipient, holder);
    if (operation === "transfer.offer.read") {
      if (!mine && offer.state !== "offered") {
        return refusal(response, 404, "transfer_offer_not_found");
      }
      const object = await objectNow(offer.objectId);
      return send(response, 200, {
        ok: true,
        status: "transfer_offer",
        offer: offerView(offer, mine ? "recipient" : "invitee"),
        product: {
          object_id: offer.objectId,
          title: object?.metadata?.name ?? "",
          serialNumber: object?.custom?.serialNumber ?? "",
          model: object?.custom?.model ?? "",
          programme: manifest.applicationId,
        },
        ...ZERO,
      });
    }
    if (offer.state !== "offered") {
      if (mine && offer.acceptOperationId === body.operationId) {
        return send(response, 200, {
          ok: true,
          status: "transfer_accepted",
          idempotent: true,
          offer: offerView(offer, "recipient"),
          object_id: offer.objectId,
          operationId: body.operationId,
          ...ZERO,
        });
      }
      return refusal(
        response,
        409,
        offer.state === "cancelled"
          ? "transfer_offer_cancelled"
          : "transfer_offer_used",
      );
    }
    offer.state = "accepted";
    offer.recipient = holder.toLowerCase();
    offer.acceptOperationId = body.operationId;
    stats.transfer.accepted += 1;
    return send(response, 200, {
      ok: true,
      status: "transfer_accepted",
      offer: offerView(offer, "recipient"),
      object_id: offer.objectId,
      operationId: body.operationId,
      ...ZERO,
    });
  }
  // Unit-scoped: the holder (or, for reads, the bound recipient) of the unit's offer.
  const offer = offers.get(unitOffers.get(target.object_id));
  const asHolder = offer && sameWallet(offer.holder, holder);
  const asRecipient = offer?.recipient && sameWallet(offer.recipient, holder);
  if (!offer || !(asHolder || (operation === "transfer.read" && asRecipient))) {
    return refusal(response, 404, "transfer_offer_not_found");
  }
  if (operation === "transfer.read") {
    return send(response, 200, {
      ok: true,
      status: "transfer_read",
      offer: offerView(offer, asHolder ? "holder" : "recipient"),
      ...ZERO,
    });
  }
  if (input.offer_id !== offer.offerId) {
    return refusal(response, 404, "transfer_offer_not_found");
  }
  if (operation === "transfer.cancel") {
    if (offer.state === "cancelled") {
      return send(response, 200, {
        ok: true,
        status: "transfer_cancelled",
        idempotent: true,
        offer: offerView(offer, "holder"),
        ...ZERO,
      });
    }
    if (offer.submitted || !["offered", "accepted"].includes(offer.state)) {
      return refusal(response, 409, "transfer_submitted", {
        offer: offerView(offer, "holder"),
      });
    }
    offer.state = "cancelled";
    stats.transfer.cancelled += 1;
    return send(response, 200, {
      ok: true,
      status: "transfer_cancelled",
      offer: offerView(offer, "holder"),
      ...ZERO,
    });
  }
  if (operation === "transfer.propose") {
    const step = stepOf(offer);
    if (!step) {
      return refusal(
        response,
        409,
        offer.state === "offered"
          ? "transfer_not_accepted"
          : "transfer_step_unavailable",
      );
    }
    const key = `${offer.offerId}:${step}`;
    if (transferReservations.has(key)) {
      return refusal(response, 409, "transfer_step_reserved", {
        nextStep: "check_transfer_status",
      });
    }
    const proposalInput =
      step === "transfer"
        ? { to: offer.recipient }
        : {
            data: {
              custom: {
                state: "Transfer pending",
                lifecycle: { target_state: "Transfer pending" },
                dual_object_id: offer.objectId,
                proof_event: {
                  public_fields: [
                    "state:Transfer pending",
                    `recipientReferenceHash:${sha256(offer.recipient)}`,
                  ],
                },
              },
            },
          };
    const action = step === "transfer" ? "transfer" : "update";
    const proposal = {
      proposal_id: `ptp-${randomBytes(12).toString("hex")}`,
      step,
      offer_id: offer.offerId,
      object_id: offer.objectId,
      action,
      input: proposalInput,
      proposal_hash: sha256(
        canonical({ object_id: offer.objectId, action, input: proposalInput }),
      ),
      expires_at: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
    };
    transferProposals.set(key, proposal);
    return send(response, 200, {
      ok: true,
      status: "transfer_step_proposed",
      ...proposal,
      recipient: offer.recipient,
      ...ZERO,
    });
  }
  if (operation === "transfer.reserve") {
    const refused = (code, status) => {
      stats.transfer.refused += 1;
      return refusal(response, status, code, {
        dispatch: "refused",
        executionPermitted: false,
      });
    };
    const step = stepOf(offer);
    if (!step) {
      return refused(
        offer.state === "cancelled"
          ? "transfer_offer_cancelled"
          : "transfer_step_unavailable",
        409,
      );
    }
    const key = `${offer.offerId}:${step}`;
    const proposal = transferProposals.get(key);
    if (!proposal || proposal.proposal_id !== input.proposal_id) {
      return refused("transfer_proposal_required", 409);
    }
    if (transferReservations.has(key)) {
      stats.transfer.already_claimed += 1;
      return refusal(response, 409, "already_claimed", {
        dispatch: "already_claimed",
        executionPermitted: false,
      });
    }
    const reservation = {
      step,
      stepOperationId: body.operationId,
      proposalId: proposal.proposal_id,
      state: "granted",
      reservedAt: new Date().toISOString(),
    };
    transferReservations.set(key, reservation);
    // The holder's cancel lands inside this window: it wins the offer decision.
    if (mode.cancelInsideNextTransferReserve) {
      mode.cancelInsideNextTransferReserve = false;
      if (!offer.submitted && ["offered", "accepted"].includes(offer.state)) {
        offer.state = "cancelled";
        stats.transfer.cancelled += 1;
      }
    }
    if (stepOf(offer) !== step) {
      reservation.state = "refused";
      return refused(
        offer.state === "cancelled"
          ? "transfer_offer_cancelled"
          : "transfer_changed",
        409,
      );
    }
    offer.submitted = true;
    offer.steps[step] = {
      state: "reserved",
      stepOperationId: body.operationId,
      proposalId: proposal.proposal_id,
    };
    stats.transfer.won += 1;
    return send(response, 200, {
      ok: true,
      status: "granted",
      dispatch: "won",
      executionPermitted: true,
      reservation: {
        step,
        state: "granted",
        step_operation_id: body.operationId,
        proposal_id: proposal.proposal_id,
      },
      ...ZERO,
    });
  }
  if (operation === "transfer.verify" || operation === "transfer.status") {
    const entry = [...transferReservations.entries()].find(
      ([key, item]) =>
        key.startsWith(`${offer.offerId}:`) &&
        item.stepOperationId === input.step_operation_id,
    );
    if (!entry) return refusal(response, 404, "transfer_reservation_not_found");
    const [key, reservation] = entry;
    const step = key.split(":")[1];
    if (reservation.state === "refused") {
      return refusal(response, 409, "transfer_reservation_refused", {
        status: "refused",
      });
    }
    if (offer.steps[step]?.state === "committed") {
      return send(response, 200, {
        ok: true,
        status:
          step === "request" ? "transfer_request_committed" : "transferred",
        step,
        offer: offerView(offer, "holder"),
        ...ZERO,
      });
    }
    const action = await stepAction(
      offer.objectId,
      holder,
      step === "request" ? "update" : "transfer",
      reservation.reservedAt,
    );
    if (
      !action ||
      (operation === "transfer.verify" && action.id !== input.action_id)
    ) {
      return send(response, 202, {
        ok: false,
        status: "outcome_unknown",
        reason: "transfer_action_not_found",
        step,
        nextStep: "check_transfer_status",
        ...ZERO,
      });
    }
    return commitStep(response, offer, step, holder, action);
  }
  return refusal(response, 400, "face_request_invalid");
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", ORIGIN);
  try {
    if (url.pathname === "/health")
      return send(response, 200, { ok: true, fake: true });
    if (url.pathname === "/__test__/mode" && request.method === "POST") {
      mode = { ...mode, ...(await readJson(request)) };
      if (!mode.holdRegistrations)
        held.splice(0).forEach((pending) => pending.destroy());
      return send(response, 200, mode);
    }
    if (url.pathname === "/__test__/reset" && request.method === "POST") {
      mode = { ...DEFAULT_MODE };
      stats = freshStats();
      held.splice(0).forEach((pending) => pending.destroy());
      resetState();
      return send(response, 200, { ok: true });
    }
    // Test hook: the unit's open offer accepted by `recipient`, as the
    // recipient's own face would (used where the recipient's UI is not the
    // subject of the test).
    if (
      url.pathname === "/__test__/accept-offer" &&
      request.method === "POST"
    ) {
      const hook = await readJson(request);
      const offer = offers.get(unitOffers.get(hook?.object_id));
      if (!offer || offer.state !== "offered") {
        return send(response, 409, { status: "transfer_offer_not_open" });
      }
      offer.state = "accepted";
      offer.recipient = String(hook.recipient).toLowerCase();
      offer.acceptOperationId = "accept-test-hook";
      stats.transfer.accepted += 1;
      return send(response, 200, { ok: true });
    }
    if (url.pathname === "/__test__/stats") {
      return send(response, 200, {
        assertions: stats.assertions,
        registrations: stats.registrations,
        reserve: stats.reserve,
        handover: stats.handover,
        transfer: stats.transfer,
        offers: [...offers.values()].map((offer) => ({
          state: offer.state,
          submitted: offer.submitted,
          steps: offer.steps,
        })),
        reservations: Object.fromEntries(reservations),
        // Leaves under data.custom of each originated proposal.
        proposalLeaves: [...proposals.values()].map((proposal) => {
          const count = (value) =>
            value && typeof value === "object" && !Array.isArray(value)
              ? Object.values(value).reduce((sum, item) => sum + count(item), 0)
              : 1;
          return count(proposal.input.data.custom);
        }),
      });
    }
    // r14 step 2: the runtime's minimal handover page. Strict CSP, no
    // referrer, not framable; its script strips the fragment at once, posts
    // the grant same-origin and goes to the wallet entry with the ticket in
    // the fragment only.
    if (/^\/face\/handover\/[a-z0-9._-]+\/?$/.test(url.pathname)) {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        "Cache-Control": "no-store",
      });
      response.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Opening your wallet (fixture)</title></head><body><p id="status">Opening your wallet… (labelled local fixture)</p><script src="/face/handover-page.js"></script></body></html>`,
      );
      return;
    }
    // G8 (r16): the runtime's acceptance page, the same pattern for #offer=.
    if (/^\/face\/accept\/[a-z0-9._-]+\/?$/.test(url.pathname)) {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        "Cache-Control": "no-store",
      });
      response.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Opening your wallet (fixture)</title></head><body><p id="status">Opening your wallet… (labelled local fixture)</p><script src="/face/accept-page.js"></script></body></html>`,
      );
      return;
    }
    if (url.pathname === "/face/accept-page.js") {
      response.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(`(async () => {
        const fragment = new URLSearchParams(location.hash.slice(1));
        history.replaceState(null, "", location.pathname + location.search);
        const offer = fragment.get("offer");
        const status = document.getElementById("status");
        if (!offer) { status.textContent = "This link is incomplete."; return; }
        const answer = await fetch("/api/product-face/v1/accept", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ offer }),
        }).then((r) => r.json()).catch(() => ({}));
        if (!answer.walletEntryUrl || !answer.ticket) { status.textContent = "This link cannot be used."; return; }
        location.replace(answer.walletEntryUrl + "#accept=" + encodeURIComponent(answer.ticket));
      })();`);
      return;
    }
    if (url.pathname === "/face/handover-page.js") {
      response.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(`(async () => {
        const fragment = new URLSearchParams(location.hash.slice(1));
        history.replaceState(null, "", location.pathname + location.search);
        const grant = fragment.get("access");
        const settle = fragment.get("settle");
        const status = document.getElementById("status");
        if (!grant) { status.textContent = "This link is incomplete."; return; }
        const answer = await fetch("/api/product-face/v1/handover", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(settle ? { grant, settle } : { grant }),
        }).then((r) => r.json()).catch(() => ({}));
        if (!answer.walletEntryUrl || !answer.ticket) { status.textContent = "This link cannot be used."; return; }
        location.replace(answer.walletEntryUrl + "#ticket=" + encodeURIComponent(answer.ticket));
      })();`);
      return;
    }
    // A different-origin page used to prove forged messages are ignored.
    if (url.pathname === "/forged/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><script>
        for (const operation of ["programme.registration.authorize", "programme.runtime.authorize"]) {
          window.parent.postMessage({ type: "dual.face.request", protocol: "dual.face.bridge", version: 1,
            request_id: "forged-" + operation, operation, payload: { object_id: "6a00000000000000000000b2", operation_id: "forged-op-0001" } }, "*");
        }
        window.parent.postMessage({ type: "dual.face.ready", protocol: "dual.face.bridge", version: 1, channel_id: "forged", application: {} }, "*");
        document.title = "forged-sent";
      </script>`);
      return;
    }
    const match =
      /^\/face\/([a-z0-9._-]+)\/([0-9A-Za-z.-]+)\/([0-9a-f]{64})\/(.*)$/.exec(
        url.pathname,
      );
    if (match) {
      const [, applicationId, version, hash, rest] = match;
      const manifest = await manifestFor(applicationId, version, hash).catch(
        () => undefined,
      );
      if (!manifest) return send(response, 404, { status: "not_found" });
      const file = rest || "index.html";
      if (file.includes(".."))
        return send(response, 404, { status: "not_found" });
      const bytes = await readFile(
        path.join(ROOT, applicationId, version, hash, file),
      ).catch(() => undefined);
      if (!bytes) return send(response, 404, { status: "not_found" });
      response.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "Content-Security-Policy": `frame-ancestors ${WALLET_ORIGIN}`,
        "Cache-Control": "no-store",
      });
      response.end(bytes);
      return;
    }
    if (
      url.pathname.startsWith("/api/product-face/v1/") &&
      request.method === "POST"
    ) {
      const [entry] = await (async () => {
        const { readdir } = await import("node:fs/promises");
        const found = [];
        for (const app of await readdir(ROOT)) {
          for (const version of await readdir(path.join(ROOT, app))) {
            for (const hash of await readdir(path.join(ROOT, app, version)))
              found.push([app, version, hash]);
          }
        }
        return found;
      })();
      if (!entry)
        return send(response, 503, { status: "face_runtime_unprovisioned" });
      return runtime(request, response, url, await manifestFor(...entry));
    }
    return send(response, 404, { status: "not_found" });
  } catch (error) {
    return send(response, 500, {
      status: "fixture_error",
      message: String(error?.message || error),
    });
  }
});

// IPv4 explicitly: the cloud container has no IPv6, and Chromium reaches
// http://localhost:4101 over 127.0.0.1.
server.listen(PORT, "0.0.0.0");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close());
