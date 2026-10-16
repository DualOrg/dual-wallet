/**
 * @jest-environment node
 */
// Two complete branded apps on ONE engine: Morrow Home (the reference brand)
// and Tidewell (the second brand), each with every journey. The two
// deployments differ only by environment: WALLET_HOST_CONFIGURATION and its
// pin (with the build's record of it and of its registry),
// NEXT_PUBLIC_APP_URL, PRODUCT_FACE_APPLICATIONS, and each host's own
// SESSION_SECRET, FACE_ASSERTION_SIGNING_KEY and FACE_ASSERTION_KEY_ID.
//
// What is real: every wallet BFF route handler the journeys use (session,
// host readback, context, handover, selection, operations and status,
// assertions, settle-proposal, transfer-proposal, transfer-progress,
// accept-offer, and the /api/backend proxy with its face execution binding)
// and the request proxy, each under the brand's own host configuration.
//
// What is fake, and labelled so (LOCAL FAKES ONLY: fictional ids, origins,
// accounts and keys; nothing leaves the test):
// - FakeDual: Dual's object reads and ebus prepare/execute, per account.
// - BrandRuntime: each brand's own Passport runtime and its own linked
//   Warranty runtime. Each checks every assertion as the Studio runtimes do,
//   against ITS host's public key and key id, issuer, audience, face,
//   programme, holder, operation, target, request hash, expiry and one-time
//   jti, so an assertion of the other brand's host is refused.
// - The face: the bridge requests and runtime bodies it makes (journal
//   transitions, assertion requests and its own runtime calls).
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ResponseError } from "@/api/web-sdk/runtime";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import { canonicalJson } from "@/app/_domain/product-face";
import { edit, TEMPLATE_A, TEMPLATE_B } from "@/test/product-face-fixtures";
import {
  applyHostEnvironment,
  clearHostEnvironment,
  hostEnvironment,
  LINKED_WARRANTY,
  MORROW_ORGANIZATION,
  MORROW_ORIGIN,
  morrowBinding,
  morrowDocument,
  registryWithBothFullFaces,
  TIDEWELL_ORGANIZATION,
  TIDEWELL_ORIGIN,
  TIDEWELL_WARRANTY,
  tidewellFullBinding,
  tidewellFullDocument,
  type HostDocument,
} from "@/test/wallet-host-fixtures";

const getWallet = jest.fn();
const getObjectById = jest.fn();
const getObjectByIdPublic = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  ...jest.requireActual("@/api/web-sdk-client"),
  // LOCAL FAKE Dual reads, answered per access token (one per account).
  getWalletsApi: (token?: string) => ({
    getWallet: () => getWallet(token),
    logout: jest.fn(),
  }),
  getObjectsApi: (token?: string) => ({
    getObjectById: (request: { objectId: string }) =>
      getObjectById(token, request.objectId),
    getObjectByIdPublic: (request: { objectId: string }) =>
      getObjectByIdPublic(request.objectId),
  }),
}));
// The pinned artifact itself is verified in api/face-artifact.test.ts.
jest.mock("@/api/face-artifact", () => ({
  ...jest.requireActual("@/api/face-artifact"),
  verifyFaceArtifact: async () => ({ ok: true }),
}));
// Pass-through: records every assertion either host mints.
const minted = jest.fn();
jest.mock("@/api/face-assertion", () => {
  const actual = jest.requireActual("@/api/face-assertion");
  return {
    ...actual,
    mintFaceAssertion: (...args: unknown[]) => {
      minted(...args);
      return actual.mintFaceAssertion(...args);
    },
  };
});

import { FACE_ACCEPTANCE_COOKIE } from "@/api/face-acceptance";
import { resetIssueGuard } from "@/api/product-face-operations";
import { productFaceEntries } from "@/api/product-face-registry";
import { establishSession } from "@/api/server-session";
import { resetWalletHostCache } from "@/api/wallet-host";
import { POST as backendPOST } from "@/app/api/backend/[...path]/route";
import { POST as acceptOfferPOST } from "@/app/api/faces/[slug]/accept-offer/route";
import { POST as assertionsPOST } from "@/app/api/faces/[slug]/assertions/route";
import { GET as contextGET } from "@/app/api/faces/[slug]/context/route";
import { POST as handoverPOST } from "@/app/api/faces/[slug]/handover/route";
import { GET as statusGET } from "@/app/api/faces/[slug]/operations/[operationId]/route";
import {
  GET as operationsGET,
  POST as operationsPOST,
} from "@/app/api/faces/[slug]/operations/route";
import { POST as selectionPOST } from "@/app/api/faces/[slug]/selection/route";
import { POST as settleProposalPOST } from "@/app/api/faces/[slug]/settle-proposal/route";
import { POST as transferProgressPOST } from "@/app/api/faces/[slug]/transfer-progress/route";
import { POST as transferProposalPOST } from "@/app/api/faces/[slug]/transfer-proposal/route";
import { GET as readbackGET } from "@/app/api/host/configuration/route";
import { GET as sessionGET } from "@/app/api/session/route";
import { proxy } from "@/proxy";

// ------------------------------------------------------------- the brands

type Json = Record<string, unknown>;
type RuntimeKind = "passport" | "warranty";

interface Party {
  walletId: string;
  address: string;
}

interface Address {
  origin: string;
  host: string;
}

interface Brand extends Address {
  label: string;
  /** Short, for operation ids. */
  tag: string;
  brandId: string;
  document: () => HostDocument;
  organizationId: string;
  slug: string;
  applicationId: string;
  programmeId: string;
  faceOrigin: string;
  warranty: { applicationId: string; origin: string };
  templateId: string;
  issuer: string;
  holder: Party;
  recipient: Party;
  unit: { id: string; recordId: string; name: string };
  cases: [string, string];
  // This host's own secrets: never another host's, never Studio's.
  sessionSecret: string;
  kid: string;
  keys: { publicKey: KeyObject; privateKey: KeyObject };
}

const hostSecrets = (kid: string) => ({
  kid,
  sessionSecret: randomBytes(32).toString("base64"),
  keys: generateKeyPairSync("ed25519"),
});

const MORROW: Brand = {
  label: "Morrow Home",
  tag: "mh",
  brandId: "morrow-home",
  document: morrowDocument,
  origin: MORROW_ORIGIN,
  host: new URL(MORROW_ORIGIN).host,
  organizationId: MORROW_ORGANIZATION,
  slug: "morrow-home",
  applicationId: "tig.passport.morrow-home",
  programmeId: "morrow-home-arc",
  faceOrigin: "https://faces.example",
  warranty: LINKED_WARRANTY,
  templateId: TEMPLATE_A,
  issuer: "0x00000000000000000000000000000000000155a1",
  holder: {
    walletId: "wallet-morrow-holder",
    address: "0x000000000000000000000000000000000000a101",
  },
  recipient: {
    walletId: "wallet-morrow-recipient",
    address: "0x000000000000000000000000000000000000a102",
  },
  unit: {
    id: "aaaaaaaaaaaaaaaaaaaaaa01",
    recordId: "rec-morrow-0001",
    name: "Arc grinder",
  },
  cases: ["case-morrow-0001", "case-morrow-0002"],
  ...hostSecrets("wallet-face-morrow-1"),
};

const TIDEWELL: Brand = {
  label: "Tidewell",
  tag: "tw",
  brandId: "tidewell",
  document: tidewellFullDocument,
  origin: TIDEWELL_ORIGIN,
  host: new URL(TIDEWELL_ORIGIN).host,
  organizationId: TIDEWELL_ORGANIZATION,
  slug: "tidewell-care",
  applicationId: "tig.passport.tidewell",
  programmeId: "tidewell-kettle",
  faceOrigin: "https://faces.tidewell.example",
  warranty: TIDEWELL_WARRANTY,
  templateId: TEMPLATE_B,
  issuer: "0x00000000000000000000000000000000000155b2",
  holder: {
    walletId: "wallet-tidewell-holder",
    address: "0x000000000000000000000000000000000000b201",
  },
  recipient: {
    walletId: "wallet-tidewell-recipient",
    address: "0x000000000000000000000000000000000000b202",
  },
  unit: {
    id: "bbbbbbbbbbbbbbbbbbbbbb02",
    recordId: "rec-tidewell-0001",
    name: "Pour-over kettle",
  },
  cases: ["case-tidewell-0001", "case-tidewell-0002"],
  ...hostSecrets("wallet-face-tidewell-1"),
};

const BRANDS = [MORROW, TIDEWELL];

// ---------------------------------------------------------------- helpers

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const sha = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const sha256Hex = (value: string) =>
  createHash("sha256").update(value).digest("hex");
/** The runtime request hash: the canonical body without its assertion. */
const hashOf = (
  operation: string,
  operationId: string,
  target: Json,
  input: Json,
) => sha(canonicalJson({ operation, operationId, target, input }));
const decode = (part: string) =>
  JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Json;
const headerOf = (assertion: string) => decode(assertion.split(".")[0]);
const claimsOf = (assertion: string) => decode(assertion.split(".")[1]);
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function jwt(claims: Json) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

/** The test's clock: assertions live sixty seconds, journeys take longer. */
let clock = Date.now();
const advance = () => {
  clock += 61_000;
};

// --------------------------------------------------------------- fake Dual

interface Unit {
  id: string;
  templateId: string;
  owner: string;
  custom: Json;
  name: string;
}

function walletDto(party: Party) {
  return {
    id: party.walletId,
    language: "en",
    fqdn: "wallet",
    activated: true,
    emailVerified: true,
    disabled: false,
    account: {
      address: party.address,
      type: "SMART_WALLET",
      controller: {
        address: `0x${"c".repeat(40)}`,
        type: "SECP256K1",
        custody: "custodial",
      },
      smartAccount: {},
    },
    whenCreated: new Date("2026-01-01T00:00:00Z"),
    whenModified: new Date("2026-01-01T00:00:00Z"),
  };
}

/**
 * LOCAL FAKE of the Dual API: both brands' units and accounts, the object
 * reads, and POST ebus/prepare + ebus/execute as the wallet's proxy forwards
 * them (an update replaces the custom map; a transfer moves custody), each
 * only for the unit's own holder.
 */
class FakeDual {
  readonly units = new Map<string, Unit>();
  readonly executed: Array<{
    actionId: string;
    account: string;
    objectId: string;
    name: "update" | "transfer";
    to?: string;
  }> = [];
  readonly ebus: Array<{ path: string; account: string }> = [];
  private readonly parties = new Map<string, Party>();
  private readonly nonces = new Map<string, number>();

  constructor(brands: Brand[]) {
    for (const brand of brands) {
      this.units.set(brand.unit.id, {
        id: brand.unit.id,
        templateId: brand.templateId,
        owner: brand.issuer,
        custom: { recordId: brand.unit.recordId, state: "Issued" },
        name: brand.unit.name,
      });
      for (const party of [brand.holder, brand.recipient]) {
        this.parties.set(party.walletId, party);
      }
    }
  }

  private partyOf(token: string | undefined) {
    const sub = token ? decode(token.split(".")[1] ?? "").sub : undefined;
    return typeof sub === "string" ? this.parties.get(sub) : undefined;
  }

  wallet(token: string | undefined) {
    const party = this.partyOf(token);
    if (!party) throw new ResponseError(new Response(null, { status: 401 }));
    return walletDto(party);
  }

  object(objectId: string) {
    const unit = this.units.get(objectId);
    if (!unit) throw new ResponseError(new Response(null, { status: 404 }));
    return {
      id: unit.id,
      templateId: unit.templateId,
      owner: unit.owner,
      custom: clone(unit.custom),
      metadata: { name: unit.name },
      whenModified: new Date("2026-10-01T00:00:00Z"),
    };
  }

  /** Registered: held by `holder`, in a settled state with its lifecycle agreeing. */
  settled(objectId: string, holder: string) {
    const unit = this.units.get(objectId);
    const lifecycle = unit?.custom.lifecycle as Json | undefined;
    return (
      unit?.owner === holder &&
      unit.custom.state === "Authenticity verified" &&
      lifecycle?.target_state === unit.custom.state
    );
  }

  async fetch(url: string, init: RequestInit) {
    const { pathname } = new URL(url);
    const authorization = new Headers(init.headers).get("authorization") ?? "";
    const party = this.partyOf(/^Bearer (\S+)$/.exec(authorization)?.[1]);
    if (!party) return json(401, { code: 16, message: "Not signed in" });
    this.ebus.push({ path: pathname, account: party.address });
    const body = JSON.parse(
      Buffer.from(init.body as ArrayBuffer).toString("utf8"),
    ) as Json;
    const nonce = this.nonces.get(party.walletId) ?? 1;
    if (pathname === "/ebus/prepare") {
      return json(200, { nonce, challenge: "AQID" });
    }
    if (pathname !== "/ebus/execute" || body.nonce !== nonce) {
      return json(400, { code: 3, message: "refused" });
    }
    const action = body.action as Json;
    const update = action.update as
      { id: string; custom?: Json; data?: { custom: Json } } | undefined;
    const transfer = action.transfer as { id: string; to: string } | undefined;
    const unit = this.units.get((update ?? transfer)?.id ?? "");
    if (!unit || unit.owner !== party.address) {
      return json(403, { code: 7, message: "not the holder" });
    }
    if (update) unit.custom = clone(update.data?.custom ?? update.custom ?? {});
    else if (transfer) unit.owner = transfer.to;
    this.nonces.set(party.walletId, nonce + 1);
    const actionId = `dual-action-${this.executed.length + 1}`;
    this.executed.push({
      actionId,
      account: party.address,
      objectId: unit.id,
      name: update ? "update" : "transfer",
      ...(transfer ? { to: transfer.to } : {}),
    });
    return json(200, { action_id: actionId, steps: [] });
  }
}

// ------------------------------------------------------- fake runtimes

interface Offer {
  offerId: string;
  objectId: string;
  holder: string;
  ticket: string;
  recipient: string | null;
  /** The step each reserved step operation is. */
  steps: Map<string, "request" | "transfer">;
  reserved: Set<"request" | "transfer">;
  committed: Set<"request" | "transfer">;
}

interface CaseRecord {
  status: string;
  quote: {
    quote_version: number;
    provider: string;
    amount: string;
    currency: string;
  };
  decision: string | null;
  evidence: number;
  information: number;
}

/**
 * FIXTURE of the PROPOSED, NOT DEPLOYED contract r20
 * (docs/proposals/runtime-write-status-r20.md): a runtime's durable record of
 * one face write, keyed by its runtime and original operation id.
 */
interface WriteRecord {
  kind: RuntimeKind;
  operation: string;
  target: Json;
  requestHash: string;
  holder: string;
  wallet: string;
  issuer: string;
  audience: string;
  programme: string;
  artifact: { version: string; artifactHash: string };
  applied: boolean;
  receipt: Json | null;
  answer: { status: number; body: Json };
}

const WRITE_OPERATIONS = new Set([
  "case.open",
  "case.evidence.submit",
  "case.information.provide",
  "case.quote.approve",
  "case.quote.decline",
  "transfer.offer",
  "transfer.cancel",
]);

/**
 * LOCAL FAKE of one brand's Passport runtime and its linked Warranty runtime
 * (the same brand's state, two audiences).
 */
class BrandRuntime {
  /**
   * Off: the runtimes as deployed today (no write record, write.status
   * unknown). On: the labelled fixture of the PROPOSED r20 contract.
   */
  r20 = false;
  /** r20 fixture: rewrites a write.status answer (negative tests). */
  tamper: ((body: Json) => Json) | undefined;
  /** r20 fixture: artifacts the runtime treats as compatible (its set A). */
  compatible: Set<string> | undefined;
  readonly writes = new Map<string, WriteRecord>();
  private events = 0;
  readonly calls: Array<{
    by: "wallet" | "face";
    kind: RuntimeKind;
    operation: string;
    operationId: string;
    status: number;
  }> = [];
  /** Operations whose assertion this runtime refused. */
  readonly refused: string[] = [];
  /** Server-to-server requests that were not the wallet's fixed shape. */
  readonly violations: string[] = [];
  readonly cases: Map<string, CaseRecord>;
  private readonly jtis = new Set<string>();
  private readonly registrations = new Map<
    string,
    { objectId: string; holder: string }
  >();
  private readonly settleProposals = new Map<
    string,
    { objectId: string; holder: string }
  >();
  private readonly settleReservations = new Set<string>();
  private readonly offers = new Map<string, Offer>();

  constructor(
    readonly brand: Brand,
    private readonly dual: FakeDual,
  ) {
    const provider = `${brand.label} Service Centre`;
    this.cases = new Map([
      [
        brand.cases[0],
        {
          status: "prepared",
          quote: {
            quote_version: 2,
            provider,
            amount: "149.90",
            currency: "EUR",
          },
          decision: null,
          evidence: 0,
          information: 0,
        },
      ],
      [
        brand.cases[1],
        {
          status: "open",
          quote: {
            quote_version: 1,
            provider,
            amount: "39.00",
            currency: "EUR",
          },
          decision: null,
          evidence: 0,
          information: 0,
        },
      ],
    ]);
  }

  audience(kind: RuntimeKind) {
    return kind === "passport"
      ? `${this.brand.applicationId}@${this.brand.faceOrigin}`
      : `${this.brand.warranty.applicationId}@${this.brand.warranty.origin}`;
  }

  /**
   * Whether an assertion is this brand host's, for this runtime: its key id
   * and signature, issuer, audience, face and programme. Consumes nothing.
   */
  recognises(kind: RuntimeKind, assertion: string) {
    const [header, payload, signature] = assertion.split(".");
    try {
      const head = decode(header);
      const claims = decode(payload);
      return (
        head.alg === "EdDSA" &&
        head.typ === "dual-face-assertion+jwt" &&
        head.kid === this.brand.kid &&
        verifySignature(
          null,
          Buffer.from(`${header}.${payload}`),
          this.brand.keys.publicKey,
          Buffer.from(signature, "base64url"),
        ) &&
        claims.iss === this.brand.origin &&
        claims.aud === this.audience(kind) &&
        claims.app_id === this.brand.applicationId &&
        claims.programme === this.brand.programmeId &&
        claims.origin === this.brand.faceOrigin
      );
    } catch {
      return false;
    }
  }

  /** As the Studio runtimes check an assertion: exactly this request, once. */
  private verify(
    kind: RuntimeKind,
    assertion: unknown,
    expected: {
      operation: string;
      operationId: string;
      target?: Json;
      requestHash: string;
    },
  ) {
    if (typeof assertion !== "string" || !this.recognises(kind, assertion)) {
      return undefined;
    }
    const claims = claimsOf(assertion);
    if (
      claims.operation !== expected.operation ||
      claims.op_id !== expected.operationId ||
      (expected.target !== undefined &&
        canonicalJson(claims.target) !== canonicalJson(expected.target)) ||
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

  /** The wallet BFF's server-to-server request (through global fetch). */
  async fetch(kind: RuntimeKind, url: string, init: RequestInit) {
    const { pathname } = new URL(url);
    const headers = new Headers(init.headers);
    const routed =
      kind === "passport"
        ? this.brand.applicationId
        : this.brand.warranty.applicationId;
    if (
      headers.get("x-tig-product-face-application") !== routed ||
      headers.get("origin") !== null ||
      headers.get("cookie") !== null
    ) {
      this.violations.push(`${kind} ${pathname}`);
    }
    const body = JSON.parse(String(init.body)) as Json;
    if (
      kind === "passport" &&
      pathname === "/api/product-face/v1/registrations/status"
    ) {
      return this.registrationStatus(body);
    }
    if (pathname !== "/api/product-face/v1/operations") {
      this.violations.push(`${kind} ${pathname}`);
      return json(404, { ok: false });
    }
    return this.handle(kind, "wallet", body);
  }

  /** The face frame's own runtime request. */
  async fromFace(kind: RuntimeKind, body: Json) {
    const response = await this.handle(kind, "face", body);
    return { status: response.status, body: (await response.json()) as Json };
  }

  private async handle(kind: RuntimeKind, by: "wallet" | "face", body: Json) {
    const operation = String(body.operation);
    const operationId = String(body.operationId);
    const target = (body.target ?? {}) as Json;
    const input = (body.input ?? {}) as Json;
    const requestHash =
      operation === "registration.settle.reserve"
        ? sha(
            canonicalJson({
              proposal_id: input.proposal_id,
              settle_operation_id: operationId,
              object_id: target.object_id,
            }),
          )
        : hashOf(operation, operationId, target, input);
    const claims = this.verify(kind, body.assertion, {
      operation,
      operationId,
      target,
      requestHash,
    });
    if (!claims) this.refused.push(operation);
    const key = `${kind}:${operationId}`;
    const recorded = this.writes.get(key);
    let answer: Response;
    if (claims && this.r20 && operation === "write.status") {
      answer = this.writeStatus(kind, target, claims, recorded);
    } else if (
      claims &&
      this.r20 &&
      WRITE_OPERATIONS.has(operation) &&
      recorded
    ) {
      // r20: a recorded op id answers its recorded result only to the same
      // caller for the same request; any other reuse is refused, undisclosed.
      answer =
        recorded.holder === claims.holder &&
        recorded.wallet === claims.sub &&
        recorded.audience === claims.aud &&
        recorded.issuer === claims.iss &&
        recorded.programme === claims.programme &&
        recorded.operation === operation &&
        canonicalJson(recorded.target) ===
          canonicalJson({
            object_id: target.object_id,
            ...(target.case_id ? { case_id: target.case_id } : {}),
          }) &&
        recorded.requestHash === requestHash
          ? json(recorded.answer.status, recorded.answer.body)
          : json(409, { ok: false, status: "face_operation_conflict" });
    } else {
      answer = this.dispatch(
        kind,
        operation,
        operationId,
        target,
        input,
        claims,
      );
      if (claims && this.r20 && WRITE_OPERATIONS.has(operation)) {
        const answered = (await answer.clone().json()) as Json;
        this.events += 1;
        const applied = answer.status === 200;
        this.writes.set(key, {
          kind,
          operation,
          target: {
            object_id: target.object_id,
            ...(target.case_id ? { case_id: target.case_id } : {}),
          },
          requestHash,
          holder: String(claims.holder),
          wallet: String(claims.sub),
          issuer: String(claims.iss),
          audience: String(claims.aud),
          programme: String(claims.programme),
          artifact: {
            version: String(claims.app_version),
            artifactHash: String(claims.artifact),
          },
          applied,
          receipt: !applied
            ? null
            : kind === "warranty"
              ? {
                  kind: "case_event",
                  case_id: target.case_id,
                  event_id: `case-event-${this.events}`,
                }
              : {
                  kind: "transfer_offer",
                  offer_id: answered.offer_id,
                  state:
                    operation === "transfer.cancel" ? "cancelled" : "offered",
                },
          answer: { status: answer.status, body: answered },
        });
      }
    }
    this.calls.push({
      by,
      kind,
      operation,
      operationId,
      status: answer.status,
    });
    return answer;
  }

  /** r20 fixture: the verified record of one write, to its own caller only. */
  private writeStatus(
    kind: RuntimeKind,
    target: Json,
    claims: Json,
    recorded: WriteRecord | undefined,
  ) {
    if (
      !recorded ||
      recorded.kind !== kind ||
      recorded.holder !== claims.holder ||
      recorded.wallet !== claims.sub ||
      recorded.audience !== claims.aud ||
      recorded.issuer !== claims.iss ||
      canonicalJson(recorded.target) !== canonicalJson(target)
    ) {
      return json(404, { ok: false, status: "face_operation_not_found" });
    }
    const accepted = this.compatible ?? new Set([String(claims.artifact)]);
    if (
      !accepted.has(recorded.artifact.artifactHash) ||
      !accepted.has(String(claims.artifact))
    ) {
      return json(409, {
        ok: false,
        status: "face_operation_artifact_retired",
      });
    }
    const body: Json = {
      ok: true,
      status: recorded.applied ? "write_applied" : "write_refused",
      contract: "r20",
      readback: "verified",
      artifact_compatible: true,
      operation_id: claims.op_id,
      operation: recorded.operation,
      target: recorded.target,
      request_hash: recorded.requestHash,
      holder: recorded.holder,
      wallet: recorded.wallet,
      issuer: recorded.issuer,
      application_id:
        kind === "passport"
          ? this.brand.applicationId
          : this.brand.warranty.applicationId,
      programme: recorded.programme,
      recorded_artifact: recorded.artifact,
      asserting_artifact: {
        version: String(claims.app_version),
        artifactHash: String(claims.artifact),
      },
      receipt: recorded.receipt,
      writesExecuted: 0,
      dualWritesExecuted: 0,
      unknownWriteOutcomes: 0,
      secretReturned: false,
    };
    return json(200, this.tamper ? this.tamper(body) : body);
  }

  private dispatch(
    kind: RuntimeKind,
    operation: string,
    operationId: string,
    target: Json,
    input: Json,
    claims: Json | undefined,
  ) {
    return !claims
      ? json(403, { ok: false, status: "face_assertion_mismatch" })
      : kind === "passport"
        ? this.passport(
            operation,
            operationId,
            target,
            input,
            String(claims.holder),
          )
        : this.warrantyCase(operation, target, String(claims.holder));
  }

  private registrationStatus(body: Json) {
    const operationId = String(body.operationId);
    const registration = this.registrations.get(operationId);
    const claims = this.verify("passport", body.assertion, {
      operation: "registration.status",
      operationId,
      target: registration ? { object_id: registration.objectId } : undefined,
      requestHash: sha(canonicalJson({ operationId })),
    });
    let answer: Response;
    if (!claims) {
      this.refused.push("registration.status");
      answer = json(403, { ok: false, status: "face_assertion_mismatch" });
    } else if (!registration) {
      answer = json(404, {
        ok: false,
        status: "not_submitted",
        reason: "face_operation_not_found",
        operationId,
        objectId: null,
      });
    } else {
      const status = this.dual.settled(
        registration.objectId,
        registration.holder,
      )
        ? "registered"
        : "ownership_moved_state_pending";
      answer = json(200, {
        ok: status === "registered",
        status,
        operationId,
        objectId: registration.objectId,
      });
    }
    this.calls.push({
      by: "wallet",
      kind: "passport",
      operation: "registration.status",
      operationId,
      status: answer.status,
    });
    return answer;
  }

  private offerOf(ticket: unknown) {
    return [...this.offers.values()].find((offer) => offer.ticket === ticket);
  }

  private passport(
    operation: string,
    operationId: string,
    target: Json,
    input: Json,
    holder: string,
  ): Response {
    const objectId = String(target.object_id ?? "");
    const unit = this.dual.units.get(objectId);
    const owned = unit?.owner === holder;
    switch (operation) {
      case "registration.submit": {
        if (
          !unit ||
          unit.owner !== this.brand.issuer ||
          unit.custom.recordId !== input.record_id
        ) {
          return json(409, { ok: false, status: "registration_refused" });
        }
        // The issuer hands custody over; the holder's wallet settles it.
        unit.owner = holder;
        unit.custom = {
          ...unit.custom,
          state: "Transfer pending",
          lifecycle: { target_state: "Transfer pending" },
        };
        this.registrations.set(operationId, { objectId, holder });
        return json(202, {
          ok: true,
          status: "ownership_moved_state_pending",
          operationId,
          objectId,
        });
      }
      case "registration.settle.propose": {
        const registration = this.registrations.get(operationId);
        if (
          !unit ||
          !owned ||
          registration?.objectId !== objectId ||
          registration.holder !== holder
        ) {
          return json(404, {
            ok: false,
            status: "face_operation_not_found",
            reason: "face_operation_not_found",
          });
        }
        if (unit.custom.state !== "Transfer pending") {
          return json(409, { ok: false, status: "settle_not_required" });
        }
        // A deep copy of the fresh unit with only the governed leaves written.
        // (The settle template is the face's nested `custom` one.)
        const proposed = {
          custom: {
            ...clone(unit.custom),
            state: "Authenticity verified",
            lifecycle: { target_state: "Authenticity verified" },
          },
        };
        const proposalId = `psp-${this.brand.tag}-${this.settleProposals.size + 1}`;
        this.settleProposals.set(proposalId, { objectId, holder });
        return json(200, {
          ok: true,
          status: "settle_proposed",
          proposal_id: proposalId,
          operation_id: operationId,
          object_id: objectId,
          action: "update",
          input: proposed,
          proposal_hash: sha(
            canonicalJson({
              object_id: objectId,
              action: "update",
              input: proposed,
            }),
          ),
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        });
      }
      case "registration.settle.reserve": {
        const proposalId = String(input.proposal_id);
        const proposal = this.settleProposals.get(proposalId);
        if (proposal?.objectId !== objectId || proposal.holder !== holder) {
          return json(409, { ok: false, status: "settle_proposal_unknown" });
        }
        const key = `${objectId}:${proposalId}`;
        if (this.settleReservations.has(key)) {
          return json(409, {
            ok: false,
            status: "already_claimed",
            dispatch: "already_claimed",
          });
        }
        this.settleReservations.add(key);
        return json(200, {
          ok: true,
          status: "granted",
          dispatch: "won",
          reservation: {
            settle_operation_id: operationId,
            object_id: objectId,
            proposal_id: proposalId,
          },
        });
      }
      case "registration.settle.verify":
        return this.dual.settled(objectId, holder)
          ? json(200, { ok: true, status: "registered", objectId })
          : json(202, { ok: false, status: "outcome_unknown" });
      case "products.private.read":
        return owned
          ? json(200, {
              ok: true,
              product: {
                object_id: objectId,
                purchase: { date: "2026-09-30", channel: this.brand.label },
              },
            })
          : json(403, { ok: false, status: "not_holder" });
      case "transfer.offer": {
        if (!owned) return json(403, { ok: false, status: "not_holder" });
        const offerId = `pto-${randomBytes(12).toString("hex")}`;
        const ticket = randomBytes(32).toString("base64url");
        this.offers.set(offerId, {
          offerId,
          objectId,
          holder,
          ticket,
          recipient: null,
          steps: new Map(),
          reserved: new Set(),
          committed: new Set(),
        });
        return json(200, {
          ok: true,
          status: "transfer_offered",
          offer_id: offerId,
          acceptance_ticket: ticket,
        });
      }
      case "transfer.acceptance.read": {
        const offer = this.offerOf(input.acceptance_ticket);
        return offer && !offer.recipient
          ? json(200, {
              ok: true,
              status: "transfer_acceptance",
              object_id: offer.objectId,
              secretReturned: false,
            })
          : json(409, { ok: false, status: "transfer_offer_not_found" });
      }
      case "transfer.accept": {
        const offer = this.offerOf(input.acceptance_ticket);
        if (
          !offer ||
          offer.recipient ||
          offer.objectId !== objectId ||
          offer.holder === holder
        ) {
          return json(409, { ok: false, status: "transfer_offer_not_found" });
        }
        offer.recipient = holder;
        // The recipient's own registration, settled on its wallet once
        // custody moved.
        this.registrations.set(operationId, { objectId, holder });
        return json(200, {
          ok: true,
          status: "transfer_accepted",
          offer_id: offer.offerId,
        });
      }
      case "transfer.propose": {
        const offer = this.offers.get(String(input.offer_id));
        if (!unit || offer?.holder !== holder || offer.objectId !== objectId) {
          return json(404, { ok: false, status: "transfer_offer_not_found" });
        }
        if (!offer.recipient) {
          return json(409, { ok: false, status: "transfer_not_accepted" });
        }
        const step = offer.committed.has("request") ? "transfer" : "request";
        const proposed =
          step === "transfer"
            ? { to: offer.recipient }
            : {
                data: {
                  custom: {
                    ...clone(unit.custom),
                    state: "Transfer pending",
                    lifecycle: { target_state: "Transfer pending" },
                    proof_event: {
                      public_fields: [
                        `recipientReferenceHash:${sha(offer.recipient)}`,
                      ],
                    },
                  },
                },
              };
        const action = step === "transfer" ? "transfer" : "update";
        return json(200, {
          ok: true,
          status: "transfer_step_proposed",
          step,
          proposal_id: `ptp-${randomBytes(12).toString("hex")}`,
          offer_id: offer.offerId,
          object_id: objectId,
          action,
          input: proposed,
          proposal_hash: sha(
            canonicalJson({ object_id: objectId, action, input: proposed }),
          ),
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          recipient: offer.recipient,
        });
      }
      case "transfer.reserve": {
        const offer = this.offers.get(String(input.offer_id));
        if (offer?.holder !== holder) {
          return json(409, {
            ok: false,
            status: "transfer_offer_not_found",
            dispatch: "refused",
            executionPermitted: false,
          });
        }
        const step = offer.committed.has("request") ? "transfer" : "request";
        if (offer.reserved.has(step)) {
          return json(409, {
            ok: false,
            status: "already_claimed",
            dispatch: "already_claimed",
            executionPermitted: false,
          });
        }
        offer.reserved.add(step);
        offer.steps.set(operationId, step);
        return json(200, {
          ok: true,
          status: "granted",
          dispatch: "won",
          executionPermitted: true,
          reservation: {
            step,
            state: "granted",
            step_operation_id: operationId,
            proposal_id: input.proposal_id,
          },
        });
      }
      case "transfer.verify":
      case "transfer.status": {
        const offer = this.offers.get(String(input.offer_id));
        const step = offer?.steps.get(String(input.step_operation_id));
        if (!offer || !step || offer.holder !== holder) {
          return json(404, { ok: false, status: "transfer_step_not_found" });
        }
        // Committed only on the holder's own executed action for this step.
        const done = this.dual.executed.some(
          (action) =>
            action.account === offer.holder &&
            action.objectId === offer.objectId &&
            (operation === "transfer.status" ||
              action.actionId === input.action_id) &&
            (step === "transfer"
              ? action.name === "transfer" && action.to === offer.recipient
              : action.name === "update"),
        );
        if (!done) {
          return json(202, {
            ok: false,
            status: "outcome_unknown",
            reason: "transfer_action_not_found",
          });
        }
        offer.committed.add(step);
        return json(200, {
          ok: true,
          status:
            step === "transfer" ? "transferred" : "transfer_request_committed",
          step,
        });
      }
      default:
        return json(400, { ok: false, status: "face_request_invalid" });
    }
  }

  private warrantyCase(operation: string, target: Json, holder: string) {
    const unit = this.dual.units.get(String(target.object_id ?? ""));
    if (unit?.owner !== holder) {
      return json(403, { ok: false, status: "not_holder" });
    }
    if (operation === "cases.list") {
      return json(200, {
        ok: true,
        cases: [...this.cases].map(([caseId, item]) => ({
          case_id: caseId,
          status: item.status,
        })),
      });
    }
    const caseId = String(target.case_id ?? "");
    const item = this.cases.get(caseId);
    if (!item) return json(404, { ok: false, status: "case_not_found" });
    switch (operation) {
      case "case.read":
        return json(200, {
          ok: true,
          case: { case_id: caseId, status: item.status, quote: item.quote },
        });
      case "case.open":
        if (item.status !== "prepared") {
          return json(409, { ok: false, status: "case_not_prepared" });
        }
        item.status = "open";
        return json(200, { ok: true, status: "case_opened", case_id: caseId });
      case "case.evidence.submit":
        item.evidence += 1;
        return json(200, { ok: true, status: "evidence_received" });
      case "case.information.provide":
        item.information += 1;
        return json(200, { ok: true, status: "information_received" });
      case "case.quote.approve":
      case "case.quote.decline": {
        if (
          item.decision ||
          target.quote_version !== item.quote.quote_version ||
          target.amount !== item.quote.amount ||
          target.currency !== item.quote.currency
        ) {
          return json(409, { ok: false, status: "quote_changed" });
        }
        item.decision =
          operation === "case.quote.approve" ? "approved" : "declined";
        return json(200, { ok: true, status: `quote_${item.decision}` });
      }
      default:
        return json(400, { ok: false, status: "face_request_invalid" });
    }
  }
}

// ------------------------------------------------------------------ world

interface World {
  dual: FakeDual;
  runtimes: Map<Brand, BrandRuntime>;
}
let world: World;
const runtimeOf = (brand: Brand) => world.runtimes.get(brand)!;

function newWorld() {
  const dual = new FakeDual(BRANDS);
  world = {
    dual,
    runtimes: new Map(
      BRANDS.map((brand) => [brand, new BrandRuntime(brand, dual)]),
    ),
  };
  global.fetch = jest.fn(
    async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      const { origin } = new URL(url);
      if (origin === "https://api.dual.network")
        return world.dual.fetch(url, init);
      for (const runtime of world.runtimes.values()) {
        if (origin === runtime.brand.faceOrigin) {
          return runtime.fetch("passport", url, init);
        }
        if (origin === runtime.brand.warranty.origin) {
          return runtime.fetch("warranty", url, init);
        }
      }
      throw new TypeError(`fetch failed: ${url}`);
    },
  ) as unknown as typeof fetch;
}

/**
 * One host deployment: the engine built with this configuration and registry
 * (the build records both), and this host's own secrets. `build` stands in
 * an earlier build's record, as a deployment that was not rebuilt has.
 */
function deploy(
  brand: Brand,
  {
    document = brand.document(),
    registry = registryWithBothFullFaces(),
    build,
  }: {
    document?: HostDocument;
    registry?: string;
    build?: { configuration: string };
  } = {},
) {
  const environment = hostEnvironment(document, {
    PRODUCT_FACE_APPLICATIONS: registry,
  });
  applyHostEnvironment({
    ...environment,
    WALLET_HOST_BUILD_CONFIGURATION_SHA256:
      build?.configuration ?? environment.WALLET_HOST_CONFIGURATION_SHA256,
    WALLET_HOST_BUILD_FACE_APPLICATIONS_SHA256: sha256Hex(registry),
  });
  process.env.SESSION_SECRET = brand.sessionSecret;
  process.env.FACE_ASSERTION_SIGNING_KEY = brand.keys.privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  process.env.FACE_ASSERTION_KEY_ID = brand.kid;
  resetWalletHostCache();
  return environment;
}

const readback = async () => (await readbackGET()).json();

/** The deployed host resolves exactly its own organisation, origin and faces. */
async function expectOwnHost(brand: Brand) {
  expect(await readback()).toMatchObject({
    brandId: brand.brandId,
    organizationId: brand.organizationId,
    origin: brand.origin,
    faces: [brand.slug],
    status: "active",
  });
  expect(productFaceEntries().map((entry) => entry.slug)).toEqual([brand.slug]);
}

// ---------------------------------------------------------------- browser

const SESSION_COOKIE = "smarttoken_viewer";

type Route<P> = (
  request: NextRequest,
  context: { params: Promise<P> },
) => Response | Promise<Response>;

interface Delivery {
  /** The address the request is sent to (by default the browser's own host). */
  at?: Address;
  /** Apply the response's cookies to this browser's jar (default true). */
  keep?: boolean;
}

/** One person's browser on one brand's host: its cookie jar and one face launch. */
class Browser {
  readonly cookies = new Map<string, string>();

  constructor(
    readonly brand: Brand,
    readonly party: Party,
    readonly launchId: string,
    jar?: Map<string, string>,
  ) {
    if (jar) {
      for (const [name, value] of jar) this.cookies.set(name, value);
      return;
    }
    const response = NextResponse.json({});
    expect(
      establishSession(
        response,
        {
          accessToken: jwt({
            org_id: brand.organizationId,
            sub: party.walletId,
            exp: Math.floor(clock / 1000) + 3600,
          }),
          refreshToken: jwt({ exp: Math.floor(clock / 1000) + 7200 }),
        } as unknown as LoginOut,
        {
          organizationId: brand.organizationId,
          subdomain: "*",
          host: brand.host,
        },
        "email",
      ),
    ).toBe(true);
    this.take(response);
  }

  /** The same browser and session, the face launched again (a new journal). */
  relaunch(launchId: string) {
    return new Browser(this.brand, this.party, launchId, this.cookies);
  }

  take(response: Response) {
    for (const cookie of (response as NextResponse).cookies.getAll()) {
      // Host-only: no cookie names a domain another host could share.
      expect([cookie.name, cookie.domain]).toEqual([cookie.name, undefined]);
      if (cookie.value) this.cookies.set(cookie.name, cookie.value);
      else this.cookies.delete(cookie.name);
    }
  }

  async send<P>(
    route: Route<P>,
    path: string,
    {
      method = "POST",
      body,
      params,
      headers = {},
      at = this.brand,
      keep = true,
    }: Delivery & {
      method?: "GET" | "POST";
      body?: unknown;
      params?: P;
      headers?: Record<string, string>;
    } = {},
  ) {
    const response = await route(
      new NextRequest(`${at.origin}${path}`, {
        method,
        headers: {
          host: at.host,
          origin: at.origin,
          cookie: Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join("; "),
          "x-dual-face-launch": this.launchId,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve(params as P) },
    );
    if (keep) this.take(response);
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  private route(path: string) {
    return `/api/faces/${this.brand.slug}${path}`;
  }

  private get params() {
    return { slug: this.brand.slug };
  }

  operations(body: Json) {
    return this.send(operationsPOST, this.route("/operations"), {
      body,
      params: this.params,
    });
  }

  list(delivery: Delivery = {}) {
    return this.send(operationsGET, this.route("/operations"), {
      method: "GET",
      params: this.params,
      ...delivery,
    });
  }

  status(operationId: string, delivery: Delivery = {}) {
    return this.send(statusGET, this.route(`/operations/${operationId}`), {
      method: "GET",
      params: { slug: this.brand.slug, operationId },
      ...delivery,
    });
  }

  mint(body: Json) {
    return this.send(assertionsPOST, this.route("/assertions"), {
      body,
      params: this.params,
    });
  }

  async select(objectId: string) {
    const selected = await this.send(selectionPOST, this.route("/selection"), {
      body: { object_id: objectId },
      params: this.params,
    });
    expect(selected.status).toBe(200);
    return String(selected.body.context_id);
  }

  settleProposal(body: Json) {
    return this.send(settleProposalPOST, this.route("/settle-proposal"), {
      body,
      params: this.params,
    });
  }

  transferProposal(body: Json) {
    return this.send(transferProposalPOST, this.route("/transfer-proposal"), {
      body,
      params: this.params,
    });
  }

  transferProgress(body: Json) {
    return this.send(transferProgressPOST, this.route("/transfer-progress"), {
      body,
      params: this.params,
    });
  }

  handover(ticket: string) {
    return this.send(handoverPOST, this.route("/handover"), {
      body: { ticket, kind: "accept" },
      params: this.params,
    });
  }

  context(task: string) {
    return this.send(
      contextGET,
      this.route(`/context?task=${encodeURIComponent(task)}`),
      { method: "GET", params: this.params },
    );
  }

  acceptOffer(delivery: Delivery = {}) {
    return this.send(acceptOfferPOST, this.route("/accept-offer"), {
      body: {},
      params: this.params,
      ...delivery,
    });
  }

  /** The executor's prepare or execute through /api/backend, face-bound (r18). */
  backend(
    path: ["ebus", "prepare" | "execute"],
    body: Json,
    operationId: string,
    delivery: Delivery = {},
  ) {
    return this.send(backendPOST, `/api/backend/${path.join("/")}`, {
      body,
      params: { path },
      headers: {
        "x-dual-face-slug": this.brand.slug,
        "x-dual-face-operation": operationId,
        "x-dual-face-wallet": this.party.walletId,
      },
      ...delivery,
    });
  }
}

const launchOf = (brand: Brand, who: string) =>
  `launch-${brand.tag}-${who}-`.padEnd(32, "0");

// ---------------------------------------------------------------- the face

/**
 * The face asks its host for one assertion, then makes its own runtime call
 * with it; the assertion is checked to be this host's, for this brand.
 */
async function faceCall(
  browser: Browser,
  kind: RuntimeKind,
  request: {
    operation: string;
    operationId: string;
    target: Json;
    input?: Json;
    contextId?: string;
  },
) {
  const { brand } = browser;
  const input = request.input ?? {};
  const authorised = await browser.mint({
    operation: request.operation,
    operation_id: request.operationId,
    target: request.target,
    request_hash: hashOf(
      request.operation,
      request.operationId,
      request.target,
      input,
    ),
    ...(request.contextId ? { context_id: request.contextId } : {}),
  });
  expect([request.operation, authorised.status]).toEqual([
    request.operation,
    200,
  ]);
  const assertion = String(authorised.body.assertion);
  expect(headerOf(assertion).kid).toBe(brand.kid);
  expect(claimsOf(assertion)).toMatchObject({
    iss: brand.origin,
    aud: runtimeOf(brand).audience(kind),
    app_id: brand.applicationId,
    programme: brand.programmeId,
    holder: browser.party.address,
    operation: request.operation,
    op_id: request.operationId,
  });
  const answer = await runtimeOf(brand).fromFace(kind, {
    operation: request.operation,
    operationId: request.operationId,
    target: request.target,
    input,
    assertion,
  });
  return { assertion, answer };
}

/** Journal begin and the wallet's own confirmation of one runtime write. */
async function confirmedWrite(
  browser: Browser,
  contextId: string,
  operation: string,
  operationId: string,
  caseId?: string,
) {
  const step = { operation_id: operationId, context_id: contextId };
  const begun = await browser.operations({
    transition: "begin",
    kind: "runtime",
    operation,
    object_id: browser.brand.unit.id,
    ...(caseId ? { case_id: caseId } : {}),
    ...step,
  });
  expect([operation, begun.status]).toEqual([operation, 200]);
  expect(
    (await browser.operations({ transition: "confirm", ...step })).status,
  ).toBe(200);
  return begun.body;
}

/** The holder's registration: journalled, confirmed, its one assertion, submitted. */
async function issueRegistration(holder: Browser) {
  const { brand } = holder;
  const operationId = `register-${brand.tag}-0001`;
  const target = { object_id: brand.unit.id };
  const input = { record_id: brand.unit.recordId };
  expect(
    await holder.operations({
      transition: "begin",
      kind: "registration",
      operation: "registration.submit",
      operation_id: operationId,
      object_id: brand.unit.id,
      record_id: brand.unit.recordId,
      request_hash: hashOf("registration.submit", operationId, target, input),
    }),
  ).toMatchObject({
    status: 200,
    body: { operation: { phase: "confirming" } },
  });
  expect(
    await holder.operations({
      transition: "confirm",
      operation_id: operationId,
    }),
  ).toMatchObject({ status: 200, body: { operation: { phase: "confirmed" } } });
  const submitted = await faceCall(holder, "passport", {
    operation: "registration.submit",
    operationId,
    target,
    input,
  });
  expect(submitted.answer).toMatchObject({
    status: 202,
    body: { status: "ownership_moved_state_pending" },
  });
  return { operationId, assertion: submitted.assertion };
}

/** The wallet's own settle proposal, journalled and confirmed, reserved: won. */
async function settleWon(
  browser: Browser,
  registrationOperation: string,
  settleOperation: string,
) {
  const { unit } = browser.brand;
  const contextId = await browser.select(unit.id);
  const read = await browser.settleProposal({
    context_id: contextId,
    operation_id: registrationOperation,
    object_id: unit.id,
  });
  expect(read).toMatchObject({
    status: 200,
    body: {
      proposal: {
        operation_id: registrationOperation,
        object_id: unit.id,
        action: "update",
      },
    },
  });
  const step = { operation_id: settleOperation, context_id: contextId };
  expect(
    (
      await browser.operations({
        transition: "begin",
        kind: "settle",
        operation: "update",
        object_id: unit.id,
        proposal_id: read.body.proposal.proposal_id,
        ...step,
      })
    ).status,
  ).toBe(200);
  expect(
    (await browser.operations({ transition: "confirm", ...step })).status,
  ).toBe(200);
  expect(
    await browser.operations({ transition: "submit", ...step }),
  ).toMatchObject({
    status: 200,
    body: { reservation: "won", operation: { phase: "submitted" } },
  });
  return {
    contextId,
    action: { update: { id: unit.id, ...read.body.proposal.input } } as Json,
  };
}

/** One G8 step read by the wallet itself, journalled, confirmed, reserved: won. */
async function transferStepWon(
  holder: Browser,
  contextId: string,
  offerId: string,
  operationId: string,
  expected: "request" | "transfer",
) {
  const { unit } = holder.brand;
  const read = await holder.transferProposal({
    context_id: contextId,
    object_id: unit.id,
    offer_id: offerId,
  });
  expect(read).toMatchObject({
    status: 200,
    body: {
      proposal: {
        step: expected,
        offer_id: offerId,
        object_id: unit.id,
        recipient: holder.brand.recipient.address,
      },
    },
  });
  const step = { operation_id: operationId, context_id: contextId };
  expect(
    (
      await holder.operations({
        transition: "begin",
        kind: "transfer",
        operation:
          expected === "request" ? "transfer.request" : "transfer.transfer",
        object_id: unit.id,
        proposal_id: read.body.proposal.proposal_id,
        offer_id: offerId,
        ...step,
      })
    ).status,
  ).toBe(200);
  expect(
    (await holder.operations({ transition: "confirm", ...step })).status,
  ).toBe(200);
  expect(
    await holder.operations({ transition: "submit", ...step }),
  ).toMatchObject({ status: 200, body: { reservation: "won" } });
  const action = expected === "request" ? "update" : "transfer";
  return { [action]: { id: unit.id, ...read.body.proposal.input } } as Json;
}

/** The holder's won step, prepared and executed through /api/backend, recorded. */
async function executeStep(
  browser: Browser,
  operationId: string,
  action: Json,
  delivery: Delivery = {},
) {
  const prepared = await browser.backend(
    ["ebus", "prepare"],
    { action },
    operationId,
    delivery,
  );
  expect(prepared).toMatchObject({ status: 200, body: { challenge: "AQID" } });
  const executed = await browser.backend(
    ["ebus", "execute"],
    {
      action,
      nonce: prepared.body.nonce,
      auth: { type: "webauthn", challenge: "AQID", credentialId: "c-1" },
    },
    operationId,
    delivery,
  );
  expect(executed.status).toBe(200);
  const actionId = String(executed.body.action_id);
  expect(
    (
      await browser.operations({
        transition: "record_action",
        operation_id: operationId,
        action_id: actionId,
      })
    ).status,
  ).toBe(200);
  return actionId;
}

/** The holder offers; the recipient opens the link on the same host and accepts. */
async function offerAccepted(
  holder: Browser,
  recipient: Browser,
  contextId: string,
) {
  const { brand } = holder;
  const product = { object_id: brand.unit.id };
  const offerOperation = `offer-${brand.tag}-0001`;
  await confirmedWrite(holder, contextId, "transfer.offer", offerOperation);
  const offered = await faceCall(holder, "passport", {
    operation: "transfer.offer",
    operationId: offerOperation,
    target: product,
    contextId,
  });
  expect(offered.answer).toMatchObject({
    status: 200,
    body: { status: "transfer_offered" },
  });
  const offerId = String(offered.answer.body.offer_id);
  const ticket = String(offered.answer.body.acceptance_ticket);
  expect(await recipient.handover(ticket)).toMatchObject({
    status: 200,
    body: { next: `/products/${brand.slug}/accept` },
  });
  expect(await recipient.context("/accept")).toMatchObject({
    status: 200,
    body: { acceptance: { ticket } },
  });
  expect(await recipient.acceptOffer()).toMatchObject({
    status: 200,
    body: { unit: { objectId: brand.unit.id, name: brand.unit.name } },
  });
  const acceptOperation = `accept-${brand.tag}-0001`;
  const accepted = await faceCall(recipient, "passport", {
    operation: "transfer.accept",
    operationId: acceptOperation,
    target: product,
    input: { acceptance_ticket: ticket },
  });
  expect(accepted.answer).toMatchObject({
    status: 200,
    body: { status: "transfer_accepted", offer_id: offerId },
  });
  return {
    offerId,
    acceptOperation,
    offerAssertion: offered.assertion,
    acceptAssertion: accepted.assertion,
  };
}

// ------------------------------------------------------------- isolation

interface Evidence {
  /** Operation ids this browser's journal holds on its own host. */
  operations: string[];
  /** Assertions its host minted, and the runtime each was for. */
  assertions: Array<[RuntimeKind, string]>;
}

/**
 * Everything one brand's host handed this browser, presented to the OTHER
 * brand's host (deployed with its own environment and secrets): nothing of
 * it is served there, nothing is minted there, and the other brand's
 * runtimes refuse its assertions.
 */
async function nothingCrossesTo(
  other: Brand,
  from: Browser,
  evidence: Evidence,
) {
  const { brand } = from;
  const mints = minted.mock.calls.length;
  const calls = runtimeOf(other).calls.length;
  deploy(other);
  try {
    await expectOwnHost(other);
    const elsewhere = { at: other, keep: false };
    // The session cookie: another key, organisation and host.
    expect(
      (
        await from.send(sessionGET, "/api/session", {
          method: "GET",
          ...elsewhere,
        })
      ).status,
    ).toBe(401);
    // This brand's face slug and programme are not the other host's, though
    // its registry holds them.
    expect(
      await from.send(selectionPOST, `/api/faces/${brand.slug}/selection`, {
        body: { object_id: brand.unit.id },
        params: { slug: brand.slug },
        ...elsewhere,
      }),
    ).toMatchObject({ status: 404, body: { code: "unknown_application" } });
    // On the other host's own face this session is no session.
    expect(
      await from.send(assertionsPOST, `/api/faces/${other.slug}/assertions`, {
        body: {
          operation: "products.private.read",
          operation_id: `private-${brand.tag}-0009`,
          target: { object_id: other.unit.id },
          request_hash: sha("x"),
          context_id: "c".repeat(24),
        },
        params: { slug: other.slug },
        ...elsewhere,
      }),
    ).toMatchObject({ status: 401, body: { code: "session_expired" } });
    // Its launch journal and acceptance cookies, carried under the same
    // launch id by the other host's own signed-in owner, read as nothing.
    const owner = new Browser(other, other.holder, from.launchId);
    for (const [name, value] of from.cookies) {
      if (name !== SESSION_COOKIE) owner.cookies.set(name, value);
    }
    expect(await owner.list({ keep: false })).toEqual({
      status: 200,
      body: { operations: [], retained: [] },
    });
    for (const operationId of evidence.operations) {
      expect(await owner.status(operationId, { keep: false })).toMatchObject({
        status: 404,
        body: { code: "unknown_operation" },
      });
    }
    if (from.cookies.has(FACE_ACCEPTANCE_COOKIE)) {
      expect(await owner.acceptOffer({ keep: false })).toMatchObject({
        status: 400,
        body: { code: "invalid_request" },
      });
    }
    // The other host's request proxy answers this brand's address with 421.
    const misdirected = await proxy(
      new NextRequest(`${brand.origin}/api/faces/${brand.slug}/operations`, {
        headers: { host: brand.host },
      }),
    );
    expect(misdirected.status).toBe(421);
    // Nothing was minted there, and the other brand's runtimes were not asked.
    expect(minted.mock.calls.length).toBe(mints);
    expect(runtimeOf(other).calls.length).toBe(calls);
  } finally {
    deploy(brand);
  }
  // Every assertion this host minted names this host, its face and programme,
  // and verifies only under its own key: the other brand's runtimes refuse it.
  for (const [kind, assertion] of evidence.assertions) {
    expect(headerOf(assertion).kid).toBe(brand.kid);
    expect(claimsOf(assertion)).toMatchObject({
      iss: brand.origin,
      app_id: brand.applicationId,
      programme: brand.programmeId,
      origin: brand.faceOrigin,
    });
    expect(runtimeOf(brand).recognises(kind, assertion)).toBe(true);
    expect(runtimeOf(other).recognises(kind, assertion)).toBe(false);
  }
}

// ------------------------------------------------------------------ setup

const originalFetch = global.fetch;
const originalSessionSecret = process.env.SESSION_SECRET;
let now: jest.SpyInstance;
beforeEach(() => {
  clock = Date.now();
  now = jest.spyOn(Date, "now").mockImplementation(() => clock);
  resetIssueGuard();
  minted.mockReset();
  newWorld();
  getWallet
    .mockReset()
    .mockImplementation(async (token?: string) => world.dual.wallet(token));
  getObjectById
    .mockReset()
    .mockImplementation(async (_token: string | undefined, objectId: string) =>
      world.dual.object(objectId),
    );
  getObjectByIdPublic
    .mockReset()
    .mockImplementation(async (objectId: string) =>
      world.dual.object(objectId),
    );
});
afterEach(() => {
  now.mockRestore();
  global.fetch = originalFetch;
  clearHostEnvironment();
  resetWalletHostCache();
  process.env.SESSION_SECRET = originalSessionSecret;
  delete process.env.FACE_ASSERTION_KEY_ID;
  delete process.env.FACE_ASSERTION_SIGNING_KEY;
});

// ------------------------------------------------------------------ tests

describe("two complete branded apps on one engine", () => {
  it.each([
    [MORROW.label, "the deployed runtimes", MORROW, TIDEWELL, false],
    [TIDEWELL.label, "the deployed runtimes", TIDEWELL, MORROW, false],
    [MORROW.label, "the PROPOSED r20 runtime fixture", MORROW, TIDEWELL, true],
    [
      TIDEWELL.label,
      "the PROPOSED r20 runtime fixture",
      TIDEWELL,
      MORROW,
      true,
    ],
  ] as Array<[string, string, Brand, Brand, boolean]>)(
    "%s with %s: registration, private details, Warranty & Service, transfer and the recipient's registration, all on its own host; nothing crosses to the other brand's",
    async (_label, _mode, brand, other, r20) => {
      runtimeOf(brand).r20 = r20;
      const { unit } = brand;
      const product = { object_id: unit.id };
      deploy(brand);
      await expectOwnHost(brand);
      const holder = new Browser(
        brand,
        brand.holder,
        launchOf(brand, "holder"),
      );
      const evidence: Evidence = { operations: [], assertions: [] };

      // Passport registration: issued, submitted by the face, settled on the
      // wallet through the face-bound executor, registered.
      const registration = await issueRegistration(holder);
      evidence.operations.push(registration.operationId);
      evidence.assertions.push(["passport", registration.assertion]);
      expect(await holder.status(registration.operationId)).toMatchObject({
        status: 200,
        body: {
          status: "ownership_moved_state_pending",
          readback: { owner_is_you: true, state: "Transfer pending" },
        },
      });
      const settleOperation = `settle-${brand.tag}-0001`;
      const settle = await settleWon(
        holder,
        registration.operationId,
        settleOperation,
      );
      const contextId = settle.contextId;
      await executeStep(holder, settleOperation, settle.action);
      evidence.operations.push(settleOperation);
      expect(await holder.status(settleOperation)).toMatchObject({
        status: 200,
        body: { kind: "settle", status: "registered" },
      });
      expect(await holder.status(registration.operationId)).toMatchObject({
        status: 200,
        body: { kind: "registration", status: "registered" },
      });
      const verified = await faceCall(holder, "passport", {
        operation: "registration.settle.verify",
        operationId: `verify-${brand.tag}-0001`,
        target: product,
        input: { settle_operation_id: settleOperation },
        contextId,
      });
      expect(verified.answer).toMatchObject({
        status: 200,
        body: { status: "registered" },
      });
      await nothingCrossesTo(other, holder, evidence);

      // My products: the private details.
      advance();
      const details = await faceCall(holder, "passport", {
        operation: "products.private.read",
        operationId: `private-${brand.tag}-0001`,
        target: product,
        contextId,
      });
      expect(details.answer).toMatchObject({
        status: 200,
        body: { product: { object_id: unit.id } },
      });

      // Warranty & Service on this brand's own linked Warranty runtime: the
      // list and read, the case writes (each journalled and confirmed first)
      // and both quote decisions on the quote the wallet read itself.
      advance();
      const [first, second] = brand.cases;
      const listed = await faceCall(holder, "warranty", {
        operation: "cases.list",
        operationId: `cases-${brand.tag}-0001`,
        target: product,
        contextId,
      });
      expect(listed.answer).toMatchObject({
        status: 200,
        body: {
          cases: [
            { case_id: first, status: "prepared" },
            { case_id: second, status: "open" },
          ],
        },
      });
      const read = await faceCall(holder, "warranty", {
        operation: "case.read",
        operationId: `case-read-${brand.tag}-0001`,
        target: { ...product, case_id: first },
        contextId,
      });
      expect(read.answer).toMatchObject({
        status: 200,
        body: { case: { case_id: first, status: "prepared" } },
      });
      evidence.assertions.push(["warranty", read.assertion]);
      const writes: Array<[string, Json]> = [
        ["case.open", {}],
        ["case.evidence.submit", { evidence_ref: `upload-${brand.tag}-0001` }],
        ["case.information.provide", { answer: "Bought in September." }],
      ];
      for (const [index, [operation, input]] of writes.entries()) {
        const operationId = `case-write-${brand.tag}-000${index + 1}`;
        await confirmedWrite(holder, contextId, operation, operationId, first);
        const written = await faceCall(holder, "warranty", {
          operation,
          operationId,
          target: { ...product, case_id: first },
          input,
          contextId,
        });
        expect([operation, written.answer.status]).toEqual([operation, 200]);
      }
      const decisions: Array<[string, string, number]> = [
        ["case.quote.approve", first, 2],
        ["case.quote.decline", second, 1],
      ];
      for (const [index, [operation, caseId, version]] of decisions.entries()) {
        const operationId = `quote-${brand.tag}-000${index + 1}`;
        const begun = await confirmedWrite(
          holder,
          contextId,
          operation,
          operationId,
          caseId,
        );
        expect(begun.quote).toMatchObject({
          case_id: caseId,
          quote_version: version,
          provider: `${brand.label} Service Centre`,
        });
        const decided = await faceCall(holder, "warranty", {
          operation,
          operationId,
          target: {
            ...product,
            case_id: caseId,
            quote_version: begun.quote.quote_version,
            amount: begun.quote.amount,
            currency: begun.quote.currency,
          },
          contextId,
        });
        expect([operation, decided.answer.status]).toEqual([operation, 200]);
      }
      expect(
        [...runtimeOf(brand).cases.values()].map((item) => [
          item.status,
          item.evidence,
          item.information,
          item.decision,
        ]),
      ).toEqual([
        ["open", 1, 1, "approved"],
        ["open", 0, 0, "declined"],
      ]);

      // Transfer: the offer, the recipient's acceptance on the same host, the
      // request step and the custody step, each read by the wallet itself,
      // reserved and executed once.
      // This launch's journal now holds its bound (JOURNAL_MAX_ENTRIES): one
      // settled step and five Warranty & Service writes whose authority left
      // the wallet, which are kept and never make room unproven.
      advance();
      expect(
        (await holder.list()).body.operations.map(
          (item: { kind: string; phase: string }) => [item.kind, item.phase],
        ),
      ).toEqual([
        ["settle", "settled"],
        ...Array(5).fill(["runtime", "assertion_issued"]),
      ]);
      // The deployed runtimes record no write outcome: one more step can
      // begin (the settled one makes room); the next is refused journal_full.
      // The wallet asks the runtime for the two oldest held writes'
      // outcomes (write.status, proposed r20); the deployed runtime does not
      // know that read, so nothing is proven, nothing is evicted and no write
      // is sent again. The host offers "Restart the application", and the
      // transfer continues in a new launch. Under the r20 fixture the same
      // launch continues: a begin that finds no room reads the oldest held
      // writes, and only an exact verified record of one frees its slot.
      const room = (operationId: string) =>
        holder.operations({
          transition: "begin",
          kind: "runtime",
          operation: "case.open",
          object_id: unit.id,
          case_id: first,
          operation_id: operationId,
          context_id: contextId,
        });
      const writesSent = () =>
        runtimeOf(brand)
          .calls.filter(
            (call) =>
              call.by === "face" && WRITE_OPERATIONS.has(call.operation),
          )
          .map((call) => call.operationId);
      const sentBefore = writesSent();
      if (!r20) {
        expect((await room(`case-write-${brand.tag}-0004`)).status).toBe(200);
        const mintsBeforeFull = minted.mock.calls.length;
        const callsBeforeFull = runtimeOf(brand).calls.length;
        expect(await room(`case-write-${brand.tag}-0005`)).toMatchObject({
          status: 409,
          body: { code: "journal_full" },
        });
        expect(
          minted.mock.calls
            .slice(mintsBeforeFull)
            .map(([input]) => (input as { operation: string }).operation),
        ).toEqual(["write.status", "write.status"]);
        expect(
          runtimeOf(brand)
            .calls.slice(callsBeforeFull)
            .map((call) => [call.by, call.operation, call.status]),
        ).toEqual([
          ["wallet", "write.status", 400],
          ["wallet", "write.status", 400],
        ]);
        expect(
          (await holder.list()).body.operations.filter(
            (item: { phase: string }) => item.phase === "assertion_issued",
          ),
        ).toHaveLength(5);
      }
      const seller = r20 ? holder : holder.relaunch(launchOf(brand, "seller"));
      const saleContext = await seller.select(unit.id);
      const recipient = new Browser(
        brand,
        brand.recipient,
        launchOf(brand, "recipient"),
      );
      const offer = await offerAccepted(seller, recipient, saleContext);
      evidence.assertions.push(["passport", offer.offerAssertion]);
      const requestOperation = `xfer-request-${brand.tag}-0001`;
      await executeStep(
        seller,
        requestOperation,
        await transferStepWon(
          seller,
          saleContext,
          offer.offerId,
          requestOperation,
          "request",
        ),
      );
      expect(
        await seller.transferProgress({ operation_id: requestOperation }),
      ).toMatchObject({
        status: 200,
        body: { status: "transfer_request_committed", step: "request" },
      });
      const custodyOperation = `xfer-custody-${brand.tag}-0001`;
      await executeStep(
        seller,
        custodyOperation,
        await transferStepWon(
          seller,
          saleContext,
          offer.offerId,
          custodyOperation,
          "transfer",
        ),
      );
      expect(
        await seller.transferProgress({ operation_id: custodyOperation }),
      ).toMatchObject({
        status: 200,
        body: { status: "transferred", step: "transfer" },
      });
      evidence.operations.push(requestOperation, custodyOperation);
      expect(world.dual.units.get(unit.id)).toMatchObject({
        owner: brand.recipient.address,
        custom: { state: "Transfer pending" },
      });
      if (r20) {
        // One launch carried the whole journey. Every face write was sent
        // exactly once (none by the wallet, none twice); slots were freed
        // only by the runtime's verified write.status answers, and every
        // write still unproven is held in this launch's journal.
        const sent = writesSent();
        expect(new Set(sent).size).toBe(sent.length);
        expect(sent.slice(0, sentBefore.length)).toEqual(sentBefore);
        expect(sent).toContain(`offer-${brand.tag}-0001`);
        const reads = runtimeOf(brand).calls.filter(
          (call) => call.operation === "write.status",
        );
        expect(reads.length).toBeGreaterThan(0);
        expect(
          reads.every((call) => call.by === "wallet" && call.status === 200),
        ).toBe(true);
        const journal = (await seller.list()).body.operations as Array<{
          operation_id: string;
          kind: string;
          phase: string;
        }>;
        expect(journal).toHaveLength(6);
        // A settled step is a finished entry: it may already have made room.
        const steps = journal.filter((item) => item.kind === "transfer");
        expect(steps.every((item) => item.phase === "settled")).toBe(true);
        expect(steps.map((item) => item.operation_id)).toContain(
          custodyOperation,
        );
        for (const item of journal.filter(
          (entry) => entry.kind === "runtime",
        )) {
          // Each runtime write left in the journal is either still held
          // or was settled by a verified read of exactly that write.
          expect(
            item.phase === "assertion_issued" ||
              (item.phase === "settled" &&
                reads.some((call) => call.operationId === item.operation_id)),
          ).toBe(true);
        }
      }

      // The recipient settles on its own wallet: registered.
      advance();
      const recipientSettle = `settle-${brand.tag}-0002`;
      const settled = await settleWon(
        recipient,
        offer.acceptOperation,
        recipientSettle,
      );
      await executeStep(recipient, recipientSettle, settled.action);
      expect(await recipient.status(recipientSettle)).toMatchObject({
        status: 200,
        body: { kind: "settle", status: "registered" },
      });
      const confirmed = await faceCall(recipient, "passport", {
        operation: "registration.settle.verify",
        operationId: `verify-${brand.tag}-0002`,
        target: product,
        input: { settle_operation_id: recipientSettle },
        contextId: settled.contextId,
      });
      expect(confirmed.answer).toMatchObject({
        status: 200,
        body: { status: "registered" },
      });
      expect(world.dual.units.get(unit.id)).toMatchObject({
        owner: brand.recipient.address,
        custom: { state: "Authenticity verified" },
      });

      // Throughout, nothing of this host crosses to the other brand's.
      await nothingCrossesTo(other, seller, evidence);
      await nothingCrossesTo(other, recipient, {
        operations: [recipientSettle],
        assertions: [
          ["passport", offer.acceptAssertion],
          ["passport", confirmed.assertion],
        ],
      });
      // Each step ran once; this brand's runtimes refused nothing of its own
      // host, and the other brand's runtimes and unit were never touched.
      expect(world.dual.executed.map((action) => action.name)).toEqual([
        "update",
        "update",
        "transfer",
        "update",
      ]);
      expect(runtimeOf(brand).refused).toEqual([]);
      expect(runtimeOf(brand).violations).toEqual([]);
      expect(runtimeOf(other).calls).toEqual([]);
      expect(world.dual.units.get(other.unit.id)).toMatchObject({
        owner: other.issuer,
        custom: { state: "Issued" },
      });
    },
  );
});

// ------------------------------------------------- update and rollback

/**
 * N+1: what Studio may emit for the same host (walletHostUpgradeCompatibility:
 * the same schema, brand, organisation and origin, and a higher
 * configVersion); here new copy, navigation order and brand colour.
 */
function nextRelease(brand: Brand) {
  const document = brand.document();
  const [major, minor] = String(document.release.configVersion)
    .split(".")
    .map(Number);
  edit(document, "release.configVersion", `${major}.${minor + 1}.0`);
  edit(
    document,
    "home.introduction",
    "Register, service and pass on what you own, all in one place.",
  );
  edit(
    document,
    "navigation",
    [...(document.navigation as string[])].reverse(),
  );
  edit(document, "identity.colours.brand", "#2a6f50");
  return document;
}

/** Under configuration N: registered by the face, its settle won and not yet executed. */
async function settlePending(holder: Browser) {
  const registration = await issueRegistration(holder);
  const settleOperation = `settle-${holder.brand.tag}-0001`;
  const settle = await settleWon(
    holder,
    registration.operationId,
    settleOperation,
  );
  return { registration: registration.operationId, settleOperation, settle };
}

const runtimeCalls = (brand: Brand, operation: string) =>
  runtimeOf(brand).calls.filter((call) => call.operation === operation).length;

describe("one engine, a host's configuration updated and rolled back", () => {
  it.each(
    BRANDS.map((brand) => [brand.label, brand]) as Array<[string, Brand]>,
  )(
    "%s: what was sealed under N continues under N+1 and again under N; nothing is re-signed or re-sent",
    async (_label, brand) => {
      const consoleError = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const release = deploy(brand);
      const holder = new Browser(
        brand,
        brand.holder,
        launchOf(brand, "holder"),
      );
      const { registration, settleOperation, settle } =
        await settlePending(holder);
      const sealed = new Map(holder.cookies);
      const next = nextRelease(brand);

      // N+1 served by the N build (not rebuilt): build_mismatch, 503 on every
      // face route and the face-bound executor; nothing is minted or sent.
      const mints = minted.mock.calls.length;
      deploy(brand, {
        document: next,
        build: { configuration: release.WALLET_HOST_CONFIGURATION_SHA256! },
      });
      expect(await readback()).toMatchObject({
        status: "invalid",
        configurationSha256:
          hostEnvironment(next).WALLET_HOST_CONFIGURATION_SHA256,
      });
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("(build_mismatch)"),
      );
      expect(await holder.list({ keep: false })).toMatchObject({
        status: 503,
        body: { code: "host_unavailable" },
      });
      expect(
        await holder.backend(
          ["ebus", "prepare"],
          { action: settle.action },
          settleOperation,
          { keep: false },
        ),
      ).toMatchObject({ status: 503, body: { code: "host_unavailable" } });
      expect(minted.mock.calls.length).toBe(mints);
      expect(world.dual.ebus).toEqual([]);

      // N+1, built: an engine-compatible update with the same secrets.
      const updated = deploy(brand, { document: next });
      expect(updated.WALLET_HOST_CONFIGURATION_SHA256).not.toBe(
        release.WALLET_HOST_CONFIGURATION_SHA256,
      );
      expect(await readback()).toMatchObject({
        brandId: brand.brandId,
        organizationId: brand.organizationId,
        origin: brand.origin,
        configurationSha256: updated.WALLET_HOST_CONFIGURATION_SHA256,
        configVersion: next.release.configVersion,
        status: "active",
      });
      // The session and the launch journal sealed under N are this host's.
      expect(holder.cookies).toEqual(sealed);
      expect(await holder.list()).toMatchObject({
        status: 200,
        body: {
          operations: [
            { operation_id: registration, phase: "assertion_issued" },
            { operation_id: settleOperation, phase: "submitted" },
          ],
        },
      });
      // The settle won under N executes under N+1, once, and registers.
      await executeStep(holder, settleOperation, settle.action);
      expect(await holder.status(settleOperation)).toMatchObject({
        status: 200,
        body: { status: "registered" },
      });
      expect(await holder.status(registration)).toMatchObject({
        status: 200,
        body: { status: "registered", phase: "settled" },
      });
      // Under N+1: the offer, the recipient's acceptance and the request
      // step, won and not yet executed.
      advance();
      const recipient = new Browser(
        brand,
        brand.recipient,
        launchOf(brand, "recipient"),
      );
      const offer = await offerAccepted(holder, recipient, settle.contextId);
      const requestOperation = `xfer-request-${brand.tag}-0001`;
      const request = await transferStepWon(
        holder,
        settle.contextId,
        offer.offerId,
        requestOperation,
        "request",
      );
      const sealedNext = new Map(holder.cookies);

      // Rollback N+1 → N: the previous approved configuration, the same
      // secrets. What N+1 sealed is served by N: the request step executes
      // once and commits.
      const rolledBack = deploy(brand);
      expect(rolledBack.WALLET_HOST_CONFIGURATION_SHA256).toBe(
        release.WALLET_HOST_CONFIGURATION_SHA256,
      );
      expect(await readback()).toMatchObject({
        configurationSha256: release.WALLET_HOST_CONFIGURATION_SHA256,
        configVersion: brand.document().release.configVersion,
        status: "active",
      });
      expect(holder.cookies).toEqual(sealedNext);
      await executeStep(holder, requestOperation, request);
      expect(
        await holder.transferProgress({ operation_id: requestOperation }),
      ).toMatchObject({
        status: 200,
        body: { status: "transfer_request_committed", step: "request" },
      });
      // Settled entries answer from the journal: no runtime call.
      const calls = runtimeOf(brand).calls.length;
      expect(
        await holder.transferProgress({ operation_id: requestOperation }),
      ).toMatchObject({
        status: 200,
        body: { status: "transfer_request_committed" },
      });
      expect(await holder.list()).toMatchObject({
        status: 200,
        body: {
          operations: expect.arrayContaining([
            expect.objectContaining({
              operation_id: registration,
              phase: "settled",
            }),
            expect.objectContaining({
              operation_id: settleOperation,
              phase: "settled",
            }),
            expect.objectContaining({
              operation_id: requestOperation,
              phase: "settled",
            }),
          ]),
        },
      });
      expect(runtimeOf(brand).calls.length).toBe(calls);

      // Nothing was re-signed or re-sent across the update and the rollback:
      // one registration assertion and submission, one reserve per step, one
      // Dual execution per step.
      expect(
        minted.mock.calls.filter(
          ([input]) =>
            (input as { operation: string }).operation ===
            "registration.submit",
        ),
      ).toHaveLength(1);
      expect(runtimeCalls(brand, "registration.submit")).toBe(1);
      expect(runtimeCalls(brand, "registration.settle.reserve")).toBe(1);
      expect(runtimeCalls(brand, "transfer.reserve")).toBe(1);
      expect(world.dual.executed.map((action) => action.name)).toEqual([
        "update",
        "update",
      ]);
      expect(
        world.dual.ebus.filter((call) => call.path === "/ebus/execute"),
      ).toHaveLength(2);
      expect(runtimeOf(brand).refused).toEqual([]);
      consoleError.mockRestore();
    },
  );

  it.each(
    BRANDS.map((brand) => [brand.label, brand]) as Array<[string, Brand]>,
  )(
    "%s: another organisation, origin or face programme never serves what was sealed under N",
    async (_label, brand) => {
      deploy(brand);
      const holder = new Browser(
        brand,
        brand.holder,
        launchOf(brand, "holder"),
      );
      const { registration, settleOperation, settle } =
        await settlePending(holder);
      const sealed = new Map(holder.cookies);
      const mints = minted.mock.calls.length;
      const calls = runtimeOf(brand).calls.length;

      const organisation = nextRelease(brand);
      edit(organisation, "entrance.organizationId", "c3c3c3c3c3c3c3c3c3c3c3c3");
      const origin = brand.origin.replace("://wallet.", "://wallet-next.");
      const moved = nextRelease(brand);
      edit(moved, "entrance.origin", origin);
      // The face slug now names another programme (Studio refuses that
      // publication as programme_changed; here it is deployed regardless).
      const programme = JSON.stringify(
        [morrowBinding(), tidewellFullBinding()].map((binding) =>
          binding.slug === brand.slug
            ? { ...binding, programmeId: `${brand.programmeId}-next` }
            : binding,
        ),
      );
      const changes: Array<
        [
          string,
          { document: HostDocument; registry?: string; at: Address },
          "session" | "journal",
        ]
      > = [
        [
          "another organisation",
          { document: organisation, at: brand },
          "session",
        ],
        [
          "another origin",
          { document: moved, at: { origin, host: new URL(origin).host } },
          "session",
        ],
        [
          "another face programme",
          { document: nextRelease(brand), registry: programme, at: brand },
          "journal",
        ],
      ];
      for (const [label, change, refusal] of changes) {
        // Each is built and served as a host of its own...
        deploy(brand, { document: change.document, registry: change.registry });
        expect([label, (await readback()).status]).toEqual([label, "active"]);
        // ...that serves none of what N sealed. The browser's jar is left as
        // it was (keep: false) to show the refusals consume nothing.
        const delivery = { at: change.at, keep: false };
        const answers = [
          await holder.list(delivery),
          await holder.status(registration, delivery),
          await holder.backend(
            ["ebus", "execute"],
            { action: settle.action, nonce: 1 },
            settleOperation,
            delivery,
          ),
        ];
        if (refusal === "session") {
          expect(
            answers.map(({ status, body }) => [label, status, body.code]),
          ).toEqual([
            [label, 401, "session_expired"],
            [label, 401, "session_expired"],
            [label, 401, "session_expired"],
          ]);
        } else {
          expect(
            answers.map(({ status, body }) => [label, status, body]),
          ).toEqual([
            [label, 200, { operations: [], retained: [] }],
            [
              label,
              404,
              expect.objectContaining({ code: "unknown_operation" }),
            ],
            // The journal is sealed per programme, so N's settle is not
            // this programme's: a branded host's journey gate finds no
            // step to classify and refuses it before the execution
            // binding (or anything upstream) is reached.
            [
              label,
              403,
              expect.objectContaining({ code: "capability_not_granted" }),
            ],
          ]);
        }
        if (label === "another origin") {
          // While the entrance is moved, the address N served is no longer
          // an entrance (421), never the moved host's.
          const misdirected = await proxy(
            new NextRequest(
              `${brand.origin}/api/faces/${brand.slug}/operations`,
              { headers: { host: brand.host } },
            ),
          );
          expect([label, misdirected.status]).toEqual([label, 421]);
        }
      }
      // Nothing was minted, read from a runtime or sent to Dual for them.
      expect(minted.mock.calls.length).toBe(mints);
      expect(runtimeOf(brand).calls.length).toBe(calls);
      expect(world.dual.ebus).toEqual([]);

      // N again: the sealed state is intact and continues.
      deploy(brand);
      expect(holder.cookies).toEqual(sealed);
      await executeStep(holder, settleOperation, settle.action);
      expect(await holder.status(registration)).toMatchObject({
        status: 200,
        body: { status: "registered" },
      });
    },
  );
});

// ------------------------------------------- runtime write outcomes (r20)

// The wallet's consumer of the PROPOSED, NOT DEPLOYED runtime contract r20
// (docs/proposals/runtime-write-status-r20.md), against the labelled fixture
// above: a held Warranty & Service write frees its journal slot only from the
// runtime's verified record of exactly that write. Nothing else does, and no
// write is ever sent again by the wallet.

async function heldWrite(
  holder: Browser,
  contextId: string,
  n: number,
  {
    dispatch,
    operation = "case.evidence.submit",
    caseIndex = 0,
  }: {
    dispatch: boolean;
    operation?: string;
    caseIndex?: number;
  },
) {
  const { brand } = holder;
  const operationId = `case-write-${brand.tag}-${String(n).padStart(4, "0")}`;
  const caseId = brand.cases[caseIndex];
  const target = { object_id: brand.unit.id, case_id: caseId };
  const input =
    operation === "case.evidence.submit"
      ? { evidence_ref: `upload-${brand.tag}-${n}` }
      : {};
  await confirmedWrite(holder, contextId, operation, operationId, caseId);
  if (dispatch) {
    // The face sends it; its answer is lost to the wallet either way.
    const sent = await faceCall(holder, "warranty", {
      operation,
      operationId,
      target,
      input,
      contextId,
    });
    return { operationId, answer: sent.answer };
  }
  // Interrupted before dispatch: the assertion was issued, never used.
  const minted = await holder.mint({
    operation,
    operation_id: operationId,
    target,
    request_hash: hashOf(operation, operationId, target, input),
    context_id: contextId,
  });
  expect(minted.status).toBe(200);
  return { operationId, answer: undefined };
}

async function r20Holder(brand: Brand) {
  deploy(brand);
  runtimeOf(brand).r20 = true;
  const holder = new Browser(brand, brand.holder, launchOf(brand, "holder"));
  await issueRegistration(holder);
  const contextId = await holder.select(brand.unit.id);
  return { holder, contextId };
}

const faceWrites = (brand: Brand, operationId: string) =>
  runtimeOf(brand).calls.filter(
    (call) => call.by === "face" && call.operationId === operationId,
  ).length;
const statusReads = (brand: Brand, operationId: string) =>
  runtimeOf(brand)
    .calls.filter(
      (call) =>
        call.operation === "write.status" && call.operationId === operationId,
    )
    .map((call) => [call.by, call.status]);

describe("a runtime write's slot, freed only by its verified outcome (PROPOSED r20 fixture)", () => {
  it.each(
    BRANDS.map((brand) => [brand.label, brand]) as Array<[string, Brand]>,
  )(
    "%s: interrupted before or after dispatch, refused, or reused: only the applied write settles, and nothing is sent again",
    async (_label, brand) => {
      const { holder, contextId } = await r20Holder(brand);

      // Before dispatch: the runtime has no record; held, nothing sent.
      const before = await heldWrite(holder, contextId, 1, { dispatch: false });
      expect(await holder.status(before.operationId)).toMatchObject({
        status: 200,
        body: { kind: "runtime", phase: "assertion_issued" },
      });
      expect(statusReads(brand, before.operationId)).toEqual([["wallet", 404]]);
      expect(faceWrites(brand, before.operationId)).toBe(0);

      // After dispatch, its answer lost: the runtime's verified record
      // settles it, read once, and it was sent once.
      const after = await heldWrite(holder, contextId, 2, { dispatch: true });
      expect(after.answer).toMatchObject({ status: 200 });
      expect(await holder.status(after.operationId)).toMatchObject({
        status: 200,
        body: { kind: "runtime", phase: "settled" },
      });
      expect(await holder.status(after.operationId)).toMatchObject({
        status: 200,
        body: { phase: "settled" },
      });
      expect(statusReads(brand, after.operationId)).toEqual([["wallet", 200]]);
      expect(faceWrites(brand, after.operationId)).toBe(1);

      // Refused by the runtime (unapplied): its record says so; held.
      const refused = await heldWrite(holder, contextId, 3, {
        dispatch: true,
        operation: "case.open",
        caseIndex: 1,
      });
      expect(refused.answer).toMatchObject({ status: 409 });
      expect(await holder.status(refused.operationId)).toMatchObject({
        status: 200,
        body: { phase: "assertion_issued" },
      });
      expect(statusReads(brand, refused.operationId)).toEqual([
        ["wallet", 200],
      ]);

      // Reuse of an issued operation id: the wallet mints nothing for it.
      const reused = await holder.mint({
        operation: "case.evidence.submit",
        operation_id: after.operationId,
        target: { object_id: brand.unit.id, case_id: brand.cases[0] },
        request_hash: hashOf(
          "case.evidence.submit",
          after.operationId,
          { object_id: brand.unit.id, case_id: brand.cases[0] },
          { evidence_ref: "another" },
        ),
        context_id: contextId,
      });
      expect(reused.status).toBe(409);
      expect(faceWrites(brand, after.operationId)).toBe(1);
      expect(runtimeOf(brand).cases.get(brand.cases[0])!.evidence).toBe(1);
    },
  );

  type Tamper = [string, (runtime: BrandRuntime, body: Json) => Json];
  const field =
    (name: string, value: unknown): Tamper[1] =>
    (_runtime, body) => ({ ...body, [name]: value });
  const tampers: Tamper[] = [
    ["write_refused", field("status", "write_refused")],
    ["no r20 contract", field("contract", undefined)],
    ["a readback not verified", field("readback", "accepted")],
    ["an unresolved outcome", field("unknownWriteOutcomes", 1)],
    ...(
      ["writesExecuted", "dualWritesExecuted", "unknownWriteOutcomes"] as const
    ).flatMap((name): Tamper[] => [
      [`${name} 1`, field(name, 1)],
      [`${name} missing`, field(name, undefined)],
      [`${name} null`, field(name, null)],
      [`${name} "0"`, field(name, "0")],
      [`${name} -0.5`, field(name, -0.5)],
    ]),
    ["secretReturned true", field("secretReturned", true)],
    ["secretReturned missing", field("secretReturned", undefined)],
    ["no artifact compatibility proof", field("artifact_compatible", false)],
    ["another operation id", field("operation_id", "case-write-zz-9999")],
    ["another operation", field("operation", "case.information.provide")],
    [
      "another unit",
      (_runtime, body) => ({
        ...body,
        target: { ...(body.target as Json), object_id: "c".repeat(24) },
      }),
    ],
    [
      "another case",
      (runtime, body) => ({
        ...body,
        target: {
          ...(body.target as Json),
          case_id: runtime.brand.cases[1],
        },
      }),
    ],
    ["another request", field("request_hash", `sha256:${"d".repeat(64)}`)],
    ["another holder", field("holder", "0x" + "e".repeat(40))],
    ["another wallet", field("wallet", "wallet-foreign")],
    ["another host", field("issuer", "https://wallet.foreign.example")],
    ["another application", field("application_id", "tig.claims.foreign")],
    ["another programme", field("programme", "foreign-programme")],
    [
      "another asserting artifact",
      field("asserting_artifact", {
        version: "9.9.9",
        artifactHash: `sha256:${"f".repeat(64)}`,
      }),
    ],
    [
      "a transfer receipt for a case write",
      field("receipt", {
        kind: "transfer_offer",
        offer_id: `pto-${"0".repeat(24)}`,
        state: "offered",
      }),
    ],
    [
      "another case's receipt",
      (runtime, body) => ({
        ...body,
        receipt: {
          kind: "case_event",
          case_id: runtime.brand.cases[1],
          event_id: "case-event-1",
        },
      }),
    ],
    ["no receipt", field("receipt", null)],
  ];

  it.each(
    BRANDS.flatMap((brand) =>
      tampers.map(([label, tamper]) => [brand.label, label, brand, tamper]),
    ) as Array<[string, string, Brand, Tamper[1]]>,
  )(
    "%s: an applied write whose answer names %s stays held",
    async (_brand, _label, brand, tamper) => {
      const { holder, contextId } = await r20Holder(brand);
      const runtime = runtimeOf(brand);
      runtime.tamper = (body) => tamper(runtime, body);
      const write = await heldWrite(holder, contextId, 1, { dispatch: true });
      expect(await holder.status(write.operationId)).toMatchObject({
        status: 200,
        body: { phase: "assertion_issued" },
      });
      expect(statusReads(brand, write.operationId)).toEqual([["wallet", 200]]);
      expect(faceWrites(brand, write.operationId)).toBe(1);
    },
  );

  it.each(
    BRANDS.map((brand) => [brand.label, brand]) as Array<[string, Brand]>,
  )(
    "%s: another holder's record, an incompatible artifact or a runtime without r20 never settles it",
    async (_label, brand) => {
      const { holder, contextId } = await r20Holder(brand);
      const runtime = runtimeOf(brand);
      const write = await heldWrite(holder, contextId, 1, { dispatch: true });
      const record = runtime.writes.get(`warranty:${write.operationId}`)!;
      const states: Array<[string, () => void, number]> = [
        [
          "another holder's record",
          () =>
            runtime.writes.set(`warranty:${write.operationId}`, {
              ...record,
              holder: brand.recipient.address,
            }),
          404,
        ],
        [
          "an artifact outside the runtime's compatible set",
          () => {
            runtime.writes.set(`warranty:${write.operationId}`, record);
            runtime.compatible = new Set([`sha256:${"0".repeat(64)}`]);
          },
          409,
        ],
        [
          "a runtime without r20",
          () => {
            runtime.compatible = undefined;
            runtime.r20 = false;
          },
          400,
        ],
      ];
      for (const [label, arrange, answered] of states) {
        arrange();
        expect([
          label,
          (await holder.status(write.operationId)).body.phase,
        ]).toEqual([label, "assertion_issued"]);
        expect(statusReads(brand, write.operationId).at(-1)).toEqual([
          "wallet",
          answered,
        ]);
      }
      expect(faceWrites(brand, write.operationId)).toBe(1);
    },
  );

  it.each(
    BRANDS.map((brand) => [brand.label, brand]) as Array<[string, Brand]>,
  )(
    "%s: a full journal makes room only from a write proven applied; without one it stays full",
    async (_label, brand) => {
      const { holder, contextId } = await r20Holder(brand);
      // The registration and five held writes: only the second was applied.
      const writes = [];
      for (const n of [1, 2, 3, 4, 5]) {
        writes.push(
          (await heldWrite(holder, contextId, n, { dispatch: n === 2 }))
            .operationId,
        );
      }
      const listed = async () =>
        (
          (await holder.list()).body.operations as Array<{
            operation_id: string;
            phase: string;
          }>
        ).map((item) => [item.operation_id, item.phase]);
      expect(await listed()).toHaveLength(6);
      const begin = (n: number) =>
        holder.operations({
          transition: "begin",
          kind: "runtime",
          operation: "case.evidence.submit",
          object_id: brand.unit.id,
          case_id: brand.cases[0],
          operation_id: `case-write-${brand.tag}-000${n}`,
          context_id: contextId,
        });
      // The two oldest held writes are read: the first is unknown (held),
      // the second proven applied, settled and so the room made.
      expect((await begin(6)).status).toBe(200);
      expect(statusReads(brand, writes[0])).toEqual([["wallet", 404]]);
      expect(statusReads(brand, writes[1])).toEqual([["wallet", 200]]);
      const journal = await listed();
      expect(journal).toHaveLength(6);
      expect(journal).toContainEqual([writes[0], "assertion_issued"]);
      expect(journal.map(([id]) => id)).not.toContain(writes[1]);
      // Nothing left is proven: the next begin is refused, nothing evicted.
      const mints = minted.mock.calls.length;
      expect(await begin(7)).toMatchObject({
        status: 409,
        body: { code: "journal_full" },
      });
      expect(
        minted.mock.calls
          .slice(mints)
          .map(([input]) => (input as { operation: string }).operation),
      ).toEqual(["write.status", "write.status"]);
      expect(await listed()).toEqual(journal);
      for (const operationId of writes) {
        expect(faceWrites(brand, operationId)).toBe(
          operationId === writes[1] ? 1 : 0,
        );
      }
    },
  );
});
