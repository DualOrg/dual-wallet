import {
  canonicalJson,
  checkSettleProposal,
  evaluateCanonicalRegistration,
  isTaskPath,
  matchSettleTemplate,
  proposalHashInput,
  registrationReadback,
  taskPathFromPathname,
  type CanonicalRegistrationRules,
  type SettleProposal,
  type SettleRules,
} from "@/app/_domain/product-face";

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
