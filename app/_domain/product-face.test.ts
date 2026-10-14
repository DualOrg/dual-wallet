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
  inputTemplate: {
    custom: {
      state: { $oneOf: "targetStates" },
      lifecycle: { target_state: { $oneOf: "targetStates" } },
      verified_by: { $literal: "holder" },
    },
  },
  fromStates: ["Transfer pending"],
  targetStates: ["Authenticity verified"],
};

const goodInput = {
  custom: {
    state: "Authenticity verified",
    lifecycle: { target_state: "Authenticity verified" },
    verified_by: "holder",
  },
};

describe("settle input template", () => {
  it("accepts exactly the template shape", () => {
    expect(
      matchSettleTemplate(goodInput, settle.inputTemplate, settle.targetStates),
    ).toEqual([
      ["custom.state", "Authenticity verified"],
      ["custom.lifecycle.target_state", "Authenticity verified"],
      ["custom.verified_by", "holder"],
    ]);
  });

  it("refuses nested extra keys, missing keys and disallowed values", () => {
    const refuse = (input: unknown) =>
      expect(
        matchSettleTemplate(input, settle.inputTemplate, settle.targetStates),
      ).toBeUndefined();
    refuse({ custom: { ...goodInput.custom, serialNumber: "X" } });
    refuse({
      custom: {
        ...goodInput.custom,
        lifecycle: { target_state: "Authenticity verified", extra: 1 },
      },
    });
    refuse({ custom: { state: "Authenticity verified" } });
    refuse({ ...goodInput, owner: "0xattacker" });
    refuse({ custom: { ...goodInput.custom, state: "Registered" } });
    refuse({ custom: { ...goodInput.custom, verified_by: "issuer" } });
    refuse({ custom: { ...goodInput.custom, lifecycle: "flat" } });
  });

  it("refuses target-state leaves that disagree with each other", () => {
    const twoTargets = {
      ...settle,
      targetStates: ["Registered", "In service"],
    };
    expect(
      matchSettleTemplate(
        {
          custom: {
            state: "Registered",
            lifecycle: { target_state: "In service" },
            verified_by: "holder",
          },
        },
        twoTargets.inputTemplate,
        twoTargets.targetStates,
      ),
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
    input: goodInput,
    proposalHash: "sha256:" + "0".repeat(64),
    expiresAt: new Date(now + 60_000),
  };
  const expected = {
    operationId: "register-op-0001",
    objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    now,
  };

  it("decodes the exact field changes from the proposal and fresh object", () => {
    const result = checkSettleProposal(
      proposal,
      expected,
      { state: "Transfer pending", lifecycle: {} },
      settle,
    );
    expect(result).toEqual({
      ok: true,
      changes: [
        {
          field: "custom.state",
          from: "Transfer pending",
          to: "Authenticity verified",
        },
        {
          field: "custom.lifecycle.target_state",
          from: null,
          to: "Authenticity verified",
        },
        { field: "custom.verified_by", from: null, to: "holder" },
      ],
    });
  });

  it.each([
    ["another unit", { objectId: "bbbbbbbbbbbbbbbbbbbbbbbb" }],
    ["another operation", { operationId: "register-op-9999" }],
    ["an expired proposal", { expiresAt: new Date(now - 1) }],
    ["another action", { action: "claim_ownership" }],
    ["a transfer", { action: "transfer" }],
  ])("refuses %s", (_label, change) => {
    expect(
      checkSettleProposal({ ...proposal, ...change }, expected, {}, settle),
    ).toEqual({ ok: false, reason: "proposal_rejected" });
  });

  it("hashes the canonical proposal body", () => {
    expect(proposalHashInput(proposal)).toBe(
      canonicalJson({
        object_id: proposal.objectId,
        action: "update",
        input: goodInput,
      }),
    );
  });
});
