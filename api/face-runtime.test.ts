/**
 * @jest-environment node
 */
// PROPOSED contract r20 (docs/proposals/runtime-write-status-r20.md), NOT
// DEPLOYED by any Studio runtime: the host's three r20 readers against
// LABELLED LOCAL FIXTURE answers only. Fictional ids, no network (the bounded
// fetch is stubbed), no credentials. Every answer that is not exactly r20
// proves nothing: held, nothing acknowledged, nothing re-sent.
jest.mock("@/api/face-artifact", () => {
  const actual = jest.requireActual("@/api/face-artifact");
  return { ...actual, fetchBounded: jest.fn() };
});

import { createHash } from "node:crypto";
import { fetchBounded } from "@/api/face-artifact";
import {
  acknowledgeRecovery,
  outcomeHashOf,
  readRecoveryList,
  readWriteStatus,
  recoveryAckRequest,
  recoveryListRequest,
  runtimeRequestHash,
  verifiedOutcomeProof,
  writeStatusRequest,
} from "@/api/face-runtime";
import { canonicalJson } from "@/app/_domain/product-face";

type Json = Record<string, unknown>;

const RUNTIME = {
  origin: "https://runtime.example",
  applicationId: "tig.passport.morrow-home",
};
const ASSERTION = "fixture.assertion";
const OPERATION_ID = "op-fixture-00000001";
const LISTING_ID = "list-fixture-0001";
const OBJECT_ID = "0123456789abcdef01234567";
const CASE_ID = "case-fixture-1";
const OFFER_ID = `pto-${"c".repeat(24)}`;
const ARTIFACT = { version: "1.0.0", artifactHash: `sha256:${"a".repeat(64)}` };
const RECORDED_ARTIFACT = {
  version: "0.9.0",
  artifactHash: `sha256:${"9".repeat(64)}`,
};
const REQUEST_HASH = `sha256:${"b".repeat(64)}`;
const AS_OF = "2026-10-16T09:00:00Z";

/** §0 echoed binding, with the request's own operation id. */
function echo(operationId: string): Json {
  return {
    operation_id: operationId,
    holder: "0x1234567890abcdef1234567890abcdef12345678",
    wallet: "wallet-fixture-1",
    issuer: "https://wallet.example",
    application_id: RUNTIME.applicationId,
    programme: "programme-fixture-1",
    asserting_artifact: ARTIFACT,
  };
}

function accounting(acknowledgementsRecorded = 0): Json {
  return {
    writesExecuted: 0,
    dualWritesExecuted: 0,
    providerWritesExecuted: 0,
    unknownWriteOutcomes: 0,
    secretReturned: false,
    bookkeeping: { assertionsConsumed: 1, acknowledgementsRecorded },
  };
}

function without(body: Json, key: string): Json {
  const copy = { ...body };
  delete copy[key];
  return copy;
}

function answer(status: number, body: unknown) {
  jest.mocked(fetchBounded).mockResolvedValueOnce({
    status,
    body: Buffer.from(
      typeof body === "string" ? body : JSON.stringify(body),
      "utf8",
    ),
    contentType: "application/json",
  });
}

function sentRequest(): { url: string; headers: Json; body: Json } {
  const [url, , init] = jest.mocked(fetchBounded).mock.calls[0];
  return {
    url,
    headers: init?.headers as Json,
    body: JSON.parse(String(init?.body)) as Json,
  };
}

beforeEach(() => {
  jest.mocked(fetchBounded).mockReset();
});

// --- write.status -----------------------------------------------------------

const WRITE_REQUEST = writeStatusRequest(
  OPERATION_ID,
  { object_id: OBJECT_ID, case_id: CASE_ID },
  "case.open",
);
const RECEIPT = { kind: "case_event", case_id: CASE_ID, event_id: "evt-1" };
const WRITE_PROOF = {
  kind: "runtime",
  operation_id: OPERATION_ID,
  operation: "case.open",
  object_id: OBJECT_ID,
  case_id: CASE_ID,
  receipt: RECEIPT,
  status: "write_applied",
};

/** The proposal's §1 example answer, with a real outcome_hash. */
function writeApplied(): Json {
  return {
    ok: true,
    status: "write_applied",
    contract: "r20",
    ...echo(OPERATION_ID),
    operation: "case.open",
    target: { object_id: OBJECT_ID, case_id: CASE_ID },
    request_hash: REQUEST_HASH,
    recorded_artifact: RECORDED_ARTIFACT,
    artifact_compatible: true,
    readback: "verified",
    receipt: RECEIPT,
    dual: {
      backed: false,
      intended_dual_writes: 0,
      reason: "server_only_effect",
      target_readback: "verified",
    },
    outcome_proof: WRITE_PROOF,
    outcome_hash: outcomeHashOf(WRITE_PROOF),
    acknowledged: false,
    ...accounting(),
  };
}

async function writeStatusOf(status: number, body: unknown) {
  answer(status, body);
  return readWriteStatus(RUNTIME, WRITE_REQUEST, ASSERTION);
}

describe("writeStatusRequest", () => {
  it("binds the ORIGINAL operation through input.original_operation", () => {
    expect(WRITE_REQUEST).toEqual({
      operation: "write.status",
      operationId: OPERATION_ID,
      target: { object_id: OBJECT_ID, case_id: CASE_ID },
      input: { original_operation: "case.open" },
    });
    expect(
      writeStatusRequest(
        OPERATION_ID,
        { object_id: OBJECT_ID },
        "transfer.offer",
      ).target,
    ).toEqual({ object_id: OBJECT_ID });
    // request_hash covers the original operation, so a different one is a
    // different request.
    expect(runtimeRequestHash(WRITE_REQUEST)).not.toBe(
      runtimeRequestHash(
        writeStatusRequest(
          OPERATION_ID,
          { object_id: OBJECT_ID, case_id: CASE_ID },
          "case.evidence.submit",
        ),
      ),
    );
  });
});

describe("readWriteStatus (proposed r20)", () => {
  it("sends the fixed read and parses the exact write_applied answer", async () => {
    const result = await writeStatusOf(200, writeApplied());
    expect(result).toEqual({
      outcome: "applied",
      record: {
        operationId: OPERATION_ID,
        holder: "0x1234567890abcdef1234567890abcdef12345678",
        wallet: "wallet-fixture-1",
        issuer: "https://wallet.example",
        applicationId: RUNTIME.applicationId,
        programme: "programme-fixture-1",
        assertingArtifact: ARTIFACT,
        operation: "case.open",
        objectId: OBJECT_ID,
        caseId: CASE_ID,
        requestHash: REQUEST_HASH,
        recordedArtifact: RECORDED_ARTIFACT,
        receipt: { kind: "case_event", caseId: CASE_ID, eventId: "evt-1" },
        dual: { backed: false, targetReadback: "verified" },
        outcomeProof: WRITE_PROOF,
        outcomeHash: outcomeHashOf(WRITE_PROOF),
        acknowledged: false,
      },
    });
    const sent = sentRequest();
    expect(sent.url).toBe(
      "https://runtime.example/api/product-face/v1/operations",
    );
    expect(sent.headers["x-tig-product-face-application"]).toBe(
      RUNTIME.applicationId,
    );
    expect(sent.body).toEqual({ ...WRITE_REQUEST, assertion: ASSERTION });
  });

  it("parses a transfer_offer receipt without a case", async () => {
    const request = writeStatusRequest(
      OPERATION_ID,
      { object_id: OBJECT_ID },
      "transfer.offer",
    );
    const receipt = {
      kind: "transfer_offer",
      offer_id: OFFER_ID,
      state: "offered",
    };
    const proof = {
      ...WRITE_PROOF,
      operation: "transfer.offer",
      case_id: null,
      receipt,
    };
    answer(200, {
      ...writeApplied(),
      operation: "transfer.offer",
      target: { object_id: OBJECT_ID },
      receipt,
      outcome_proof: proof,
      outcome_hash: outcomeHashOf(proof),
    });
    const result = await readWriteStatus(RUNTIME, request, ASSERTION);
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") return;
    expect(result.record.caseId).toBeNull();
    expect(result.record.receipt).toEqual({
      kind: "transfer_offer",
      offerId: OFFER_ID,
      state: "offered",
    });
  });

  it('returns target_readback "absent" as applied for the caller to HOLD', async () => {
    const body = writeApplied();
    body.dual = { ...(body.dual as Json), target_readback: "absent" };
    const result = await writeStatusOf(200, body);
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") return;
    expect(result.record.dual).toEqual({
      backed: false,
      targetReadback: "absent",
    });
  });

  it.each<[string, (body: Json) => Json]>([
    ["contract missing", (body) => without(body, "contract")],
    ["contract r19", (body) => ({ ...body, contract: "r19" })],
    ["readback accepted", (body) => ({ ...body, readback: "accepted" })],
    ["readback missing", (body) => without(body, "readback")],
    [
      "artifact_compatible false",
      (body) => ({ ...body, artifact_compatible: false }),
    ],
    ["ok false", (body) => ({ ...body, ok: false })],
    ["status write_refused", (body) => ({ ...body, status: "write_refused" })],
    ["bookkeeping missing", (body) => without(body, "bookkeeping")],
    [
      "bookkeeping acknowledgementsRecorded 1",
      (body) => ({
        ...body,
        bookkeeping: { assertionsConsumed: 1, acknowledgementsRecorded: 1 },
      }),
    ],
    [
      "bookkeeping assertionsConsumed 0",
      (body) => ({
        ...body,
        bookkeeping: { assertionsConsumed: 0, acknowledgementsRecorded: 0 },
      }),
    ],
    [
      "dual.backed true without a proof",
      (body) => ({ ...body, dual: { ...(body.dual as Json), backed: true } }),
    ],
    [
      "dual.intended_dual_writes 1 on a server-only effect",
      (body) => ({
        ...body,
        dual: { ...(body.dual as Json), intended_dual_writes: 1 },
      }),
    ],
    [
      "dual.reason not a plain code",
      (body) => ({
        ...body,
        dual: { ...(body.dual as Json), reason: "Server only" },
      }),
    ],
    [
      "dual.target_readback unknown",
      (body) => ({
        ...body,
        dual: { ...(body.dual as Json), target_readback: "unknown" },
      }),
    ],
    ["dual missing", (body) => without(body, "dual")],
    ["acknowledged missing", (body) => without(body, "acknowledged")],
    ["acknowledged as text", (body) => ({ ...body, acknowledged: "false" })],
    [
      "outcome_hash mismatch",
      (body) => ({ ...body, outcome_hash: `sha256:${"0".repeat(64)}` }),
    ],
    ["outcome_hash missing", (body) => without(body, "outcome_hash")],
    ["outcome_proof missing", (body) => without(body, "outcome_proof")],
    [
      "outcome_proof object_id differs from the answer (hash recomputed)",
      (body) => {
        const proof = { ...WRITE_PROOF, object_id: "f".repeat(24) };
        return {
          ...body,
          outcome_proof: proof,
          outcome_hash: outcomeHashOf(proof),
        };
      },
    ],
    [
      "outcome_proof receipt differs from the answer (hash recomputed)",
      (body) => {
        const proof = {
          ...WRITE_PROOF,
          receipt: { ...RECEIPT, event_id: "evt-2" },
        };
        return {
          ...body,
          outcome_proof: proof,
          outcome_hash: outcomeHashOf(proof),
        };
      },
    ],
    [
      "outcome_proof case_id differs from the answer (hash recomputed)",
      (body) => {
        const proof = { ...WRITE_PROOF, case_id: null };
        return {
          ...body,
          outcome_proof: proof,
          outcome_hash: outcomeHashOf(proof),
        };
      },
    ],
    [
      "outcome_proof operation differs from the answer (hash recomputed)",
      (body) => {
        const proof = { ...WRITE_PROOF, operation: "case.evidence.submit" };
        return {
          ...body,
          outcome_proof: proof,
          outcome_hash: outcomeHashOf(proof),
        };
      },
    ],
    [
      "outcome_proof status write_refused (hash recomputed)",
      (body) => {
        const proof = { ...WRITE_PROOF, status: "write_refused" };
        return {
          ...body,
          outcome_proof: proof,
          outcome_hash: outcomeHashOf(proof),
        };
      },
    ],
    [
      "outcome_proof with an extra field (hash recomputed)",
      (body) => {
        const proof = { ...WRITE_PROOF, owner: "0xabc" };
        return {
          ...body,
          outcome_proof: proof,
          outcome_hash: outcomeHashOf(proof),
        };
      },
    ],
    [
      "operation_id malformed",
      (body) => ({ ...body, operation_id: "Not An Id" }),
    ],
    ["holder missing", (body) => without(body, "holder")],
    ["issuer empty", (body) => ({ ...body, issuer: "" })],
    [
      "asserting_artifact malformed",
      (body) => ({
        ...body,
        asserting_artifact: { version: "1.0", artifactHash: "abc" },
      }),
    ],
    ["recorded_artifact missing", (body) => without(body, "recorded_artifact")],
    [
      "request_hash malformed",
      (body) => ({ ...body, request_hash: "sha256:short" }),
    ],
    ["target missing", (body) => without(body, "target")],
    [
      "target.object_id malformed",
      (body) => ({ ...body, target: { object_id: "nope", case_id: CASE_ID } }),
    ],
    [
      "target.case_id null",
      (body) => ({ ...body, target: { object_id: OBJECT_ID, case_id: null } }),
    ],
    ["receipt null", (body) => ({ ...body, receipt: null })],
    [
      "receipt of an unknown kind",
      (body) => ({ ...body, receipt: { kind: "outbox", id: "x" } }),
    ],
    ["operation too long", (body) => ({ ...body, operation: "x".repeat(65) })],
  ])("holds a write_applied answer with %s", async (_label, mutate) => {
    expect(await writeStatusOf(200, mutate(writeApplied()))).toEqual({
      outcome: "held",
    });
  });

  it.each([
    "writesExecuted",
    "dualWritesExecuted",
    "providerWritesExecuted",
    "unknownWriteOutcomes",
  ])(
    'holds when business counter %s is 1, missing, null or "0"',
    async (counter) => {
      for (const value of [1, undefined, null, "0"]) {
        const body =
          value === undefined
            ? without(writeApplied(), counter)
            : { ...writeApplied(), [counter]: value };
        expect(await writeStatusOf(200, body)).toEqual({ outcome: "held" });
      }
    },
  );

  it('holds when secretReturned is true, missing, null or "false"', async () => {
    for (const value of [true, undefined, null, "false"]) {
      const body =
        value === undefined
          ? without(writeApplied(), "secretReturned")
          : { ...writeApplied(), secretReturned: value };
      expect(await writeStatusOf(200, body)).toEqual({ outcome: "held" });
    }
  });

  it.each([
    [404, { status: "face_operation_not_found" }],
    // Unbound (no §0 echo): proves nothing about any record.
    [409, { status: "write_outcome_unknown", reason: "unresolved" }],
    [409, { status: "face_operation_artifact_retired" }],
    [400, { status: "face_request_invalid" }],
    [202, writeApplied()],
    [500, "unavailable"],
  ])("holds HTTP %i whatever the body", async (status, body) => {
    expect(await writeStatusOf(status, body)).toEqual({ outcome: "held" });
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["an array", [writeApplied()]],
    ["a string", JSON.stringify("write_applied")],
    ["null", "null"],
  ])("holds a 200 whose body is %s", async (_label, body) => {
    expect(await writeStatusOf(200, body)).toEqual({ outcome: "held" });
  });

  it("holds a lost, oversized or timed-out answer and a thrown fetch", async () => {
    jest.mocked(fetchBounded).mockResolvedValueOnce(undefined);
    expect(await readWriteStatus(RUNTIME, WRITE_REQUEST, ASSERTION)).toEqual({
      outcome: "held",
    });
    jest.mocked(fetchBounded).mockRejectedValueOnce(new Error("socket"));
    expect(await readWriteStatus(RUNTIME, WRITE_REQUEST, ASSERTION)).toEqual({
      outcome: "held",
    });
  });
});

// --- recovery.list ----------------------------------------------------------

const TRANSFER_ITEM = {
  kind: "transfer",
  operation_id: "op-step-000000000001",
  operation: "transfer.transfer",
  object_id: OBJECT_ID,
  case_id: null,
  offer_id: OFFER_ID,
  proposal_id: "prop-1",
  step: "transfer",
  action_id: "act-1",
  state: "completed",
  recorded_at: "2026-10-16T08:30:00Z",
  recorded_artifact: RECORDED_ARTIFACT,
  artifact_compatible: true,
};

/** The proposal's §2 example page. */
function recoveryListed(items: unknown[] = [TRANSFER_ITEM]): Json {
  return {
    ok: true,
    status: "recovery_listed",
    contract: "r20",
    ...echo(LISTING_ID),
    scan_id: "scan-fixture-1",
    as_of: AS_OF,
    items,
    next: null,
    complete: true,
    ...accounting(),
  };
}

const LIST_REQUEST = recoveryListRequest(LISTING_ID);

async function recoveryListOf(status: number, body: unknown) {
  answer(status, body);
  return readRecoveryList(RUNTIME, LIST_REQUEST, ASSERTION);
}

const REGISTRATION_ITEM = {
  ...TRANSFER_ITEM,
  kind: "registration",
  operation_id: "op-reg-0000000000001",
  operation: "registration.submit",
  offer_id: null,
  proposal_id: null,
  step: null,
  action_id: null,
  state: "unresolved",
};
const SETTLE_ITEM = {
  ...TRANSFER_ITEM,
  kind: "settle",
  operation_id: "op-settle-00000000001",
  operation: "registration.settle",
  offer_id: null,
  step: null,
  state: "refused",
};
const RUNTIME_ITEM = {
  ...TRANSFER_ITEM,
  kind: "runtime",
  operation_id: OPERATION_ID,
  operation: "case.open",
  case_id: CASE_ID,
  offer_id: null,
  proposal_id: null,
  step: null,
  action_id: null,
};

describe("recoveryListRequest", () => {
  it("lists with an empty target and the cursor only when following", () => {
    expect(LIST_REQUEST).toEqual({
      operation: "recovery.list",
      operationId: LISTING_ID,
      target: {},
      input: {},
    });
    expect(recoveryListRequest(LISTING_ID, "cur-2").input).toEqual({
      cursor: "cur-2",
    });
  });
});

describe("readRecoveryList (proposed r20)", () => {
  it("parses the exact recovery_listed page", async () => {
    const result = await recoveryListOf(200, recoveryListed());
    expect(result).toEqual({
      outcome: "listed",
      page: {
        operationId: LISTING_ID,
        holder: "0x1234567890abcdef1234567890abcdef12345678",
        wallet: "wallet-fixture-1",
        issuer: "https://wallet.example",
        applicationId: RUNTIME.applicationId,
        programme: "programme-fixture-1",
        assertingArtifact: ARTIFACT,
        scanId: "scan-fixture-1",
        asOf: AS_OF,
        items: [
          {
            kind: "transfer",
            operationId: "op-step-000000000001",
            operation: "transfer.transfer",
            objectId: OBJECT_ID,
            caseId: null,
            offerId: OFFER_ID,
            proposalId: "prop-1",
            step: "transfer",
            actionId: "act-1",
            state: "completed",
            recordedAt: "2026-10-16T08:30:00Z",
            recordedArtifact: RECORDED_ARTIFACT,
            artifactCompatible: true,
          },
        ],
        unreadable: [],
        next: null,
        complete: true,
      },
    });
    expect(sentRequest().body).toEqual({
      ...LIST_REQUEST,
      assertion: ASSERTION,
    });
  });

  it("keeps an item it can read only by identity (a record retained however malformed) as unreadable, and holds a page whose item has no identity", async () => {
    // Shaped as the actual Studio runtime shapes an index entry it retains
    // although malformed (src/product-face-recovery.mjs recoveryItemOf).
    const malformed = {
      kind: "runtime",
      operation_id: "case-legacy-0001",
      operation: null,
      object_id: null,
      case_id: null,
      offer_id: null,
      proposal_id: null,
      step: null,
      action_id: null,
      state: "unresolved",
      recorded_at: "2026-10-16T09:00:00.000Z",
      recorded_artifact: null,
      artifact_compatible: false,
    };
    const result = await recoveryListOf(
      200,
      recoveryListed([TRANSFER_ITEM, malformed]),
    );
    expect(result.outcome).toBe("listed");
    if (result.outcome !== "listed") return;
    expect(result.page.items).toHaveLength(1);
    expect(result.page.unreadable).toEqual([
      {
        operationId: "case-legacy-0001",
        kind: "runtime",
        state: "unresolved",
        recordedAt: "2026-10-16T09:00:00.000Z",
      },
    ]);
    for (const broken of [
      { ...malformed, operation_id: "x" },
      { ...malformed, kind: "legacy" },
      { ...malformed, state: "lost" },
      { ...malformed, recorded_at: "yesterday" },
    ]) {
      expect(await recoveryListOf(200, recoveryListed([broken]))).toEqual({
        outcome: "unavailable",
        reason: "invalid",
      });
    }
  });

  it("parses every kind, an empty page and a following page", async () => {
    const page = {
      ...recoveryListed([
        REGISTRATION_ITEM,
        SETTLE_ITEM,
        TRANSFER_ITEM,
        RUNTIME_ITEM,
      ]),
      next: "cur-2",
      complete: false,
    };
    const result = await recoveryListOf(200, page);
    expect(result.outcome).toBe("listed");
    if (result.outcome !== "listed") return;
    expect(result.page.items.map((item) => item.kind)).toEqual([
      "registration",
      "settle",
      "transfer",
      "runtime",
    ]);
    expect(result.page.items[3]).toMatchObject({
      caseId: CASE_ID,
      offerId: null,
      proposalId: null,
      step: null,
      actionId: null,
    });
    expect(result.page.next).toBe("cur-2");
    expect(result.page.complete).toBe(false);
    expect(await recoveryListOf(200, recoveryListed([]))).toMatchObject({
      outcome: "listed",
      page: { items: [], unreadable: [], next: null, complete: true },
    });
  });

  it("is unsupported on an older runtime: 400 face_request_invalid", async () => {
    expect(
      await recoveryListOf(400, { status: "face_request_invalid" }),
    ).toEqual({ outcome: "unsupported" });
  });

  it("is unsupported on a 200 without contract r20", async () => {
    expect(
      await recoveryListOf(200, without(recoveryListed(), "contract")),
    ).toEqual({ outcome: "unsupported" });
  });

  it.each([
    ["503 recovery_unavailable", 503, { status: "recovery_unavailable" }],
    ["409 recovery_cursor_invalid", 409, { status: "recovery_cursor_invalid" }],
    ["409 recovery_cursor_expired", 409, { status: "recovery_cursor_expired" }],
    ["a 400 that is not face_request_invalid", 400, { status: "forbidden" }],
    ["a 400 without a readable body", 400, "{"],
    ["a 200 with invalid JSON", 200, "{not json"],
    ["a 200 array", 200, [recoveryListed()]],
  ])("is unavailable on %s", async (_label, status, body) => {
    expect(await recoveryListOf(status, body)).toMatchObject({
      outcome: "unavailable",
    });
  });

  it("is unavailable when the fetch is lost or throws", async () => {
    jest.mocked(fetchBounded).mockResolvedValueOnce(undefined);
    expect(
      await readRecoveryList(RUNTIME, LIST_REQUEST, ASSERTION),
    ).toMatchObject({ outcome: "unavailable" });
    jest.mocked(fetchBounded).mockRejectedValueOnce(new Error("socket"));
    expect(
      await readRecoveryList(RUNTIME, LIST_REQUEST, ASSERTION),
    ).toMatchObject({ outcome: "unavailable" });
  });

  it.each<[string, (body: Json) => Json]>([
    ["ok false", (body) => ({ ...body, ok: false })],
    ["status differing", (body) => ({ ...body, status: "listed" })],
    ["scan_id missing", (body) => without(body, "scan_id")],
    ["as_of unparseable", (body) => ({ ...body, as_of: "yesterday" })],
    ["next empty", (body) => ({ ...body, next: "" })],
    ["next too long", (body) => ({ ...body, next: "c".repeat(513) })],
    ["complete missing", (body) => without(body, "complete")],
    ["complete as text", (body) => ({ ...body, complete: "true" })],
    ["items not an array", (body) => ({ ...body, items: {} })],
    ["writesExecuted 1", (body) => ({ ...body, writesExecuted: 1 })],
    ["secretReturned missing", (body) => without(body, "secretReturned")],
    [
      "bookkeeping acknowledgementsRecorded 1",
      (body) => ({
        ...body,
        bookkeeping: { assertionsConsumed: 1, acknowledgementsRecorded: 1 },
      }),
    ],
    ["operation_id malformed", (body) => ({ ...body, operation_id: "X" })],
    ["programme missing", (body) => without(body, "programme")],
    [
      "asserting_artifact malformed",
      (body) => ({ ...body, asserting_artifact: { version: "1.0.0" } }),
    ],
  ])("is unavailable with %s", async (_label, mutate) => {
    expect(await recoveryListOf(200, mutate(recoveryListed()))).toMatchObject({
      outcome: "unavailable",
    });
  });

  it("is unavailable with 51 items", async () => {
    const items = Array.from({ length: 51 }, (_, index) => ({
      ...TRANSFER_ITEM,
      operation_id: `op-step-${String(index).padStart(12, "0")}`,
    }));
    expect(await recoveryListOf(200, recoveryListed(items))).toMatchObject({
      outcome: "unavailable",
    });
    expect(
      await recoveryListOf(200, recoveryListed(items.slice(0, 50))),
    ).toMatchObject({ outcome: "listed" });
  });

  // An item without even an identity (id, kind, state, recorded time) makes
  // the page unreadable, never a shorter page.
  it.each<[string, unknown]>([
    ["a non-object item", "transfer"],
    ["an unknown kind", { ...TRANSFER_ITEM, kind: "quote" }],
    ["a malformed operation_id", { ...TRANSFER_ITEM, operation_id: "Op 1" }],
    ["an unknown state", { ...TRANSFER_ITEM, state: "pending" }],
    ["an unparseable recorded_at", { ...TRANSFER_ITEM, recorded_at: "now" }],
  ])("is unavailable when one item is %s", async (_label, item) => {
    expect(
      await recoveryListOf(200, recoveryListed([REGISTRATION_ITEM, item])),
    ).toEqual({ outcome: "unavailable", reason: "invalid" });
  });

  // An item with an identity but any other field malformed, or carrying a
  // field not of its kind, is kept by that identity alone: never a full
  // item, never resolved; the caller counts it and holds the check incomplete.
  it.each<[string, unknown]>([
    ["a malformed object_id", { ...TRANSFER_ITEM, object_id: "unit-1" }],
    ["a malformed offer_id", { ...TRANSFER_ITEM, offer_id: "offer-1" }],
    ["an unknown step", { ...TRANSFER_ITEM, step: "accept" }],
    [
      "a malformed recorded_artifact",
      { ...TRANSFER_ITEM, recorded_artifact: { version: "1.0.0" } },
    ],
    [
      "artifact_compatible missing",
      without(TRANSFER_ITEM, "artifact_compatible"),
    ],
    ["case_id undefined", without(TRANSFER_ITEM, "case_id")],
    [
      "a transfer with step request under transfer.transfer",
      { ...TRANSFER_ITEM, step: "request" },
    ],
    [
      "a transfer with operation transfer.request under step transfer",
      { ...TRANSFER_ITEM, operation: "transfer.request" },
    ],
    ["a transfer without an offer", { ...TRANSFER_ITEM, offer_id: null }],
    ["a transfer with a case", { ...TRANSFER_ITEM, case_id: CASE_ID }],
    ["a settle with proposal_id null", { ...SETTLE_ITEM, proposal_id: null }],
    [
      "a settle with another operation",
      { ...SETTLE_ITEM, operation: "registration.submit" },
    ],
    [
      "a registration with a proposal",
      { ...REGISTRATION_ITEM, proposal_id: "prop-1" },
    ],
    [
      "a registration with another operation",
      { ...REGISTRATION_ITEM, operation: "registration.settle" },
    ],
    [
      "a runtime item whose operation is not a write",
      { ...RUNTIME_ITEM, operation: "case.read" },
    ],
    ["a runtime item with a step", { ...RUNTIME_ITEM, step: "request" }],
    ["a runtime item with an offer", { ...RUNTIME_ITEM, offer_id: OFFER_ID }],
  ])(
    "keeps %s by its identity only, beside the items it can read",
    async (_label, item) => {
      const result = await recoveryListOf(
        200,
        recoveryListed([REGISTRATION_ITEM, item]),
      );
      expect(result.outcome).toBe("listed");
      if (result.outcome !== "listed") return;
      const broken = item as Record<string, unknown>;
      expect(result.page.items.map((listed) => listed.operationId)).toEqual([
        REGISTRATION_ITEM.operation_id,
      ]);
      expect(result.page.unreadable).toEqual([
        {
          operationId: broken.operation_id,
          kind: broken.kind,
          state: broken.state,
          recordedAt: broken.recorded_at,
        },
      ]);
    },
  );
});

// --- recovery.ack -----------------------------------------------------------

const ACK_HASH = outcomeHashOf(WRITE_PROOF);
const ACK_REQUEST = recoveryAckRequest(
  OPERATION_ID,
  { object_id: OBJECT_ID, case_id: CASE_ID },
  "case.open",
  ACK_HASH,
);

/** The proposal's §3 example answer. */
function recoveryAcknowledged(first = true): Json {
  return {
    ok: true,
    status: "recovery_acknowledged",
    contract: "r20",
    ...echo(OPERATION_ID),
    outcome_hash: ACK_HASH,
    first,
    acknowledged_at: AS_OF,
    ...accounting(first ? 1 : 0),
  };
}

async function recoveryAckOf(status: number, body: unknown) {
  answer(status, body);
  return acknowledgeRecovery(RUNTIME, ACK_REQUEST, ASSERTION);
}

describe("recoveryAckRequest", () => {
  it("names the ORIGINAL operation, target and the proved outcome hash", () => {
    expect(ACK_REQUEST).toEqual({
      operation: "recovery.ack",
      operationId: OPERATION_ID,
      target: { object_id: OBJECT_ID, case_id: CASE_ID },
      input: { original_operation: "case.open", outcome_hash: ACK_HASH },
    });
    expect(
      recoveryAckRequest(
        OPERATION_ID,
        { object_id: OBJECT_ID },
        "registration.submit",
        ACK_HASH,
      ).target,
    ).toEqual({ object_id: OBJECT_ID });
  });
});

describe("acknowledgeRecovery (proposed r20)", () => {
  it("acknowledges the first call (one row) and a replay (no row)", async () => {
    expect(await recoveryAckOf(200, recoveryAcknowledged(true))).toEqual({
      outcome: "acknowledged",
      first: true,
      echo: {
        operationId: OPERATION_ID,
        holder: "0x1234567890abcdef1234567890abcdef12345678",
        wallet: "wallet-fixture-1",
        issuer: "https://wallet.example",
        applicationId: RUNTIME.applicationId,
        programme: "programme-fixture-1",
        assertingArtifact: ARTIFACT,
      },
    });
    expect(sentRequest().body).toEqual({
      ...ACK_REQUEST,
      assertion: ASSERTION,
    });
    expect(await recoveryAckOf(200, recoveryAcknowledged(false))).toMatchObject(
      { outcome: "acknowledged", first: false },
    );
  });

  it.each<[string, (body: Json) => Json]>([
    [
      "an outcome_hash echo that is not the request's",
      (body) => ({ ...body, outcome_hash: `sha256:${"0".repeat(64)}` }),
    ],
    ["outcome_hash missing", (body) => without(body, "outcome_hash")],
    [
      "first true with acknowledgementsRecorded 0",
      (body) => ({ ...body, ...accounting(0) }),
    ],
    [
      "first false with acknowledgementsRecorded 1",
      (body) => ({ ...body, first: false }),
    ],
    ["first missing", (body) => without(body, "first")],
    ["first as text", (body) => ({ ...body, first: "true" })],
    ["contract missing", (body) => without(body, "contract")],
    ["ok false", (body) => ({ ...body, ok: false })],
    ["status differing", (body) => ({ ...body, status: "acknowledged" })],
    ["writesExecuted 1", (body) => ({ ...body, writesExecuted: 1 })],
    ["bookkeeping missing", (body) => without(body, "bookkeeping")],
    ["operation_id malformed", (body) => ({ ...body, operation_id: "X" })],
    ["wallet missing", (body) => without(body, "wallet")],
  ])("holds a 200 with %s", async (_label, mutate) => {
    expect(await recoveryAckOf(200, mutate(recoveryAcknowledged()))).toEqual({
      outcome: "held",
    });
  });

  it.each([
    [409, { status: "recovery_unresolved" }],
    [409, { status: "recovery_outcome_mismatch" }],
    [404, { status: "face_operation_not_found" }],
    [400, { status: "face_request_invalid" }],
    [202, recoveryAcknowledged()],
    [500, "unavailable"],
  ])("holds HTTP %i", async (status, body) => {
    expect(await recoveryAckOf(status, body)).toEqual({ outcome: "held" });
  });

  it("holds invalid JSON, a non-object, a lost answer and a thrown fetch", async () => {
    expect(await recoveryAckOf(200, "{not json")).toEqual({ outcome: "held" });
    expect(await recoveryAckOf(200, [recoveryAcknowledged()])).toEqual({
      outcome: "held",
    });
    jest.mocked(fetchBounded).mockResolvedValueOnce(undefined);
    expect(await acknowledgeRecovery(RUNTIME, ACK_REQUEST, ASSERTION)).toEqual({
      outcome: "held",
    });
    jest.mocked(fetchBounded).mockRejectedValueOnce(new Error("socket"));
    expect(await acknowledgeRecovery(RUNTIME, ACK_REQUEST, ASSERTION)).toEqual({
      outcome: "held",
    });
  });
});

// --- outcome proofs ---------------------------------------------------------

describe("outcomeHashOf and verifiedOutcomeProof", () => {
  const transferProof = {
    kind: "transfer",
    operation_id: "op-step-000000000001",
    offer_id: OFFER_ID,
    object_id: OBJECT_ID,
    step: "transfer",
    action_id: "act-1",
    status: "transferred",
  };
  const expected = {
    kind: "transfer" as const,
    operationId: "op-step-000000000001",
    status: "transferred",
  };

  it("hashes the canonical JSON of the proof, whatever the key order", () => {
    expect(outcomeHashOf(transferProof)).toBe(
      `sha256:${createHash("sha256")
        .update(canonicalJson(transferProof), "utf8")
        .digest("hex")}`,
    );
    const reordered = Object.fromEntries(
      Object.entries(transferProof).reverse(),
    );
    expect(outcomeHashOf(reordered)).toBe(outcomeHashOf(transferProof));
  });

  it("accepts an additive r20 proof whose hash and identity match", () => {
    const body = {
      status: "transferred",
      outcome_proof: transferProof,
      outcome_hash: outcomeHashOf(transferProof),
    };
    expect(verifiedOutcomeProof(body, expected)).toEqual({
      proof: transferProof,
      hash: outcomeHashOf(transferProof),
    });
  });

  it.each<[string, Json]>([
    ["no proof (pre-r20)", { status: "transferred" }],
    ["a proof without a hash", { outcome_proof: transferProof }],
    [
      "a hash that is not the proof's",
      {
        outcome_proof: transferProof,
        outcome_hash: `sha256:${"0".repeat(64)}`,
      },
    ],
    [
      "a hash of another form",
      {
        outcome_proof: transferProof,
        outcome_hash: outcomeHashOf(transferProof).slice(7),
      },
    ],
    [
      "a proof of another kind",
      {
        outcome_proof: { ...transferProof, kind: "settle" },
        outcome_hash: outcomeHashOf({ ...transferProof, kind: "settle" }),
      },
    ],
    [
      "a proof of another operation",
      {
        outcome_proof: { ...transferProof, operation_id: "op-other-00000001" },
        outcome_hash: outcomeHashOf({
          ...transferProof,
          operation_id: "op-other-00000001",
        }),
      },
    ],
    [
      "a proof of another status",
      {
        outcome_proof: {
          ...transferProof,
          status: "transfer_request_committed",
        },
        outcome_hash: outcomeHashOf({
          ...transferProof,
          status: "transfer_request_committed",
        }),
      },
    ],
    [
      "a proof that is not a record",
      { outcome_proof: "transferred", outcome_hash: outcomeHashOf({}) },
    ],
  ])("is undefined for %s", (_label, body) => {
    expect(verifiedOutcomeProof(body, expected)).toBeUndefined();
  });
});

// --- write.status: a Dual-backed effect and a refused write ------------------

describe("readWriteStatus: a Dual-backed write under r20.1 (original_verified_effect_receipt_v1)", () => {
  // SYNTHETIC fixture of the accepted amendment: a case.open that mints a
  // fixture object and then updates the product, two intended Dual effects,
  // each with its receipt chain. The signer is a service account (not the
  // holder); the minted object is not the product target.
  const MINTED = "d".repeat(24);
  const TEMPLATE = "e".repeat(24);
  const SERVICE = `0x${"f1".repeat(20)}`;
  const CONTROLLER = `0x${"c2".repeat(20)}`;
  const RAW = (fill: string) => `0x${fill.repeat(64)}`;
  const INTENT = (fill: string) => `sha256:${fill.repeat(64)}`;
  const readAt = () => new Date(Date.now()).toISOString();
  const verifiedAt = () => new Date(Date.now() - 60_000).toISOString();

  function effect(index: number, objectId: string, fill: string): Json {
    return {
      index,
      action_id: `dual-action-${index + 70}`,
      action_kind: index === 0 ? "mint" : "update",
      object_id: objectId,
      bound_to: {
        operation_id: OPERATION_ID,
        request_hash: REQUEST_HASH,
        effect_index: index,
      },
      intent_commitment: {
        version: "v1",
        scheme: "dual_case_open_v1",
        hash: INTENT(fill),
        preimage_retained: true,
        scope: {
          event_id: `evt-${index}`,
          outbox_id: `outbox-${index}`,
          installation_id: "inst-fixture-1",
        },
      },
      original_receipt: {
        verifier: "runtime_original_verifier",
        verified_at: verifiedAt(),
        action_kind: index === 0 ? "mint" : "update",
        action_id: `dual-action-${index + 70}`,
        object_id: objectId,
        network: "dual_main",
        api_scope: "api_v3",
        template_id: TEMPLATE,
        authority: {
          account: SERVICE,
          controller: index === 0 ? null : CONTROLLER,
        },
        domain_commitment: INTENT(fill),
        projection: "full_declared",
        content_hash_format: "provider_raw_hex_v1",
        content_hash_raw: RAW(fill),
        content_hash_source: "raw_original_content",
      },
      historical_corroboration: {
        read_at: readAt(),
        resolver: "dual_action_log",
        action_id: `dual-action-${index + 70}`,
        action_kind: index === 0 ? "mint" : "update",
        object_id: objectId,
        network: "dual_main",
        api_scope: "api_v3",
        template_id: TEMPLATE,
        execution: "succeeded",
        status_raw: "COMPLETED",
        authority: {
          account: SERVICE,
          controller: index === 0 ? null : CONTROLLER,
        },
        affected_objects: index === 0 ? [MINTED] : [OBJECT_ID, MINTED],
        history_entry_id: `hist-${index}`,
        history_entry_object_id: objectId,
        content_hash_format: "provider_raw_hex_v1",
        content_hash_raw: RAW(fill),
        content_hash_match: true,
      },
      effect_verdict: "verified",
    };
  }
  const projection = (effects: Json[]) => ({
    proof_kind: "original_verified_effect_receipt_v1",
    request: { operation_id: OPERATION_ID, request_hash: REQUEST_HASH },
    effects: effects.map((item) => {
      const intent = item.intent_commitment as Json;
      const receipt = item.original_receipt as Json;
      return {
        index: item.index,
        action_id: item.action_id,
        object_id: item.object_id,
        intent_commitment_hash: intent.hash,
        content_hash_raw: receipt.content_hash_raw,
      };
    }),
  });
  function writeBacked(
    effects: Json[] = [effect(0, MINTED, "a"), effect(1, OBJECT_ID, "b")],
    intended = effects.length,
  ): Json {
    const outcome_proof = { ...WRITE_PROOF, dual: projection(effects) };
    return {
      ...writeApplied(),
      dual: {
        backed: true,
        proof_kind: "original_verified_effect_receipt_v1",
        intended_dual_writes: intended,
        effects,
      },
      outcome_proof,
      outcome_hash: outcomeHashOf(outcome_proof),
    };
  }
  const withEffect = (index: number, change: (item: Json) => Json) => {
    const effects = [effect(0, MINTED, "a"), effect(1, OBJECT_ID, "b")];
    effects[index] = change(effects[index]);
    return writeBacked(effects);
  };
  const inReceipt = (index: number, patch: Json) =>
    withEffect(index, (item) => ({
      ...item,
      original_receipt: { ...(item.original_receipt as Json), ...patch },
    }));
  const inFresh = (index: number, patch: Json) =>
    withEffect(index, (item) => ({
      ...item,
      historical_corroboration: {
        ...(item.historical_corroboration as Json),
        ...patch,
      },
    }));

  it("parses two intended Dual effects, each proved by its own receipt chain", async () => {
    const result = await writeStatusOf(200, writeBacked());
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") return;
    expect(result.record.dual).toMatchObject({
      backed: true,
      proofKind: "original_verified_effect_receipt_v1",
      intendedDualWrites: 2,
    });
    if (!result.record.dual.backed) return;
    expect(
      result.record.dual.effects.map((item) => [
        item.index,
        item.actionId,
        item.objectId,
        item.actionKind,
      ]),
    ).toEqual([
      [0, "dual-action-70", MINTED, "mint"],
      [1, "dual-action-71", OBJECT_ID, "update"],
    ]);
    expect(result.record.dual.effects[0].authority).toEqual({
      account: SERVICE,
      controller: null,
    });
    expect(result.record.dual.effects[1].authority).toEqual({
      account: SERVICE,
      controller: CONTROLLER,
    });
    expect(result.record.dual.effects[1].contentHashRaw).toBe(RAW("b"));
    expect((result.record.outcomeProof.dual as Json).request).toEqual({
      operation_id: OPERATION_ID,
      request_hash: REQUEST_HASH,
    });
  });

  it("normalizes upper-case provider hashes and addresses, never re-hashing them", async () => {
    const upper = (item: Json) => ({
      ...item,
      original_receipt: {
        ...(item.original_receipt as Json),
        content_hash_raw: RAW("a").toUpperCase().replace("0X", "0x"),
        authority: {
          account: SERVICE.toUpperCase().replace("0X", "0x"),
          controller: null,
        },
      },
    });
    const effects = [upper(effect(0, MINTED, "a")), effect(1, OBJECT_ID, "b")];
    const result = await writeStatusOf(200, writeBacked(effects));
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied" || !result.record.dual.backed) return;
    expect(result.record.dual.effects[0].contentHashRaw).toBe(RAW("a"));
    expect(result.record.dual.effects[0].authority.account).toBe(SERVICE);
  });

  it.each<[string, () => Json]>([
    [
      "one effect for two intended",
      () => writeBacked([effect(0, MINTED, "a")], 2),
    ],
    [
      "two effects for one intended",
      () => writeBacked([effect(0, MINTED, "a"), effect(1, OBJECT_ID, "b")], 1),
    ],
    [
      "an unknown proof kind",
      () => ({
        ...writeBacked(),
        dual: {
          ...(writeBacked().dual as Json),
          proof_kind: "executed_input_v1",
        },
      }),
    ],
    [
      "the withdrawn singular proof beside the list",
      () => ({
        ...writeBacked(),
        dual: { ...(writeBacked().dual as Json), proof: {} },
      }),
    ],
    [
      "a withdrawn payload field",
      () => ({
        ...writeBacked(),
        dual: { ...(writeBacked().dual as Json), payload_match: true },
      }),
    ],
    [
      "effects out of order",
      () => writeBacked([effect(1, OBJECT_ID, "b"), effect(0, MINTED, "a")]),
    ],
    [
      "a repeated action id",
      () =>
        withEffect(1, (item) => ({
          ...item,
          action_id: "dual-action-70",
          original_receipt: {
            ...(item.original_receipt as Json),
            action_id: "dual-action-70",
          },
          historical_corroboration: {
            ...(item.historical_corroboration as Json),
            action_id: "dual-action-70",
          },
        })),
    ],
    [
      "an effect bound to another operation",
      () =>
        withEffect(1, (item) => ({
          ...item,
          bound_to: {
            ...(item.bound_to as Json),
            operation_id: "case-write-zz-9999",
          },
        })),
    ],
    [
      "an effect bound to another request",
      () =>
        withEffect(1, (item) => ({
          ...item,
          bound_to: {
            ...(item.bound_to as Json),
            request_hash: `sha256:${"1".repeat(64)}`,
          },
        })),
    ],
    [
      "an effect bound to another index",
      () =>
        withEffect(1, (item) => ({
          ...item,
          bound_to: { ...(item.bound_to as Json), effect_index: 0 },
        })),
    ],
    [
      "an intent preimage not retained",
      () =>
        withEffect(0, (item) => ({
          ...item,
          intent_commitment: {
            ...(item.intent_commitment as Json),
            preimage_retained: false,
          },
        })),
    ],
    [
      "a domain commitment unequal to the intent hash",
      () => inReceipt(0, { domain_commitment: INTENT("9") }),
    ],
    [
      "a receipt without a declared controller",
      () => inReceipt(1, { authority: { account: SERVICE } }),
    ],
    [
      "a controller declared but observed null",
      () => inFresh(1, { authority: { account: SERVICE, controller: null } }),
    ],
    [
      "a null controller but one observed",
      () =>
        inFresh(0, { authority: { account: SERVICE, controller: CONTROLLER } }),
    ],
    [
      "another observed signing account",
      () =>
        inFresh(1, {
          authority: {
            account: `0x${"ab".repeat(20)}`,
            controller: CONTROLLER,
          },
        }),
    ],
    [
      "a sha256-prefixed content hash",
      () => inReceipt(0, { content_hash_raw: `sha256:${"a".repeat(64)}` }),
    ],
    [
      "a bare-hex content hash",
      () => inReceipt(0, { content_hash_raw: "a".repeat(64) }),
    ],
    [
      "a content hash that is a state hash",
      () => inReceipt(0, { content_hash_source: "state_hash" }),
    ],
    [
      "a corroboration with another raw hash",
      () => inFresh(1, { content_hash_raw: RAW("c") }),
    ],
    [
      "a corroboration that says no match",
      () => inFresh(1, { content_hash_match: false }),
    ],
    [
      "a history entry of another object",
      () => inFresh(1, { history_entry_object_id: MINTED }),
    ],
    [
      "an affected list without the object",
      () => inFresh(1, { affected_objects: [MINTED] }),
    ],
    ["a pending execution", () => inFresh(1, { execution: "pending" })],
    ["a failed execution", () => inFresh(0, { execution: "failed" })],
    ["another network", () => inFresh(0, { network: "dual_test" })],
    ["another api scope", () => inFresh(0, { api_scope: "api_v2" })],
    ["another template", () => inFresh(0, { template_id: "1".repeat(24) })],
    [
      "a verification after the read",
      () =>
        inReceipt(0, {
          verified_at: new Date(Date.now() + 120_000).toISOString(),
        }),
    ],
    [
      "a stale read (eleven minutes ago)",
      () =>
        inFresh(0, {
          read_at: new Date(Date.now() - 11 * 60_000).toISOString(),
        }),
    ],
    [
      "an unverified effect verdict",
      () =>
        withEffect(0, (item) => ({ ...item, effect_verdict: "unverified" })),
    ],
    [
      "an outcome proof without the second effect",
      () => {
        const body = writeBacked();
        const dual = (body.outcome_proof as Json).dual as Json;
        const proof = {
          ...(body.outcome_proof as Json),
          dual: { ...dual, effects: (dual.effects as Json[]).slice(0, 1) },
        };
        return {
          ...body,
          outcome_proof: proof,
          outcome_hash: outcomeHashOf(proof),
        };
      },
    ],
    [
      "an outcome proof bound to another request",
      () => {
        const body = writeBacked();
        const dual = (body.outcome_proof as Json).dual as Json;
        const proof = {
          ...(body.outcome_proof as Json),
          dual: {
            ...dual,
            request: {
              operation_id: OPERATION_ID,
              request_hash: `sha256:${"1".repeat(64)}`,
            },
          },
        };
        return {
          ...body,
          outcome_proof: proof,
          outcome_hash: outcomeHashOf(proof),
        };
      },
    ],
  ])("holds a Dual-backed answer with %s", async (_label, make) => {
    expect(await writeStatusOf(200, make())).toEqual({ outcome: "held" });
  });
});

describe("readWriteStatus: a refused write (proposed r20)", () => {
  function writeRefused(): Json {
    const outcome_proof = {
      ...WRITE_PROOF,
      receipt: null,
      status: "write_refused",
    };
    return {
      ...writeApplied(),
      status: "write_refused",
      receipt: null,
      outcome_proof,
      outcome_hash: outcomeHashOf(outcome_proof),
    };
  }

  it("parses the refusal as its own outcome with no receipt", async () => {
    const result = await writeStatusOf(200, writeRefused());
    expect(result.outcome).toBe("refused");
    if (result.outcome !== "refused") return;
    expect(result.record.receipt).toBeNull();
    expect(result.record.operationId).toBe(OPERATION_ID);
    expect(result.record.outcomeProof.status).toBe("write_refused");
  });

  it.each<[string, (body: Json) => Json]>([
    ["a receipt on a refusal", (body) => ({ ...body, receipt: RECEIPT })],
    [
      "a proof that says applied",
      (body) => {
        const proof = {
          ...(body.outcome_proof as Json),
          status: "write_applied",
        };
        return {
          ...body,
          outcome_proof: proof,
          outcome_hash: outcomeHashOf(proof),
        };
      },
    ],
    ["no contract", (body) => without(body, "contract")],
    ["a business write counted", (body) => ({ ...body, writesExecuted: 1 })],
  ])("holds a refusal with %s", async (_label, change) => {
    expect(await writeStatusOf(200, change(writeRefused()))).toEqual({
      outcome: "held",
    });
  });
});
