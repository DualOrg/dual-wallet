/**
 * @jest-environment node
 */
// Contract r13 successor journey, wallet side. LOCAL FAKES ONLY: fictional
// ids, no network, no credentials.
//
// A Product Passport unit's first holder settle was refused by Dual (the stale
// action number fixed in 38cbcec). Its won reservation was released by a
// reviewed recovery decision (r13), and the brand operator proposed again.
// The holder now opens the product from a NORMAL, FRESH owned-product face
// launch. The runtime's registration.pending.read (as fixed in Studio) answers
// nextStep "settle_on_wallet" with no settleReservation, and the face (1.0.0,
// src/product-face-client.mjs settleOnWallet) settles the ORIGINAL
// registration under a NEW settle operation id:
//   programme.product.select -> programme.product.settle.request ->
//   programme.runtime.authorize registration.settle.verify ->
//   programme.operation.status (confirmWithHost).
//
// What is real here: every wallet BFF route handler (context, selection,
// operations, status, assertions, settle-proposal and the /api/backend
// proxy with its face execution binding), the bridge capabilities
// (resolveProductFaceRequest on a ProductFaceSession), the host client
// services (app/_services/product-face.client), the executor
// (executeInventoryAction) and the generated EbusApi client. The handlers are
// wired as app/_hooks/use-product-face-host.ts wires them.
//
// What is fake, and labelled so:
// - FakeBoundRuntime: the bound Studio product-face runtime, answering as
//   src/product-face-runtime.mjs does (pendingRead, settlePropose,
//   settleReserve, settleVerify, registrations/status). It verifies every
//   wallet assertion it receives (signature, holder, operation, op id,
//   target, request hash, one-time jti). Its settle proposal is the REAL
//   Studio answer recorded in test/fixtures/studio-product-face-conformance.json
//   (only its operation id, proposal id and expiry are this journey's).
// - FakeDual: the Dual API (object reads, ebus prepare/execute). Its readback
//   lags an executed update until index() (eventually consistent history).
//   The host's own client-side reads (programme products, the fresh object
//   and its actions) read it directly, not through /api/backend; ebus
//   prepare/execute do go through the real proxy. The hook's 401 refresh
//   guard is left out.
// - The face: a few lines that make exactly the bridge requests and runtime
//   bodies the face's settleOnWallet / runtimeOperation / confirmWithHost make.
// - The pinned artifact check of the context read (covered elsewhere).
import {
  createHash,
  generateKeyPairSync,
  verify as verifySignature,
} from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ORGANIZATION_ID } from "@/api/tenant";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import { bindingInput } from "@/test/product-face-fixtures";

const getWallet = jest.fn();
const getObjectById = jest.fn();
const getObjectByIdPublic = jest.fn();
const listObjects = jest.fn();
jest.mock("@/api/web-sdk-client", () => {
  const actual = jest.requireActual("@/api/web-sdk-client");
  const { EbusApi } = jest.requireActual("@/api/web-sdk/apis");
  const { Configuration } = jest.requireActual("@/api/web-sdk/runtime");
  return {
    ...actual,
    // LOCAL FAKE Dual reads (server side, and the host's own fresh reads).
    getWalletsApi: () => ({ getWallet, logout: jest.fn() }),
    getObjectsApi: () => ({ getObjectById, getObjectByIdPublic, listObjects }),
    // The REAL generated ebus client exactly as the wallet builds it in a
    // browser (web-sdk-client basePath(): "/api/backend", same-origin, no
    // token). This suite runs in node, where the helper would pick the
    // server base path instead.
    getEbusApi: () =>
      new EbusApi(
        new Configuration({
          basePath: "/api/backend",
          credentials: "same-origin",
        }),
      ),
  };
});
// The pinned artifact itself is verified elsewhere; the context read here
// stands in a verified one.
jest.mock("@/api/face-artifact", () => {
  const actual = jest.requireActual("@/api/face-artifact");
  return { ...actual, verifyFaceArtifact: jest.fn(async () => ({ ok: true })) };
});
// Pass-through: records every assertion the wallet mints.
jest.mock("@/api/face-assertion", () => {
  const actual = jest.requireActual("@/api/face-assertion");
  return { ...actual, mintFaceAssertion: jest.fn(actual.mintFaceAssertion) };
});

import { mintFaceAssertion as mintedAssertions } from "@/api/face-assertion";
import { resetIssueGuard } from "@/api/product-face-operations";
import { establishSession, unsealForPurpose } from "@/api/server-session";
import { POST as backendPOST } from "@/app/api/backend/[...path]/route";
import { POST as assertionsPOST } from "@/app/api/faces/[slug]/assertions/route";
import { GET as contextGET } from "@/app/api/faces/[slug]/context/route";
import { GET as statusGET } from "@/app/api/faces/[slug]/operations/[operationId]/route";
import {
  GET as operationsGET,
  POST as operationsPOST,
} from "@/app/api/faces/[slug]/operations/route";
import { POST as selectionPOST } from "@/app/api/faces/[slug]/selection/route";
import { POST as proposalPOST } from "@/app/api/faces/[slug]/settle-proposal/route";
import type {
  ProductFaceApplication,
  ProductFaceConfirmation,
} from "@/app/_domain/product-face";
import type { ViewerWallet } from "@/app/_domain/wallet";
import {
  ProductFaceSession,
  resolveProductFaceRequest,
  type ProductFaceHandlers,
} from "@/app/_lib/external-face-bridge";
import {
  executeAs,
  executorIdentityOf,
  faceExecutionOf,
} from "@/app/_lib/external-face-bridge/core/executor-identity";
import {
  executeSettleAction,
  listFaceOperations,
  listProgrammeProducts,
  loadProductFaceContext,
  mintFaceAssertion,
  readFaceOperationStatus,
  readProgrammeProduct,
  readProgrammeProductActions,
  readSettleProposal,
  selectProgrammeProduct,
  sha256Hash,
  writeFaceJournal,
} from "@/app/_services/product-face.client";

// ------------------------------------------------------------- fixtures

type Custom = Record<string, unknown>;
interface ConformanceFixture {
  canonicalRegistration: {
    settledStates: string[];
    unconfirmedStates: string[];
  };
  templates: { settle: Record<string, unknown> };
  settle: {
    holder: string;
    fresh: { owner: string; custom: Custom };
    proposal: {
      object_id: string;
      action: string;
      input: { data: { custom: Custom } };
      proposal_hash: string;
    };
  };
}
// Recorded from the REAL Studio runtime (see api/product-face-conformance.test.ts).
const fixture = JSON.parse(
  readFileSync(
    path.join(
      __dirname,
      "../test/fixtures/studio-product-face-conformance.json",
    ),
    "utf8",
  ),
) as ConformanceFixture;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const SLUG = "morrow-home";
const APPLICATION_ID = "tig.passport.morrow-home";
const FACE_ORIGIN = "https://faces.example";
const RUNTIME = `${FACE_ORIGIN}/api/product-face/v1`;
// Fictional, unresolvable: the fake Dual answers it; nothing leaves the test.
const DUAL_API = "https://dual-api.fake.invalid";
const HOLDER = fixture.settle.holder;
const ISSUER = "0x00000000000000000000000000000000000b4a2d";
const UNIT = fixture.settle.proposal.object_id;
const TEMPLATE = String(fixture.settle.proposal.input.data.custom.template_id);
const RECORD_ID = String(fixture.settle.fresh.custom.recordId);
const SETTLED_CUSTOM = fixture.settle.proposal.input.data.custom;
const PENDING_CUSTOM = fixture.settle.fresh.custom;
const WALLET_ID = "wallet-1";

// The journey's ids (the Studio successor journey test uses the same names).
const ORIGINAL = "reg-original-01"; // the original registration operation
const STUCK = "settle-stuck-0001"; // its released settle (r13 reviewed decision)
const FRESH = "settle-fresh-0002"; // the face's NEW settle operation id
const SECOND = "settle-again-0003"; // a second settle while FRESH is submitted
const PSP_STUCK = `psp-${"a1".repeat(12)}`;
const PSP_FRESH = `psp-${"b2".repeat(12)}`;
const POA_STUCK = `poa-${"c3".repeat(16)}`;
const POA_FRESH = `poa-${"d4".repeat(16)}`;
const DUAL_ACTION = "6ad000000000000000000009";
const PENDING_READ = "pending-0f1e2d3c4b5a69788796";

const keys = generateKeyPairSync("ed25519");
const sha = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

// The face's canonical JSON (src/product-face-client.mjs canonical()).
function faceCanonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : faceCanonical(item),
    );
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = faceCanonical(item);
    }
    return out;
  }
  return value;
}
const canonicalJson = (value: unknown) => JSON.stringify(faceCanonical(value));

function claimsOf(assertion: string) {
  return JSON.parse(
    Buffer.from(assertion.split(".")[1], "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ------------------------------------------------------------ fake Dual

/**
 * LOCAL FAKE of the Dual API for this one unit: the authenticated and public
 * object reads, and POST ebus/prepare + ebus/execute as the wallet's proxy
 * forwards them. The wallet has acted before: its CURRENT action number is 9.
 * An executed update is accepted at once but shows in the readback only after
 * index() (Dual's history and readback are eventually consistent).
 */
class FakeDual {
  nonce = 9;
  owner = HOLDER;
  custom: Custom = clone(PENDING_CUSTOM);
  refuseExecute = false;
  private accepted: Custom | undefined;
  readonly ebus: Array<{
    path: string;
    headers: Headers;
    body: Record<string, unknown>;
    status: number;
  }> = [];
  readonly actionLog: Array<{
    id: string;
    account: string;
    name: string;
    objectId: string;
  }> = [];

  read() {
    return {
      id: UNIT,
      templateId: TEMPLATE,
      owner: this.owner,
      custom: clone(this.custom),
      metadata: { name: "Arc grinder" },
      whenModified: new Date("2026-10-14T11:27:27Z"),
    };
  }

  index() {
    if (this.accepted) this.custom = this.accepted;
    this.accepted = undefined;
  }

  settled() {
    const state = this.custom.state;
    const target = (this.custom.lifecycle as Custom | undefined)?.target_state;
    return (
      this.owner === HOLDER &&
      typeof state === "string" &&
      fixture.canonicalRegistration.settledStates.includes(state) &&
      (target === undefined || target === state)
    );
  }

  async fetch(url: string, init: RequestInit) {
    const pathname = new URL(url).pathname;
    const headers = new Headers(init.headers);
    // The proxy forwards the browser's exact body bytes.
    const raw = init.body;
    const body = JSON.parse(
      raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)
        ? new TextDecoder().decode(raw)
        : String(raw ?? "{}"),
    ) as Record<string, unknown>;
    const answer = (status: number, value: Record<string, unknown>) => {
      this.ebus.push({ path: pathname, headers, body, status });
      return json(status, value);
    };
    if (!/^Bearer \S+$/.test(headers.get("authorization") ?? "")) {
      return answer(401, { code: 16, message: "Not signed in" });
    }
    if (pathname === "/ebus/prepare") {
      return answer(200, { nonce: this.nonce, challenge: "AQIDBA" });
    }
    if (pathname === "/ebus/execute") {
      if (this.refuseExecute || body.nonce !== this.nonce) {
        return answer(400, {
          code: 3,
          message: `invalid nonce: expected ${this.nonce}, got ${String(body.nonce)}`,
        });
      }
      const update = (body.action as Custom | undefined)?.update as
        { id?: string; data?: { custom?: Custom } } | undefined;
      if (update?.id !== UNIT || !update.data?.custom) {
        return answer(400, { code: 3, message: "unsupported action" });
      }
      this.accepted = clone(update.data.custom);
      this.nonce += 1;
      this.actionLog.push({
        id: DUAL_ACTION,
        account: HOLDER,
        name: "update",
        objectId: UNIT,
      });
      return answer(200, { action_id: DUAL_ACTION, steps: [] });
    }
    throw new Error(`unexpected Dual request ${pathname}`);
  }
}

// --------------------------------------------------------- fake runtime

const ZERO = {
  writesExecuted: 0,
  dualWritesExecuted: 0,
  providerWritesExecuted: 0,
  unknownWriteOutcomes: 0,
  writeOutcome: "not_dispatched",
};
const refusal = (status: number, code: string, extra: Custom = {}) =>
  json(status, {
    ok: false,
    status: code,
    code,
    ...ZERO,
    blindRetryAllowed: false,
    secretReturned: false,
    ...extra,
  });

interface Reservation {
  proposalId: string;
  settleOperationId: string;
  registrationOperationId: string;
  objectId: string;
  state: "granted" | "action_reported" | "committed" | "released";
  actionId: string | null;
  reservedAt: string;
  supersededCorrelations?: Custom[];
}
interface Proposal {
  proposalId: string;
  operationId: string;
  objectId: string;
  approvalRequestId: string;
  status: "approved" | "committed";
  expiresAt: string;
}
const UNRESOLVED = ["granted", "action_reported", "release_claimed"];

/**
 * LOCAL FAKE of the bound Studio product-face runtime, modelled on
 * src/product-face-runtime.mjs (pendingRead, settlePropose, settleReserve,
 * settleVerify, registrationStatus). Its starting state is the r13 successor:
 * it holds the ORIGINAL registration's journal (the handoff ran: the unit is
 * the holder's, Dual still says Transfer pending); the stuck settle's won
 * reservation is RELEASED (its correlation archived); the brand has proposed
 * again (a fresh open owner-approval request for verify_authenticity).
 */
class FakeBoundRuntime {
  readonly calls: Array<{
    path: string;
    origin: string | null;
    operation?: string;
    operationId?: string;
    input?: Custom;
    claims?: Custom;
    status: number;
    answer: Custom;
  }> = [];
  private readonly jtis = new Set<string>();
  readonly registrations = new Set([ORIGINAL]);
  readonly request = {
    id: POA_FRESH,
    status: "awaiting_owner",
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  };
  readonly proposals = new Map<string, Proposal>();
  readonly proposalIndex = new Map<
    string,
    { operationId: string; objectId: string }
  >();
  reservation: Reservation = {
    proposalId: PSP_STUCK,
    settleOperationId: STUCK,
    registrationOperationId: ORIGINAL,
    objectId: UNIT,
    state: "released",
    actionId: null,
    reservedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
  };

  constructor(private readonly dual: FakeDual) {
    // The released settle's original (now expired) proposal, for the brand's
    // earlier request; the brand's fresh request no longer matches it.
    this.proposals.set(ORIGINAL, {
      proposalId: PSP_STUCK,
      operationId: ORIGINAL,
      objectId: UNIT,
      approvalRequestId: POA_STUCK,
      status: "approved",
      expiresAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    this.proposalIndex.set(PSP_STUCK, {
      operationId: ORIGINAL,
      objectId: UNIT,
    });
  }

  /** The wallet BFF's server-to-server calls (through global fetch). */
  async fetch(url: string, init: RequestInit) {
    const origin = new Headers(init.headers).get("origin");
    const body = JSON.parse(String(init.body)) as Custom;
    return this.handle(new URL(url).pathname, body, origin);
  }

  /** The face frame's own runtime requests (same origin as the face). */
  async fromFace(pathname: string, body: Custom) {
    const response = await this.handle(
      `/api/product-face/v1${pathname}`,
      body,
      FACE_ORIGIN,
    );
    return {
      httpStatus: response.status,
      payload: (await response.json()) as Custom,
    };
  }

  private verify(
    assertion: unknown,
    expected: {
      operation: string;
      opId: string;
      target: Custom;
      requestHash: string;
    },
  ) {
    if (typeof assertion !== "string") return undefined;
    const [header, payload, signature] = assertion.split(".");
    if (
      !signature ||
      !verifySignature(
        null,
        Buffer.from(`${header}.${payload}`),
        keys.publicKey,
        Buffer.from(signature, "base64url"),
      )
    ) {
      return undefined;
    }
    const claims = claimsOf(assertion);
    if (
      claims.aud !== `${APPLICATION_ID}@${FACE_ORIGIN}` ||
      claims.holder !== HOLDER ||
      claims.operation !== expected.operation ||
      claims.op_id !== expected.opId ||
      canonicalJson(claims.target) !== canonicalJson(expected.target) ||
      claims.request_hash !== expected.requestHash ||
      Number(claims.exp) * 1000 <= Date.now() ||
      typeof claims.jti !== "string" ||
      this.jtis.has(claims.jti)
    ) {
      return undefined;
    }
    this.jtis.add(claims.jti);
    return claims;
  }

  private async handle(pathname: string, body: Custom, origin: string | null) {
    const record = (response: Response, extra: Partial<FakeCall> = {}) =>
      response
        .clone()
        .json()
        .then((answer: Custom) => {
          this.calls.push({
            path: pathname,
            origin,
            status: response.status,
            answer,
            ...extra,
          });
          return response;
        });
    if (pathname === "/api/product-face/v1/registrations/status") {
      const operationId = String(body.operationId);
      if (Object.keys(body).sort().join(",") !== "assertion,operationId") {
        return record(refusal(400, "face_request_field_not_accepted"));
      }
      const claims = this.verify(body.assertion, {
        operation: "registration.status",
        opId: operationId,
        target: { object_id: UNIT },
        requestHash: sha(canonicalJson({ operationId })),
      });
      if (!claims) {
        return record(refusal(403, "face_assertion_mismatch"), { operationId });
      }
      if (!this.registrations.has(operationId)) {
        return record(
          json(404, {
            ok: false,
            status: "not_submitted",
            reason: "face_operation_not_found",
            operationId,
            objectId: null,
          }),
          { operationId, claims },
        );
      }
      const status = this.dual.settled()
        ? "registered"
        : "ownership_moved_state_pending";
      return record(
        json(200, {
          ok: status === "registered",
          status,
          operationId,
          objectId: UNIT,
        }),
        { operationId, claims },
      );
    }
    if (pathname !== "/api/product-face/v1/operations") {
      throw new Error(`unexpected runtime request ${pathname}`);
    }
    const operation = String(body.operation);
    const operationId = String(body.operationId);
    const target = body.target as Custom;
    const input = body.input as Custom;
    const requestHash =
      operation === "registration.settle.reserve"
        ? sha(
            canonicalJson({
              proposal_id: input.proposal_id,
              settle_operation_id: operationId,
              object_id: target.object_id,
            }),
          )
        : sha(canonicalJson({ operation, operationId, target, input }));
    const claims = this.verify(body.assertion, {
      operation,
      opId: operationId,
      target,
      requestHash,
    });
    const extra = { operation, operationId, input, claims };
    if (
      Object.keys(body).sort().join(",") !==
        "assertion,input,operation,operationId,target" ||
      !claims
    ) {
      return record(refusal(403, "face_assertion_mismatch"), extra);
    }
    switch (operation) {
      case "registration.pending.read":
        return record(this.pendingRead(), extra);
      case "registration.settle.propose":
        return record(this.settlePropose(operationId), extra);
      case "registration.settle.reserve":
        return record(
          this.settleReserve(operationId, String(input.proposal_id)),
          extra,
        );
      case "registration.settle.verify":
        return record(this.settleVerify(operationId, input), extra);
      default:
        return record(refusal(400, "face_request_invalid"), extra);
    }
  }

  private requestOpen() {
    return (
      this.request.status === "awaiting_owner" &&
      Date.parse(this.request.expiresAt) > Date.now()
    );
  }

  // pendingRead: only an UNRESOLVED reservation is resumed; a released one is
  // closed under its archived correlation (the Studio fix this journey needs).
  private pendingRead() {
    const status = this.dual.settled()
      ? "registered"
      : "ownership_moved_state_pending";
    const settleProposal =
      status === "ownership_moved_state_pending" && this.requestOpen()
        ? {
            status: "proposed",
            requestId: this.request.id,
            expiresAt: this.request.expiresAt,
          }
        : null;
    const reservation =
      this.reservation.registrationOperationId === ORIGINAL &&
      UNRESOLVED.includes(this.reservation.state)
        ? {
            settle_operation_id: this.reservation.settleOperationId,
            state: this.reservation.state,
          }
        : null;
    const nextStep =
      status === "registered"
        ? null
        : reservation
          ? "check_settle_status"
          : settleProposal
            ? "settle_on_wallet"
            : "brand_operator_proposal";
    return json(200, {
      ok: true,
      status,
      reason: null,
      operationId: ORIGINAL,
      objectId: UNIT,
      recordId: RECORD_ID,
      nextStep,
      ...(settleProposal ? { settleProposal } : {}),
      ...(reservation ? { settleReservation: reservation } : {}),
      ...ZERO,
      blindRetryAllowed: false,
      secretReturned: false,
    });
  }

  private settlePropose(operationId: string) {
    if (!this.registrations.has(operationId)) {
      return refusal(404, "face_operation_not_found", {
        reason: "face_operation_not_found",
      });
    }
    if (this.dual.settled()) return refusal(409, "settle_not_required");
    if (!this.requestOpen()) {
      return refusal(409, "settle_proposal_unavailable", {
        reason: "issuer_auto_proposal_used",
        nextStep: "brand_operator_proposal",
      });
    }
    let proposal = this.proposals.get(operationId);
    const live =
      proposal?.approvalRequestId === this.request.id &&
      proposal.status === "approved" &&
      Date.parse(proposal.expiresAt) > Date.now();
    if (!live) {
      // A won reservation is never masked by a fresh proposal (r13).
      if (UNRESOLVED.includes(this.reservation.state)) {
        return refusal(409, "face_settle_reservation_unresolved", {
          nextStep: "check_settle_status",
        });
      }
      proposal = {
        proposalId: PSP_FRESH,
        operationId,
        objectId: UNIT,
        approvalRequestId: this.request.id,
        status: "approved",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      };
      this.proposals.set(operationId, proposal);
      this.proposalIndex.set(PSP_FRESH, { operationId, objectId: UNIT });
    }
    return json(200, {
      ok: true,
      status: "settle_proposed",
      proposal_id: proposal!.proposalId,
      operation_id: proposal!.operationId,
      object_id: proposal!.objectId,
      action: fixture.settle.proposal.action,
      input: clone(fixture.settle.proposal.input),
      proposal_hash: fixture.settle.proposal.proposal_hash,
      expires_at: proposal!.expiresAt,
      ...ZERO,
      secretReturned: false,
    });
  }

  // settleReserve: dispatch "won" ONLY for the call that creates the
  // reservation; a released one is succeeded only by a different proposal
  // AND settle id, never by its own correlation (r11/r13).
  private settleReserve(settleOperationId: string, proposalId: string) {
    const index = this.proposalIndex.get(proposalId);
    if (!index || index.objectId !== UNIT) {
      return refusal(404, "face_settle_proposal_required");
    }
    const existing = this.reservation;
    const sameCorrelation =
      existing.proposalId === proposalId ||
      existing.settleOperationId === settleOperationId ||
      (existing.supersededCorrelations ?? []).some(
        (item) =>
          item.proposal_id === proposalId ||
          item.settle_operation_id === settleOperationId,
      );
    // A committed settle may be succeeded by another correlation; anything
    // unresolved answers with its own claim; a released one never by its own.
    if (
      existing.state === "committed"
        ? sameCorrelation
        : existing.state !== "released"
    ) {
      const same =
        existing.proposalId === proposalId &&
        existing.settleOperationId === settleOperationId;
      return json(409, {
        ok: false,
        status: same ? "already_claimed" : "already_reserved",
        dispatch: "already_claimed",
        executionPermitted: false,
        reservation: this.view(existing),
        nextStep: "check_settle_status",
        ...ZERO,
        blindRetryAllowed: false,
        secretReturned: false,
      });
    }
    if (existing.state === "released" && sameCorrelation) {
      return refusal(409, "face_settle_correlation_retired", {
        reservation: { state: existing.state },
      });
    }
    const proposal = this.proposals.get(index.operationId);
    if (
      !proposal ||
      proposal.proposalId !== proposalId ||
      proposal.status !== "approved" ||
      Date.parse(proposal.expiresAt) <= Date.now()
    ) {
      return refusal(409, "face_settle_proposal_required");
    }
    if (this.dual.settled()) return refusal(409, "settle_not_required");
    this.reservation = {
      proposalId,
      settleOperationId,
      registrationOperationId: index.operationId,
      objectId: UNIT,
      state: "granted",
      actionId: null,
      reservedAt: new Date().toISOString(),
      supersededCorrelations: [
        ...(existing.supersededCorrelations ?? []),
        {
          settle_operation_id: existing.settleOperationId,
          proposal_id: existing.proposalId,
          state: existing.state,
        },
      ],
    };
    return json(200, {
      ok: true,
      status: "granted",
      dispatch: "won",
      executionPermitted: true,
      reservation: this.view(this.reservation),
      ...ZERO,
      secretReturned: false,
    });
  }

  private view(reservation: Reservation) {
    return {
      proposal_id: reservation.proposalId,
      settle_operation_id: reservation.settleOperationId,
      object_id: reservation.objectId,
      operation_id: reservation.registrationOperationId,
      state: reservation.state,
      action_id: reservation.actionId,
      reserved_at: reservation.reservedAt,
    };
  }

  // settleVerify (verifySettleAction): the holder's own Dual action, exactly
  // the persisted proposal, the settled readback; then commit. Zero writes.
  private settleVerify(operationId: string, input: Custom) {
    const pending = (reason: string, status = 202) =>
      json(status, {
        ok: false,
        status: "ownership_moved_state_pending",
        reason,
        operationId,
        objectId: UNIT,
        ...ZERO,
      });
    if (
      Object.keys(input).some(
        (key) =>
          !["action_id", "settle_operation_id", "proposal_id"].includes(key),
      ) ||
      typeof input.action_id !== "string" ||
      typeof input.settle_operation_id !== "string"
    ) {
      return refusal(400, "face_request_invalid");
    }
    const proposal = this.proposals.get(operationId);
    const reservation = this.reservation;
    if (
      !proposal ||
      reservation.proposalId !== proposal.proposalId ||
      reservation.settleOperationId !== input.settle_operation_id ||
      reservation.registrationOperationId !== operationId
    ) {
      return pending("face_settle_reservation_required", 409);
    }
    if (reservation.state === "released") {
      return refusal(409, "face_settle_action_found_after_release");
    }
    const logged = this.dual.actionLog.find(
      (entry) => entry.id === input.action_id,
    );
    if (
      !logged ||
      logged.account !== HOLDER ||
      logged.name !== "update" ||
      logged.objectId !== UNIT
    ) {
      return pending("face_settle_action_not_found");
    }
    if (!this.dual.settled())
      return pending("face_settle_readback_unavailable");
    this.reservation = {
      ...reservation,
      state: "committed",
      actionId: input.action_id,
    };
    this.proposals.set(operationId, { ...proposal, status: "committed" });
    this.request.status = "settled";
    return json(200, {
      ok: true,
      status: "registered",
      reason: null,
      operationId,
      objectId: UNIT,
      ...ZERO,
      settle: {
        actionId: input.action_id,
        executedBy: "holder_wallet",
        runtimeDualWritesExecuted: 0,
      },
    });
  }
}
type FakeCall = FakeBoundRuntime["calls"][number];

// --------------------------------------------------------------- browser

function jwt(claims: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<unknown> },
) => Promise<Response>;

/** The wallet's own same-origin routes a browser request may reach. */
function walletRoute(method: string, pathname: string) {
  const backend = /^\/api\/backend\/(.+)$/.exec(pathname);
  if (backend && method === "POST") {
    return {
      handler: backendPOST as RouteHandler,
      params: { path: backend[1].split("/") },
    };
  }
  const faces = /^\/api\/faces\/([^/]+)(\/.*)$/.exec(pathname);
  if (!faces) return undefined;
  const slug = decodeURIComponent(faces[1]);
  const status = /^\/operations\/([^/]+)$/.exec(faces[2]);
  if (status && method === "GET") {
    return {
      handler: statusGET as RouteHandler,
      params: { slug, operationId: decodeURIComponent(status[1]) },
    };
  }
  const handler = (
    {
      "GET /context": contextGET,
      "POST /selection": selectionPOST,
      "GET /operations": operationsGET,
      "POST /operations": operationsPOST,
      "POST /assertions": assertionsPOST,
      "POST /settle-proposal": proposalPOST,
    } as Record<string, RouteHandler | undefined>
  )[`${method} ${faces[2]}`];
  return handler ? { handler, params: { slug } } : undefined;
}

interface Exchange {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Custom | undefined;
  status: number;
  answer: Custom | null;
}

/**
 * One browser: its cookie jar and one wallet session. Same-origin requests
 * from the host client and the executor reach the REAL route handlers with
 * this jar, as a browser sends them (Origin on a POST, cookies, the
 * request's own headers). Every exchange is logged.
 */
class Browser {
  cookies = new Map<string, string>();
  readonly exchanges: Exchange[] = [];

  constructor() {
    const response = NextResponse.json({});
    establishSession(
      response,
      {
        accessToken: jwt({
          org_id: DEFAULT_ORGANIZATION_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        refreshToken: jwt({ exp: Math.floor(Date.now() / 1000) + 7200 }),
      } as unknown as LoginOut,
      {
        organizationId: DEFAULT_ORGANIZATION_ID,
        subdomain: "*",
        host: "localhost",
      },
      "email",
    );
    this.take(response);
  }

  take(response: Response) {
    for (const cookie of (response as NextResponse).cookies.getAll()) {
      if (cookie.value) this.cookies.set(cookie.name, cookie.value);
      else this.cookies.delete(cookie.name);
    }
  }

  async send(url: string, init: RequestInit = {}) {
    const method = (init.method ?? "GET").toUpperCase();
    const { pathname, search } = new URL(url, "http://localhost");
    const route = walletRoute(method, pathname);
    if (!route) throw new Error(`unexpected wallet route ${method} ${url}`);
    const headers = new Headers(init.headers);
    headers.set("host", "localhost");
    if (method !== "GET") headers.set("origin", "http://localhost");
    headers.set(
      "cookie",
      Array.from(this.cookies, ([name, value]) => `${name}=${value}`).join(
        "; ",
      ),
    );
    const response = await route.handler(
      new NextRequest(`http://localhost${pathname}${search}`, {
        method,
        headers,
        body: init.body ?? undefined,
      }),
      { params: Promise.resolve(route.params) },
    );
    this.take(response);
    this.exchanges.push({
      method,
      path: pathname,
      headers: Object.fromEntries(new Headers(init.headers)),
      body: init.body ? (JSON.parse(String(init.body)) as Custom) : undefined,
      status: response.status,
      answer: (await response
        .clone()
        .json()
        .catch(() => null)) as Custom | null,
    });
    return response;
  }

  /** The journal sealed for one launch, as the BFF wrote it. */
  journal(launchId: string) {
    const sealed = this.cookies.get(`dual_face_launch_${launchId}`);
    if (!sealed) return undefined;
    return unsealForPurpose(`dual-face-journal-v2:${launchId}`, sealed) as {
      entries: Array<Custom>;
      mints: number[];
    };
  }

  launchCookies() {
    return [...this.cookies.keys()].filter((name) =>
      name.startsWith("dual_face_launch_"),
    );
  }
}

// ----------------------------------------------------------------- world

interface World {
  dual: FakeDual;
  runtime: FakeBoundRuntime;
  browser: Browser;
}

let world: World;
const originalFetch = global.fetch;

/** Routes the process's fetch: the browser's same-origin requests, the BFF's
 *  calls to the bound runtime and the proxy's upstream Dual calls. Anything
 *  else fails the test (no network). */
function install(browser: Browser) {
  const dual = new FakeDual();
  const runtime = new FakeBoundRuntime(dual);
  world = { dual, runtime, browser };
  global.fetch = jest.fn(
    async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.startsWith("/")) return world.browser.send(url, init);
      if (url.startsWith(`${RUNTIME}/`)) return world.runtime.fetch(url, init);
      if (url.startsWith(`${DUAL_API}/`)) return world.dual.fetch(url, init);
      throw new Error(`unexpected network request ${url}`);
    },
  ) as unknown as typeof fetch;
  return world;
}

/** A NORMAL face launch: the host reads the context, then starts the bridge
 *  with handlers wired as use-product-face-host.ts wires them. */
async function launch(browser: Browser, launchId: string) {
  world.browser = browser;
  const face = { slug: SLUG, launchId };
  const { application } = (await loadProductFaceContext(face, "/")) as {
    application: ProductFaceApplication;
  };
  const session = new ProductFaceSession(application, HOLDER, "/");
  const viewer = {
    wallet: {
      id: WALLET_ID,
      account: { address: HOLDER },
      controller: null,
    } as unknown as ViewerWallet,
    authenticationMethod: "email" as const,
  };
  const live = () => session.ended === null;
  const confirmations: ProductFaceConfirmation[] = [];
  const notUsed = async (): Promise<never> => {
    throw new Error("not part of this journey");
  };
  const handlers: ProductFaceHandlers = {
    listProducts: ({ templateId, next }) =>
      listProgrammeProducts({ owner: HOLDER, templateId, next }),
    selectProduct: (objectId) => selectProgrammeProduct(face, objectId),
    readProduct: (objectId) => readProgrammeProduct(objectId),
    readActions: (objectId) => readProgrammeProductActions(objectId),
    readAttributes: notUsed,
    readHistory: notUsed,
    readUnit: notUsed,
    journal: (request) =>
      writeFaceJournal(face, request as unknown as Record<string, unknown>),
    operationStatus: (operationId) =>
      readFaceOperationStatus(face, operationId),
    mintAssertion: (request) => mintFaceAssertion(face, request),
    readSettleProposal: (input) => readSettleProposal(face, input),
    executorIdentity: () => executorIdentityOf(viewer),
    executeSettle: ({ operationId, ...input }, as) =>
      executeAs(as, executorIdentityOf(viewer), live(), (identity) =>
        executeSettleAction({
          ...input,
          authenticationMethod: identity.authenticationMethod,
          controllerAddress: identity.controller ?? undefined,
          face: faceExecutionOf({
            face,
            operationId,
            expected: as,
            current: () => executorIdentityOf(viewer),
            live,
          }),
        }),
      ),
    readTransferProposal: notUsed,
    readAcceptOffer: notUsed,
    executeTransfer: notUsed,
    transferProgress: notUsed,
    confirm: async (request) => {
      // The holder confirms the wallet's own native dialog.
      confirmations.push(request);
      return true;
    },
    navigate: () => {},
    sha256: sha256Hash,
  };
  let id = 0;
  const call = (operation: string, payload: unknown = {}) =>
    resolveProductFaceRequest(
      {
        type: "dual.face.request",
        protocol: "dual.face.bridge",
        version: 1,
        request_id: `request-${(id += 1)}`,
        operation,
        payload,
      },
      { session, handlers, events: { contextChanged: jest.fn() } },
    ) as Promise<Custom>;
  // The face's runtimeOperation(): the canonical body's hash, the host's
  // assertion for exactly it, then the face's own request to its runtime.
  const runtimeOperation = async (
    operation: string,
    operationId: string,
    target: Custom,
    input: Custom,
  ) => {
    const body = { operation, operationId, target, input };
    const { assertion } = await call("programme.runtime.authorize", {
      operation,
      operation_id: operationId,
      target,
      request_hash: sha(canonicalJson(body)),
    });
    return world.runtime.fromFace("/operations", { ...body, assertion });
  };
  return { face, application, session, call, runtimeOperation, confirmations };
}
type Host = Awaited<ReturnType<typeof launch>>;

const exchangesTo = (path: string, method = "POST") =>
  world.browser.exchanges.filter(
    (item) => item.method === method && item.path === path,
  );
const facesPath = (rest: string) => `/api/faces/${SLUG}${rest}`;
const minted = () =>
  jest
    .mocked(mintedAssertions)
    .mock.calls.map(([input]) => [input.operation, input.operationId]);
const runtimeCalls = (operation: string) =>
  world.runtime.calls.filter((call) => call.operation === operation);
const everything = () =>
  JSON.stringify({
    exchanges: world.browser.exchanges,
    runtime: world.runtime.calls.map((call) => ({
      ...call,
      claims: undefined,
    })),
    ebus: world.dual.ebus.map((call) => ({
      ...call,
      headers: Object.fromEntries(call.headers),
    })),
  });

// --------------------------------------------------------- the journey

/**
 * The face's home on a fresh launch, then Finish registration with nextStep
 * settle_on_wallet: settleOnWallet() under the NEW settle operation id, the
 * face's registration.settle.verify, and confirmWithHost. Proves points 2-7;
 * the caller proves point 1 first (it differs with and without history).
 */
async function settleOnWallet(host: Host, launchId: string) {
  const { call, runtimeOperation } = host;

  // The face's home: the holder's programme products, the selection and the
  // runtime's pending read for it.
  const { products } = (await call("programme.products.list")) as {
    products: Array<{ object_id: string }>;
  };
  expect(products.map((item) => item.object_id)).toEqual([UNIT]);
  await call("programme.product.select", { object_id: UNIT });
  const pending = await runtimeOperation(
    "registration.pending.read",
    PENDING_READ,
    { object_id: UNIT },
    {},
  );
  expect(pending.httpStatus).toBe(200);
  expect(pending.payload).toMatchObject({
    ok: true,
    operationId: ORIGINAL,
    status: "ownership_moved_state_pending",
    nextStep: "settle_on_wallet",
    settleProposal: { status: "proposed", requestId: POA_FRESH },
  });
  // The released settle is not offered to resume.
  expect(pending.payload).not.toHaveProperty("settleReservation");

  // 5 (rule): before this launch submitted a settle, no verify assertion.
  const early = await call("programme.runtime.authorize", {
    operation: "registration.settle.verify",
    operation_id: ORIGINAL,
    target: { object_id: UNIT },
    request_hash: sha(
      canonicalJson({
        operation: "registration.settle.verify",
        operationId: ORIGINAL,
        target: { object_id: UNIT },
        input: { action_id: DUAL_ACTION, settle_operation_id: FRESH },
      }),
    ),
  }).catch((error: { code?: string }) => error);
  expect(early).toMatchObject({ code: "temporarily_unavailable" });
  expect(exchangesTo(facesPath("/assertions")).at(-1)).toMatchObject({
    status: 409,
    answer: { code: "settle_not_submitted" },
  });

  // settleOnWallet(): select, then settle.request for the ORIGINAL
  // registration under the NEW settle operation id.
  const selected = await call("programme.product.select", { object_id: UNIT });
  const ebusBefore = world.dual.ebus.length;
  const submitted = await call("programme.product.settle.request", {
    context_id: selected.context_id,
    operation_id: ORIGINAL,
    settle_operation_id: FRESH,
  });
  expect(submitted).toEqual({
    status: "submitted",
    settle_operation_id: FRESH,
    action_id: DUAL_ACTION,
  });

  // 2. The host read the brand's FRESH proposal for the ORIGINAL operation
  // itself (server to server) and accepted it; the native confirmation shows
  // the exact decoded change.
  const proposalReads = runtimeCalls("registration.settle.propose");
  expect(proposalReads).toHaveLength(1);
  expect(proposalReads[0]).toMatchObject({
    origin: null,
    operationId: ORIGINAL,
    status: 200,
    answer: {
      status: "settle_proposed",
      proposal_id: PSP_FRESH,
      operation_id: ORIGINAL,
    },
  });
  expect(exchangesTo(facesPath("/settle-proposal"))).toEqual([
    expect.objectContaining({
      body: {
        context_id: selected.context_id,
        operation_id: ORIGINAL,
        object_id: UNIT,
      },
      status: 200,
    }),
  ]);
  expect(host.confirmations).toEqual([
    expect.objectContaining({
      kind: "settle",
      action: "update",
      product: { objectId: UNIT, name: "Arc grinder" },
      changes: expect.arrayContaining([
        expect.objectContaining({
          field: "data.custom.state",
          from: "Transfer pending",
          to: "Authenticity verified",
        }),
      ]),
    }),
  ]);
  // ... recorded as OBSERVED in this launch's journal only: never issued.
  const original = world.browser
    .journal(launchId)!
    .entries.find((entry) => entry.operationId === ORIGINAL);
  expect(original).toMatchObject({
    kind: "registration",
    operation: "registration.submit",
    objectId: UNIT,
    phase: "observed",
  });
  for (const key of ["issuedAt", "requestHash", "recordId", "status"]) {
    expect(original).not.toHaveProperty(key);
  }

  // 3. The NEW settle id began, was confirmed and submitted; the submit
  // reserved it at the runtime, and only that dispatch:"won" let it execute.
  const settleTransitions = exchangesTo(facesPath("/operations"))
    .filter((item) => item.body?.operation_id === FRESH)
    .map((item) => [
      item.body?.transition,
      item.status,
      item.answer?.reservation,
    ]);
  expect(settleTransitions).toEqual([
    ["begin", 200, null],
    ["confirm", 200, null],
    ["submit", 200, "won"],
    ["record_action", 200, null],
  ]);
  expect(
    exchangesTo(facesPath("/operations")).find(
      (item) => item.body?.transition === "begin",
    )?.body,
  ).toEqual({
    transition: "begin",
    kind: "settle",
    operation: "update",
    operation_id: FRESH,
    object_id: UNIT,
    context_id: selected.context_id,
    proposal_id: PSP_FRESH,
  });
  const reserves = runtimeCalls("registration.settle.reserve");
  expect(reserves).toHaveLength(1);
  expect(reserves[0]).toMatchObject({
    origin: null,
    operationId: FRESH,
    input: { proposal_id: PSP_FRESH },
    claims: {
      operation: "registration.settle.reserve",
      op_id: FRESH,
      target: { object_id: UNIT },
    },
    status: 200,
    answer: {
      dispatch: "won",
      executionPermitted: true,
      reservation: {
        settle_operation_id: FRESH,
        proposal_id: PSP_FRESH,
        operation_id: ORIGINAL,
      },
    },
  });
  expect(world.runtime.reservation).toMatchObject({
    settleOperationId: FRESH,
    state: "granted",
    supersededCorrelations: [
      { settle_operation_id: STUCK, proposal_id: PSP_STUCK, state: "released" },
    ],
  });

  // 4. Executed once, as the holder, through the wallet proxy's face
  // execution binding: prepare read the CURRENT action number (9) and execute
  // sent exactly it. No retry.
  const ebus = world.dual.ebus.slice(ebusBefore);
  expect(ebus.map((item) => [item.path, item.status])).toEqual([
    ["/ebus/prepare", 200],
    ["/ebus/execute", 200],
  ]);
  const [prepare, execute] = ebus;
  expect(execute.body.nonce).toBe(9);
  expect(execute.body.action).toEqual(prepare.body.action);
  expect(execute.body).not.toHaveProperty("auth"); // email: custodial
  expect(execute.body.action).toEqual({
    update: { id: UNIT, data: { custom: SETTLED_CUSTOM } },
  });
  expect(world.dual.nonce).toBe(10);
  // Browser -> proxy: each step carried the face binding of THIS launch,
  // operation and wallet; upstream: the session's bearer, no browser cookie,
  // no face header.
  const proxied = world.browser.exchanges.filter((item) =>
    item.path.startsWith("/api/backend/"),
  );
  expect(proxied.map((item) => [item.path, item.status])).toEqual([
    ["/api/backend/ebus/prepare", 200],
    ["/api/backend/ebus/execute", 200],
  ]);
  for (const item of proxied) {
    expect(item.headers).toMatchObject({
      "x-dual-face-launch": launchId,
      "x-dual-face-slug": SLUG,
      "x-dual-face-operation": FRESH,
      "x-dual-face-wallet": WALLET_ID,
    });
  }
  for (const item of ebus) {
    expect(item.headers.get("authorization")).toMatch(/^Bearer /);
    expect(item.headers.has("cookie")).toBe(false);
    expect(item.headers.has("x-dual-face-operation")).toBe(false);
  }
  expect(
    world.browser
      .journal(launchId)!
      .entries.find((entry) => entry.operationId === FRESH),
  ).toMatchObject({
    kind: "settle",
    phase: "submitted",
    dispatch: "won",
    proposalId: PSP_FRESH,
    actionId: DUAL_ACTION,
  });

  // Dual accepted the update; its readback has not caught up yet. The host
  // does not claim registered from the observed entry before it does.
  expect(
    await call("programme.operation.status", { operation_id: ORIGINAL }),
  ).toEqual({
    operation_id: ORIGINAL,
    status: "ownership_moved_state_pending",
    object_id: UNIT,
    readback: { owner_is_you: true, state: "Transfer pending" },
  });

  // 7. A second settle while the new one is submitted (a double tap): the
  // BFF refuses its begin (operation_conflict) before any reserve or execute.
  const reselected = await call("programme.product.select", {
    object_id: UNIT,
  });
  const second = await call("programme.product.settle.request", {
    context_id: reselected.context_id,
    operation_id: ORIGINAL,
    settle_operation_id: SECOND,
  }).catch((error: { code?: string; retryable?: boolean }) => error);
  // The bridge has no face code for operation_conflict (it is not one of
  // settle.request's contract errors): the face reads it as
  // temporarily_unavailable. Nothing was reserved or executed for it.
  expect(second).toMatchObject({ code: "temporarily_unavailable" });
  expect(
    exchangesTo(facesPath("/operations"))
      .filter((item) => item.body?.operation_id === SECOND)
      .map((item) => [item.body?.transition, item.status, item.answer?.code]),
  ).toEqual([["begin", 409, "operation_conflict"]]);
  expect(runtimeCalls("registration.settle.reserve")).toHaveLength(1);
  expect(world.dual.ebus.slice(ebusBefore)).toHaveLength(2);

  // 5. The face's registration.settle.verify for the ORIGINAL operation and
  // the NEW settle: the host mints it (a submitted settle of this unit), and
  // the runtime verifies the holder's own action against the readback.
  world.dual.index();
  const verified = await runtimeOperation(
    "registration.settle.verify",
    ORIGINAL,
    { object_id: UNIT },
    { action_id: DUAL_ACTION, settle_operation_id: FRESH },
  );
  const verifyCall = runtimeCalls("registration.settle.verify")[0];
  expect(verifyCall).toMatchObject({
    origin: FACE_ORIGIN,
    operationId: ORIGINAL,
    claims: {
      operation: "registration.settle.verify",
      op_id: ORIGINAL,
      holder: HOLDER,
      sub: WALLET_ID,
      target: { object_id: UNIT },
      request_hash: sha(
        canonicalJson({
          operation: "registration.settle.verify",
          operationId: ORIGINAL,
          target: { object_id: UNIT },
          input: { action_id: DUAL_ACTION, settle_operation_id: FRESH },
        }),
      ),
    },
  });
  expect(verified).toMatchObject({
    httpStatus: 200,
    payload: {
      status: "registered",
      operationId: ORIGINAL,
      settle: { actionId: DUAL_ACTION, executedBy: "holder_wallet" },
    },
  });
  expect(world.runtime.reservation).toMatchObject({
    settleOperationId: FRESH,
    state: "committed",
    actionId: DUAL_ACTION,
  });

  // 6. confirmWithHost: the ORIGINAL operation reads its observed entry
  // against the settled readback and is registered.
  expect(
    await call("programme.operation.status", { operation_id: ORIGINAL }),
  ).toEqual({
    operation_id: ORIGINAL,
    status: "registered",
    object_id: UNIT,
    readback: { owner_is_you: true, state: "Authenticity verified" },
  });
  expect(
    world.browser
      .journal(launchId)!
      .entries.find((entry) => entry.operationId === ORIGINAL),
  ).toMatchObject({ phase: "settled", status: "registered" });

  // 7. Negative guards over the whole journey.
  // - The released settle id never reached any route, runtime call or Dual
  //   request from this launch, and is in no journal entry.
  expect(everything()).not.toContain(STUCK);
  expect(everything()).not.toContain(PSP_STUCK);
  expect(
    world.browser.journal(launchId)!.entries.map((entry) => entry.operationId),
  ).not.toContain(STUCK);
  // - Exactly one reserve and one execute in total, both for FRESH.
  expect(runtimeCalls("registration.settle.reserve")).toHaveLength(1);
  expect(
    world.dual.ebus.filter((item) => item.path === "/ebus/execute"),
  ).toHaveLength(1);
  // - Nothing written for the original registration: no registration begin
  //   or submit, no registration.submit or registration.status assertion
  //   from this launch, no registration request to the runtime. The only
  //   assertions naming it are the host's own proposal reads and the face's
  //   settle verify (bound to this launch's submitted settle).
  expect(
    exchangesTo(facesPath("/operations")).filter(
      (item) => item.body?.kind === "registration",
    ),
  ).toEqual([]);
  expect(
    world.runtime.calls.filter((item) => item.path.endsWith("/registrations")),
  ).toEqual([]);
  return { selected };
}

// ------------------------------------------------------------------ setup

beforeEach(() => {
  process.env.PRODUCT_FACE_APPLICATIONS = JSON.stringify([
    bindingInput({
      templateIds: [TEMPLATE],
      canonicalRegistration: fixture.canonicalRegistration,
      settle: fixture.templates.settle,
    }),
  ]);
  process.env.FACE_ASSERTION_KEY_ID = "wallet-face-test";
  process.env.FACE_ASSERTION_SIGNING_KEY = keys.privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  process.env.API_URL = DUAL_API;
  resetIssueGuard();
  jest.mocked(mintedAssertions).mockClear();
  getWallet.mockReset().mockResolvedValue({
    id: WALLET_ID,
    language: "en",
    fqdn: "localhost",
    activated: true,
    emailVerified: true,
    disabled: false,
    account: {
      address: HOLDER,
      type: "SMART_WALLET",
      controller: {
        address: "0xcontroller",
        type: "SECP256K1",
        custody: "custodial",
      },
      smartAccount: {},
    },
    whenCreated: new Date(),
    whenModified: new Date(),
  });
  // LOCAL FAKE Dual reads, all from the one fake unit.
  getObjectById.mockReset().mockImplementation(async () => world.dual.read());
  getObjectByIdPublic
    .mockReset()
    .mockImplementation(async () => world.dual.read());
  listObjects
    .mockReset()
    .mockImplementation(
      async (query: {
        id?: string;
        owner?: string;
        templateId?: string;
        actions?: boolean;
      }) => {
        const object = world.dual.read();
        if (query.actions) {
          return {
            objects: [object],
            actions: [
              { templateId: TEMPLATE, actions: ["update", "transfer"] },
            ],
          };
        }
        return {
          objects:
            query.templateId === TEMPLATE &&
            query.owner?.toLowerCase() === object.owner
              ? [object]
              : [],
        };
      },
    );
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.PRODUCT_FACE_APPLICATIONS;
  delete process.env.FACE_ASSERTION_KEY_ID;
  delete process.env.FACE_ASSERTION_SIGNING_KEY;
  delete process.env.API_URL;
});

// ------------------------------------------------------------------ tests

const FRESH_LAUNCH = `launch-${"f".repeat(28)}`;

describe("r13 successor: a fresh launch settles the ORIGINAL registration under a NEW settle id", () => {
  it("with NO journal and NO sealed history of the original registration (evicted, another device, signed in again)", async () => {
    // A new session in a browser holding no face launch journal at all.
    const browser = new Browser();
    install(browser);
    const host = await launch(browser, FRESH_LAUNCH);
    // A normal fresh launch: its own (empty) journal is the only one.
    expect(await listFaceOperations(host.face)).toEqual([]);
    expect(browser.launchCookies()).toEqual([
      `dual_face_launch_${FRESH_LAUNCH}`,
    ]);
    expect(browser.journal(FRESH_LAUNCH)).toMatchObject({
      entries: [],
      mints: [],
    });

    // 1. Before anything: the host knows nothing of the original operation
    // (404 unknown_operation), so the bridge answers outcome_unknown with no
    // unit. The face's checkStatus() cannot go on from there (it needs the
    // unit for its registration.status read).
    expect(
      await host.call("programme.operation.status", { operation_id: ORIGINAL }),
    ).toEqual({
      operation_id: ORIGINAL,
      status: "outcome_unknown",
      object_id: null,
      readback: null,
    });
    expect(exchangesTo(facesPath(`/operations/${ORIGINAL}`), "GET")).toEqual([
      expect.objectContaining({
        status: 404,
        answer: expect.objectContaining({ code: "unknown_operation" }),
      }),
    ]);
    // ... and with the unit named, its read-only registration.status
    // assertion is refused: no history, no entry.
    await expect(
      host.call("programme.runtime.authorize", {
        operation: "registration.status",
        operation_id: ORIGINAL,
        target: { object_id: UNIT },
        request_hash: sha(canonicalJson({ operationId: ORIGINAL })),
      }),
    ).rejects.toMatchObject({ code: "unknown_operation" });
    expect(exchangesTo(facesPath("/assertions")).at(-1)).toMatchObject({
      status: 404,
      answer: { code: "unknown_operation" },
    });
    // Nothing was minted for it and the runtime was not asked.
    expect(minted()).toEqual([]);
    expect(browser.journal(FRESH_LAUNCH)?.mints).toEqual([]);
    expect(world.runtime.calls).toEqual([]);

    await settleOnWallet(host, FRESH_LAUNCH);

    // 2/7. Every assertion this journey minted, in order: none is a
    // registration.submit or registration.status, and none names the stuck
    // settle.
    expect(minted()).toEqual([
      ["registration.pending.read", PENDING_READ],
      ["registration.settle.propose", ORIGINAL],
      ["registration.settle.reserve", FRESH],
      ["registration.settle.propose", ORIGINAL],
      ["registration.settle.verify", ORIGINAL],
    ]);
    // A registration under the original id cannot even begin or be minted
    // from this launch.
    await expect(
      writeFaceJournal(host.face, {
        transition: "begin",
        kind: "registration",
        operation: "registration.submit",
        operation_id: ORIGINAL,
        object_id: UNIT,
        record_id: RECORD_ID,
        request_hash: sha("any"),
      }),
    ).rejects.toMatchObject({ code: "already_registered_to_you" });
    await expect(
      mintFaceAssertion(host.face, {
        operation: "registration.submit",
        operation_id: ORIGINAL,
        target: { object_id: UNIT },
        request_hash: sha("any"),
      }),
    ).rejects.toMatchObject({ code: "operation_conflict" });
    expect(
      minted().filter(([operation]) => operation === "registration.submit"),
    ).toEqual([]);
  });

  it("with the original launch's sealed history present (recovered): the same path settles it, and that history stays as it was", async () => {
    const issuer = new Browser();
    install(issuer);
    // The original registration, issued by an earlier session's launch while
    // the unit was still the brand's.
    world.dual.owner = ISSUER;
    world.dual.custom = { ...clone(PENDING_CUSTOM), state: "Registered" };
    const earlier = { slug: SLUG, launchId: `launch-${"e".repeat(28)}` };
    await loadProductFaceContext(earlier, "/");
    const requestHash = sha("the face's exact registrations body");
    await writeFaceJournal(earlier, {
      transition: "begin",
      kind: "registration",
      operation: "registration.submit",
      operation_id: ORIGINAL,
      object_id: UNIT,
      record_id: RECORD_ID,
      request_hash: requestHash,
    });
    await writeFaceJournal(earlier, {
      transition: "confirm",
      operation_id: ORIGINAL,
    });
    await mintFaceAssertion(earlier, {
      operation: "registration.submit",
      operation_id: ORIGINAL,
      target: { object_id: UNIT },
      request_hash: requestHash,
    });
    const evidenceName = `dual_face_launch_${earlier.launchId}`;
    const evidence = issuer.cookies.get(evidenceName)!;
    expect(issuer.journal(earlier.launchId)?.entries).toEqual([
      expect.objectContaining({
        operationId: ORIGINAL,
        phase: "assertion_issued",
      }),
    ]);
    // The runtime ran it: the unit is the holder's, Dual says Transfer
    // pending; its first settle was refused, reserved, then released (r13).
    world.dual.owner = HOLDER;
    world.dual.custom = clone(PENDING_CUSTOM);
    jest.mocked(mintedAssertions).mockClear();

    // The same wallet signs in again (a new session) and opens a fresh launch;
    // the browser kept the original launch's sealed journal.
    const browser = new Browser();
    browser.cookies.set(evidenceName, evidence);
    const host = await launch(browser, FRESH_LAUNCH);
    expect(await listFaceOperations(host.face)).toEqual([]);

    // 1 (recovered). The host reconciles the original operation read-only
    // from that history: its own registration.status read of the runtime,
    // the readback pending.
    expect(
      await host.call("programme.operation.status", { operation_id: ORIGINAL }),
    ).toEqual({
      operation_id: ORIGINAL,
      status: "ownership_moved_state_pending",
      object_id: UNIT,
      readback: { owner_is_you: true, state: "Transfer pending" },
    });
    expect(world.runtime.calls).toEqual([
      expect.objectContaining({
        path: "/api/product-face/v1/registrations/status",
        origin: null,
        operationId: ORIGINAL,
        status: 200,
        answer: expect.objectContaining({
          status: "ownership_moved_state_pending",
        }),
      }),
    ]);
    // The face's own read-only status assertion follows it (07315e4).
    const { assertion } = await host.call("programme.runtime.authorize", {
      operation: "registration.status",
      operation_id: ORIGINAL,
      target: { object_id: UNIT },
      request_hash: sha(canonicalJson({ operationId: ORIGINAL })),
    });
    expect(claimsOf(String(assertion))).toMatchObject({
      operation: "registration.status",
      op_id: ORIGINAL,
    });

    await settleOnWallet(host, FRESH_LAUNCH);

    // The recovered history was read, never rewritten.
    expect(browser.cookies.get(evidenceName)).toBe(evidence);
    expect(
      minted().filter(([operation]) => operation === "registration.submit"),
    ).toEqual([]);
    // A registration under the original id cannot begin again here either.
    await expect(
      writeFaceJournal(host.face, {
        transition: "begin",
        kind: "registration",
        operation: "registration.submit",
        operation_id: ORIGINAL,
        object_id: UNIT,
        record_id: RECORD_ID,
        request_hash: requestHash,
      }),
    ).rejects.toMatchObject({ code: "already_registered_to_you" });
  });
});

describe("r13 successor: what the new settle never does", () => {
  async function freshLaunchSelected(dualRefuses: boolean) {
    const browser = new Browser();
    install(browser);
    world.dual.refuseExecute = dualRefuses;
    const host = await launch(browser, FRESH_LAUNCH);
    const selected = await host.call("programme.product.select", {
      object_id: UNIT,
    });
    return { browser, host, selected };
  }

  it("a refused execute is outcome_unknown: one prepare, one execute, never re-executed or re-reserved", async () => {
    const { host, selected } = await freshLaunchSelected(true);
    await expect(
      host.call("programme.product.settle.request", {
        context_id: selected.context_id,
        operation_id: ORIGINAL,
        settle_operation_id: FRESH,
      }),
    ).rejects.toMatchObject({ code: "outcome_unknown" });
    expect(
      world.dual.ebus.map((item) => [item.path, item.status, item.body.nonce]),
    ).toEqual([
      ["/ebus/prepare", 200, undefined],
      ["/ebus/execute", 400, 9],
    ]);
    // The settle stays submitted under its own correlation, no action.
    expect(
      world.browser
        .journal(FRESH_LAUNCH)!
        .entries.find((entry) => entry.operationId === FRESH),
    ).toMatchObject({ phase: "submitted", dispatch: "won" });
    expect(
      world.browser
        .journal(FRESH_LAUNCH)!
        .entries.find((entry) => entry.operationId === FRESH),
    ).not.toHaveProperty("actionId");

    // The face asks again: the same id is outcome_unknown (never begun
    // again), a new id is refused (operation_conflict at the BFF).
    const again = await host.call("programme.product.select", {
      object_id: UNIT,
    });
    await expect(
      host.call("programme.product.settle.request", {
        context_id: again.context_id,
        operation_id: ORIGINAL,
        settle_operation_id: FRESH,
      }),
    ).rejects.toMatchObject({ code: "outcome_unknown" });
    await expect(
      host.call("programme.product.settle.request", {
        context_id: again.context_id,
        operation_id: ORIGINAL,
        settle_operation_id: SECOND,
      }),
    ).rejects.toMatchObject({ code: "temporarily_unavailable" });
    expect(
      exchangesTo(facesPath("/operations"))
        .filter((item) => item.body?.transition === "begin")
        .map((item) => [
          item.body?.operation_id,
          item.status,
          item.answer?.code,
        ]),
    ).toEqual([
      [FRESH, 200, undefined],
      [FRESH, 409, "operation_already_submitted"],
      [SECOND, 409, "operation_conflict"],
    ]);
    expect(runtimeCalls("registration.settle.reserve")).toHaveLength(1);
    expect(world.dual.ebus).toHaveLength(2);
    // Nothing changed on Dual: the original registration stays pending.
    expect(
      await host.call("programme.operation.status", { operation_id: ORIGINAL }),
    ).toMatchObject({ status: "ownership_moved_state_pending" });
  });

  it("defence in depth: a stale request naming the RELEASED settle id is refused by the runtime (retired correlation) and executes nothing", async () => {
    const { host, selected } = await freshLaunchSelected(false);
    await expect(
      host.call("programme.product.settle.request", {
        context_id: selected.context_id,
        operation_id: ORIGINAL,
        settle_operation_id: STUCK,
      }),
    ).rejects.toMatchObject({ code: "outcome_unknown" });
    expect(runtimeCalls("registration.settle.reserve")).toEqual([
      expect.objectContaining({
        operationId: STUCK,
        status: 409,
        answer: expect.objectContaining({
          status: "face_settle_correlation_retired",
        }),
      }),
    ]);
    expect(world.dual.ebus).toEqual([]);
    expect(world.runtime.reservation).toMatchObject({
      settleOperationId: STUCK,
      state: "released",
    });
  });
});
