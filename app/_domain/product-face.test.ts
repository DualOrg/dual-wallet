import {
  canonicalJson,
  checkSettleProposal,
  evaluateCanonicalRegistration,
  isTaskPath,
  matchCompleteTemplate,
  matchSettleTemplate,
  proposalHashInput,
  registrationReadback,
  taskPathFromPathname,
  unlistedCustomKeys,
  type CanonicalRegistrationRules,
  type SettleProposal,
  type SettleRules,
} from "@/app/_domain/product-face";
import { edit, REMOVE } from "@/test/product-face-fixtures";

const rules: CanonicalRegistrationRules = {
  stateField: "state",
  lifecycleTargetField: "lifecycle.target_state",
  settledStates: ["Registered", "Authenticity verified", "In service"],
  unconfirmedStates: ["Transfer pending"],
  endedStates: ["Recalled", "Stolen", "Retired"],
};
const holder = "0x1234567890abcdef1234567890abcdef12345678";

function evaluate(owner: string, custom: unknown) {
  return evaluateCanonicalRegistration(
    registrationReadback(owner, holder, custom, rules),
    rules,
  );
}

describe("canonical registration readback", () => {
  it("is registered only when owner, settled state and lifecycle agree", () => {
    expect(evaluate(holder, { state: "Registered" })).toBe("registered");
    expect(
      evaluate(holder.toUpperCase().replace("0X", "0x"), {
        state: "In service",
        lifecycle: { target_state: "In service" },
      }),
    ).toBe("registered");
  });

  it("never treats a pending transfer as registered", () => {
    // Owner equality alone is not registration (negative regression).
    expect(
      evaluate(holder, {
        state: "Transfer pending",
        lifecycle: { target_state: "Registered" },
      }),
    ).toBe("ownership_moved_state_pending");
    expect(evaluate(holder, { state: "Transfer pending" })).not.toBe(
      "registered",
    );
  });

  it("requires recovery for ended states or a disagreeing lifecycle target", () => {
    expect(evaluate(holder, { state: "Stolen" })).toBe("recovery_required");
    expect(
      evaluate(holder, {
        state: "Registered",
        lifecycle: { target_state: "Retired" },
      }),
    ).toBe("recovery_required");
  });

  it("reports someone else's or a stateless unit as not registered", () => {
    expect(evaluate("0xother", { state: "Registered" })).toBe("not_owned");
    expect(evaluate(holder, {})).toBe("review_required");
    expect(evaluate(holder, { state: "Unknown thing" })).toBe(
      "review_required",
    );
  });
});

describe("task paths", () => {
  it.each([
    ["/", true],
    ["/register", true],
    ["/register/unit-7", true],
    ["/a/b/c/d", true],
    ["/a/b/c/d/e", false],
    ["//evil", false],
    ["/Register", false],
    ["/register/../x", false],
    ["register", false],
    [`/${"a".repeat(201)}`, false],
  ])("%s valid=%s", (path, valid) => {
    expect(isTaskPath(path)).toBe(valid);
  });

  it("maps wallet URLs back to task paths only for the same slug", () => {
    expect(taskPathFromPathname("/products/morrow", "morrow")).toBe("/");
    expect(taskPathFromPathname("/products/morrow/register/u1", "morrow")).toBe(
      "/register/u1",
    );
    expect(taskPathFromPathname("/products/other/x", "morrow")).toBeUndefined();
  });
});

describe("canonical JSON", () => {
  it("sorts keys at every level and rejects non-finite numbers", () => {
    expect(
      canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }),
    ).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});

const settle: SettleRules = {
  action: "update",
  leaves: {
    "data.custom.state": { enum: ["Authenticity verified"] },
    "data.custom.lifecycle.target_state": { enum: ["Authenticity verified"] },
    "data.custom.app": { literal: "governed-workflow-studio" },
    "data.custom.serialNumber": { unchanged: true },
    "data.custom.action_hash": { runtimeIssued: "sha256_hex" },
    "data.custom.receipt.at": { runtimeIssued: "iso_time" },
    "data.custom.proof_event.public_fields": { runtimeIssued: "public_fields" },
    "data.custom.receipt.id": { runtimeIssued: "^rcpt-[0-9]{4}$" },
  },
  fromStates: ["Transfer pending"],
  targetStates: ["Authenticity verified"],
  preserveUnlisted: true,
};

const current = {
  state: "Transfer pending",
  serialNumber: "MH-ARC-0001",
  lifecycle: { target_state: "Registered" },
};

function input(custom: Record<string, unknown> = {}) {
  return {
    data: {
      custom: {
        state: "Authenticity verified",
        lifecycle: { target_state: "Authenticity verified" },
        app: "governed-workflow-studio",
        serialNumber: "MH-ARC-0001",
        action_hash: "a".repeat(64),
        receipt: { at: "2026-10-14T10:00:00.000Z", id: "rcpt-0001" },
        proof_event: { public_fields: ["state", "serialNumber"] },
        ...custom,
      },
    },
  };
}

describe("settle input template (contract r5 leaf rules)", () => {
  it("accepts exactly the template's leaves", () => {
    const matched = matchSettleTemplate(input(), settle.leaves, current);
    expect(matched?.map(([path]) => path).sort()).toEqual(
      Object.keys(settle.leaves).sort(),
    );
  });

  it.each([
    ["an extra top-level key", { ...input(), owner: "0xattacker" }],
    ["a nested extra key", input({ extra: { nested: true } })],
    [
      "an extra key in a nested object",
      input({
        receipt: { at: "2026-10-14T10:00:00.000Z", id: "rcpt-0001", by: "x" },
      }),
    ],
    ["an empty object hiding a key", input({ shadow: {} })],
    [
      "a missing leaf",
      { data: { custom: { state: "Authenticity verified" } } },
    ],
    ["a disallowed enum value", input({ state: "Registered" })],
    ["a changed literal", input({ app: "another-app" })],
    ["a changed unchanged value", input({ serialNumber: "MH-ARC-9999" })],
    ["a malformed runtime hash", input({ action_hash: "not-a-hash" })],
    [
      "a malformed runtime time",
      input({ receipt: { at: "yesterday", id: "rcpt-0001" } }),
    ],
    [
      "a value failing an anchored regex",
      input({ receipt: { at: "2026-10-14T10:00:00.000Z", id: "rcpt-1" } }),
    ],
    [
      "an array where a scalar belongs",
      input({ state: ["Authenticity verified"] }),
    ],
  ])("refuses %s", (_label, value) => {
    expect(matchSettleTemplate(value, settle.leaves, current)).toBeUndefined();
  });

  it("requires unchanged leaves to exist on the fresh object", () => {
    expect(
      matchSettleTemplate(input(), settle.leaves, {
        state: "Transfer pending",
      }),
    ).toBeUndefined();
  });
});

describe("complete custom map (contract r7)", () => {
  it("lists nothing when every fresh custom key is a template leaf", () => {
    expect(unlistedCustomKeys(current, settle.leaves)).toEqual([]);
    // Template leaves the object does not have yet (runtime-issued) are fine.
    expect(
      unlistedCustomKeys({ state: "Transfer pending" }, settle.leaves),
    ).toEqual([]);
    expect(unlistedCustomKeys(undefined, settle.leaves)).toEqual([]);
    expect(unlistedCustomKeys({}, settle.leaves)).toEqual([]);
  });

  it("names every fresh key the template does not list, nested ones too", () => {
    expect(
      unlistedCustomKeys(
        {
          ...current,
          warrantyNote: "keep",
          lifecycle: { target_state: "Registered", reason: "handover" },
          shadow: {},
        },
        settle.leaves,
      )?.sort(),
    ).toEqual(["lifecycle.reason", "shadow", "warrantyNote"]);
  });

  it("reads the legacy custom.* template root the same way", () => {
    const legacy = { "custom.state": { enum: ["Authenticity verified"] } };
    expect(unlistedCustomKeys({ state: "x" }, legacy)).toEqual([]);
    expect(unlistedCustomKeys({ state: "x", model: "y" }, legacy)).toEqual([
      "model",
    ]);
  });

  it("refuses a custom value that is not a map", () => {
    expect(unlistedCustomKeys(["state"], settle.leaves)).toBeUndefined();
    expect(unlistedCustomKeys("state", settle.leaves)).toBeUndefined();
  });

  it("refuses an otherwise exact proposal when the fresh object has an unlisted key", () => {
    const proposal: SettleProposal = {
      proposalId: "proposal-1",
      operationId: "register-op-0001",
      objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      action: "update",
      input: input(),
      proposalHash: "sha256:" + "0".repeat(64),
      expiresAt: new Date(Date.parse("2026-10-14T10:01:00Z")),
    };
    const expected = {
      operationId: "register-op-0001",
      objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      now: Date.parse("2026-10-14T10:00:00Z"),
    };
    expect(
      checkSettleProposal(proposal, expected, current, settle, rules).ok,
    ).toBe(true);
    // Under replace semantics the update would drop warrantyNote.
    expect(
      checkSettleProposal(
        proposal,
        expected,
        { ...current, warrantyNote: "keep" },
        settle,
        rules,
      ),
    ).toEqual({ ok: false, reason: "proposal_rejected" });
  });
});

describe("complete custom map (contract r17 preserveUnlisted)", () => {
  const now = Date.parse("2026-10-14T10:00:00Z");
  // A Studio-minted unit: its mint provenance is not governed by the settle.
  const fresh = {
    ...current,
    activation_hash: "b".repeat(64),
    dual_asset: { title: "Arc grinder", rights: ["hold"] },
    lifecycle: { target_state: "Registered", reason: "handover" },
  };
  // As the runtime builds it: the fresh map with the governed leaves written.
  const complete = (
    change: (custom: Record<string, unknown>) => void = () => {},
  ) => {
    const value = input({
      activation_hash: "b".repeat(64),
      dual_asset: { title: "Arc grinder", rights: ["hold"] },
      lifecycle: { target_state: "Authenticity verified", reason: "handover" },
    });
    change(value.data.custom as Record<string, unknown>);
    return value;
  };
  const proposal = (value: Record<string, unknown>): SettleProposal => ({
    proposalId: "proposal-1",
    operationId: "register-op-0001",
    objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    action: "update",
    input: value,
    proposalHash: "sha256:" + "0".repeat(64),
    expiresAt: new Date(now + 60_000),
  });
  const expected = {
    operationId: "register-op-0001",
    objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    now,
  };

  it("accepts the governed leaves plus every other fresh key copied unchanged", () => {
    const matched = matchCompleteTemplate(complete(), settle.leaves, fresh);
    expect(matched?.map(([path]) => path).sort()).toEqual(
      Object.keys(settle.leaves).sort(),
    );
    const result = checkSettleProposal(
      proposal(complete()),
      expected,
      fresh,
      settle,
      rules,
    );
    expect(result.ok).toBe(true);
    // A copied value is not a change to show.
    if (result.ok) {
      expect(result.changes.map(({ field }) => field)).not.toContain(
        "data.custom.activation_hash",
      );
    }
  });

  it.each<[string, (custom: Record<string, unknown>) => void]>([
    ["a mint key changed", (c) => edit(c, "activation_hash", "c".repeat(64))],
    [
      "a nested mint key changed",
      (c) => edit(c, "dual_asset.rights", ["burn"]),
    ],
    ["a mint key dropped", (c) => edit(c, "activation_hash", REMOVE)],
    [
      "a nested ungoverned key dropped",
      (c) => edit(c, "lifecycle.reason", REMOVE),
    ],
    ["a governed leaf changed", (c) => edit(c, "serialNumber", "MH-ARC-9999")],
    ["a governed leaf dropped", (c) => edit(c, "receipt.id", REMOVE)],
    ["an extra key", (c) => edit(c, "extra", "added")],
    ["an extra nested key", (c) => edit(c, "dual_asset.extra", "added")],
    [
      "an object inside a governed leaf",
      (c) => edit(c, "state", { value: "Authenticity verified" }),
    ],
  ])("refuses %s", (_label, change) => {
    expect(
      matchCompleteTemplate(complete(change), settle.leaves, fresh),
    ).toBeUndefined();
    expect(
      checkSettleProposal(
        proposal(complete(change)),
        expected,
        fresh,
        settle,
        rules,
      ),
    ).toEqual({ ok: false, reason: "proposal_rejected" });
  });

  it("refuses a key outside data.custom and a fresh value that is not a map", () => {
    expect(
      matchCompleteTemplate({ ...complete(), extra: 1 }, settle.leaves, fresh),
    ).toBeUndefined();
    expect(
      matchCompleteTemplate(complete(), settle.leaves, ["x"]),
    ).toBeUndefined();
  });

  it("refuses a template without the flag (an older registry entry fails closed)", () => {
    expect(
      checkSettleProposal(
        proposal(input()),
        expected,
        current,
        { ...settle, preserveUnlisted: false },
        rules,
      ),
    ).toEqual({ ok: false, reason: "proposal_rejected" });
  });
});

describe("settle proposal binding", () => {
  const now = Date.parse("2026-10-14T10:00:00Z");
  const proposal: SettleProposal = {
    proposalId: "proposal-1",
    operationId: "register-op-0001",
    objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    action: "update",
    input: input(),
    proposalHash: "sha256:" + "0".repeat(64),
    expiresAt: new Date(now + 60_000),
  };
  const expected = {
    operationId: "register-op-0001",
    objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    now,
  };

  it("decodes the changed fields from the proposal and fresh object", () => {
    const result = checkSettleProposal(
      proposal,
      expected,
      current,
      settle,
      rules,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toContainEqual({
      field: "data.custom.state",
      kind: "value",
      from: "Transfer pending",
      to: "Authenticity verified",
    });
    expect(result.changes).toContainEqual({
      field: "data.custom.lifecycle.target_state",
      kind: "value",
      from: "Registered",
      to: "Authenticity verified",
    });
    expect(result.changes).toContainEqual({
      field: "data.custom.action_hash",
      kind: "technical",
      from: null,
      to: "a".repeat(64),
    });
    // Verified-unchanged values are not presented as changes.
    expect(result.changes.map(({ field }) => field)).not.toContain(
      "data.custom.serialNumber",
    );
  });

  it("refuses a state and lifecycle target that disagree", () => {
    const twoTargets: SettleRules = {
      ...settle,
      targetStates: ["Authenticity verified", "In service"],
      leaves: {
        ...settle.leaves,
        "data.custom.lifecycle.target_state": {
          enum: ["Authenticity verified", "In service"],
        },
      },
    };
    expect(
      checkSettleProposal(
        {
          ...proposal,
          input: input({ lifecycle: { target_state: "In service" } }),
        },
        expected,
        current,
        twoTargets,
        rules,
      ),
    ).toEqual({ ok: false, reason: "proposal_rejected" });
  });

  it.each([
    ["another unit", { objectId: "bbbbbbbbbbbbbbbbbbbbbbbb" }],
    ["another operation", { operationId: "register-op-9999" }],
    ["an expired proposal", { expiresAt: new Date(now - 1) }],
    ["another action", { action: "claim_ownership" }],
    ["a transfer", { action: "transfer" }],
  ])("refuses %s", (_label, change) => {
    expect(
      checkSettleProposal(
        { ...proposal, ...change },
        expected,
        current,
        settle,
        rules,
      ),
    ).toEqual({ ok: false, reason: "proposal_rejected" });
  });

  it("hashes the canonical proposal body", () => {
    expect(proposalHashInput(proposal)).toBe(
      canonicalJson({
        object_id: proposal.objectId,
        action: "update",
        input: proposal.input,
      }),
    );
  });
});
