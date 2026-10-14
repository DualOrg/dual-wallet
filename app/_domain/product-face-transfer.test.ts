import { createHash } from "node:crypto";
import type { TransferRequestRules } from "@/app/_domain/product-face";
import { edit, REMOVE } from "@/test/product-face-fixtures";
import {
  checkTransferProposal,
  parseTransferProposal,
  transferExecutorInput,
  transferProposalHashInput,
} from "@/app/_domain/product-face-transfer";

const UNIT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OFFER = "pto-0123456789abcdef01234567";
const HOLDER = "0x1234567890abcdef1234567890abcdef12345678";
const RECIPIENT = "0x00000000000000000000000000000000000000b2";
const sha = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const RECIPIENT_HASH = sha(RECIPIENT);

// The host's fresh read of a Studio-minted unit (illustrative values): the
// governed custom map of its last reviewed update, plus its activation mint's
// provenance keys that no reviewed update governs.
const FRESH = {
  app: "governed-workflow-studio",
  recordId: "itm-0123456789ab",
  title: "Arc grinder",
  serialNumber: "ARC-0001",
  dual_object_id: UNIT,
  state: "Authenticity verified",
  lifecycle: {
    current_state: "Authenticity verified",
    target_state: "Authenticity verified",
  },
  receipt: { label: "Product Passport · Verify authenticity", id: "ptr-1" },
  proof_event: { public_fields: ["state:Authenticity verified"] },
  action_hash: "1".repeat(64),
  activation_hash: "2".repeat(64),
  dual_asset: { title: "Arc grinder", rights: ["hold"], schema_version: 1 },
};

// binding.transferRequest as the runtime's template inspection answers it:
// the governed leaves only, preserveUnlisted.
const RULES: TransferRequestRules = {
  action: "update",
  leaves: {
    "data.custom.app": { literal: "governed-workflow-studio" },
    "data.custom.recordId": { unchanged: true },
    "data.custom.title": { unchanged: true },
    "data.custom.serialNumber": { unchanged: true },
    "data.custom.dual_object_id": { unchanged: true },
    "data.custom.state": { enum: ["Transfer pending"] },
    "data.custom.lifecycle.current_state": { enum: ["Transfer pending"] },
    "data.custom.lifecycle.target_state": { enum: ["Transfer pending"] },
    "data.custom.receipt.label": {
      literal: "Product Passport · Request ownership transfer",
    },
    "data.custom.receipt.id": { runtimeIssued: "token" },
    "data.custom.proof_event.public_fields": { runtimeIssued: "public_fields" },
    "data.custom.action_hash": { runtimeIssued: "sha256_hex" },
  },
  fromStates: ["Authenticity verified", "In service"],
  targetStates: ["Transfer pending"],
  preserveUnlisted: true,
};

// The request step exactly as the Studio runtime builds it: a deep copy of
// the fresh custom map with only the governed leaves overwritten.
function requestInput(
  change: (custom: Record<string, unknown>) => void = () => {},
) {
  const custom: Record<string, unknown> = JSON.parse(JSON.stringify(FRESH));
  custom.state = "Transfer pending";
  edit(custom, "lifecycle.current_state", "Transfer pending");
  edit(custom, "lifecycle.target_state", "Transfer pending");
  custom.receipt = {
    label: "Product Passport · Request ownership transfer",
    id: "ptr-2",
  };
  custom.proof_event = {
    public_fields: [
      "state:Transfer pending",
      `recipientReferenceHash:${RECIPIENT_HASH}`,
    ],
  };
  custom.action_hash = "3".repeat(64);
  change(custom);
  return { data: { custom } };
}

function answer(overrides: Record<string, unknown> = {}) {
  return {
    status: "transfer_step_proposed",
    step: "request",
    proposal_id: "ptp-0123456789abcdef01234567",
    offer_id: OFFER,
    object_id: UNIT,
    action: "update",
    input: requestInput(),
    proposal_hash: `sha256:${"0".repeat(64)}`,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    recipient: RECIPIENT,
    ...overrides,
  };
}
const expected = {
  offerId: OFFER,
  objectId: UNIT,
  holder: HOLDER,
  now: Date.now(),
  recipientReferenceHash: RECIPIENT_HASH,
};
// As the BFF calls it: the reference hash of the answer's own recipient and
// the host's own fresh read.
const check = (
  value: Record<string, unknown>,
  template: { currentCustom: unknown; rules: TransferRequestRules | null } = {
    currentCustom: FRESH,
    rules: RULES,
  },
) => {
  const parsed = parseTransferProposal(value);
  if (!parsed) return "unparsed";
  return checkTransferProposal(
    parsed,
    { ...expected, recipientReferenceHash: sha(parsed.recipient) },
    template,
  ).ok
    ? "ok"
    : "rejected";
};

describe("G8 transfer step proposals (contract r16 transfer.sign, r17 complete map)", () => {
  it("accepts exactly the reviewed request and transfer steps for the bound recipient", () => {
    expect(check(answer())).toBe("ok");
    expect(
      check(
        answer({
          step: "transfer",
          action: "transfer",
          input: { to: RECIPIENT },
        }),
      ),
    ).toBe("ok");
  });

  it.each([
    ["another offer", { offer_id: "pto-ffffffffffffffffffffffff" }],
    ["another unit", { object_id: "bbbbbbbbbbbbbbbbbbbbbbbb" }],
    ["an expired step", { expires_at: new Date(Date.now() - 1).toISOString() }],
    ["the holder as recipient", { recipient: HOLDER }],
    [
      "a request naming another recipient",
      { recipient: "0x00000000000000000000000000000000000000cc" },
    ],
    ["a request that is not an update", { action: "transfer" }],
    [
      "a request that is not the Transfer pending state",
      {
        input: requestInput((custom) => {
          edit(custom, "state", "Registered");
          edit(custom, "lifecycle.target_state", "Registered");
        }),
      },
    ],
    [
      "a request with more than {data: {custom}}",
      { input: { ...requestInput(), secret: "x" } },
    ],
    [
      "a request rewriting the title",
      {
        input: requestInput((custom) =>
          edit(custom, "title", "Something else"),
        ),
      },
    ],
    [
      "a request rewriting the serial number",
      {
        input: requestInput((custom) =>
          edit(custom, "serialNumber", "ARC-9999"),
        ),
      },
    ],
    [
      "a request rewriting a programme literal",
      { input: requestInput((custom) => edit(custom, "app", "another-app")) },
    ],
    [
      "a request adding a leaf",
      { input: requestInput((custom) => edit(custom, "extra", "added")) },
    ],
    [
      "a request adding a nested leaf",
      {
        input: requestInput((custom) => edit(custom, "receipt.extra", "added")),
      },
    ],
    [
      "a request changing a mint key",
      {
        input: requestInput((custom) =>
          edit(custom, "activation_hash", "4".repeat(64)),
        ),
      },
    ],
    [
      "a request changing a nested mint key",
      {
        input: requestInput((custom) =>
          edit(custom, "dual_asset.rights", ["burn"]),
        ),
      },
    ],
    [
      "a request dropping a mint key",
      {
        input: requestInput((custom) =>
          edit(custom, "activation_hash", REMOVE),
        ),
      },
    ],
    [
      "a request dropping a governed leaf",
      { input: requestInput((custom) => edit(custom, "receipt.id", REMOVE)) },
    ],
    [
      "a request with a malformed runtime-issued value",
      {
        input: requestInput((custom) =>
          edit(custom, "action_hash", "not-a-hash"),
        ),
      },
    ],
    [
      "a transfer to another wallet",
      {
        step: "transfer",
        action: "transfer",
        input: { to: "0x00000000000000000000000000000000000000cc" },
      },
    ],
    [
      "a transfer with extra input",
      {
        step: "transfer",
        action: "transfer",
        input: { to: RECIPIENT, note: "x" },
      },
    ],
  ])("refuses %s", (_label, change) => {
    expect(check(answer(change))).not.toBe("ok");
  });

  it("refuses a request step without the exact complete-map template", () => {
    expect(check(answer(), { currentCustom: FRESH, rules: null })).toBe(
      "rejected",
    );
    expect(
      check(answer(), {
        currentCustom: FRESH,
        rules: { ...RULES, preserveUnlisted: false },
      }),
    ).toBe("rejected");
    // A key the unit gained after the proposal was built would be dropped.
    expect(
      check(answer(), {
        currentCustom: { ...FRESH, added_later: "x" },
        rules: RULES,
      }),
    ).toBe("rejected");
    // The transfer step itself writes no custom data and needs no template.
    expect(
      check(
        answer({
          step: "transfer",
          action: "transfer",
          input: { to: RECIPIENT },
        }),
        {
          currentCustom: FRESH,
          rules: null,
        },
      ),
    ).toBe("ok");
  });

  it("parses only a complete, well-formed answer", () => {
    expect(
      parseTransferProposal(answer({ status: "refused" })),
    ).toBeUndefined();
    expect(parseTransferProposal(answer({ step: "settle" }))).toBeUndefined();
    expect(parseTransferProposal(answer({ recipient: "bob" }))).toBeUndefined();
    expect(
      parseTransferProposal(answer({ proposal_id: "psp-1" })),
    ).toBeUndefined();
  });

  it("hashes {object_id, action, input} canonically, as the runtime does", () => {
    const parsed = parseTransferProposal(
      answer({
        step: "transfer",
        action: "transfer",
        input: { to: RECIPIENT },
      }),
    )!;
    expect(transferProposalHashInput(parsed)).toBe(
      `{"action":"transfer","input":{"to":"${RECIPIENT}"},"object_id":"${UNIT}"}`,
    );
  });

  it("maps a step to the executor's form only: update -> {custom}, transfer -> {to}", () => {
    expect(
      transferExecutorInput({
        action: "update",
        input: { data: { custom: { state: "Transfer pending" } } },
      }),
    ).toEqual({ custom: { state: "Transfer pending" } });
    expect(
      transferExecutorInput({ action: "transfer", input: { to: RECIPIENT } }),
    ).toEqual({ to: RECIPIENT });
    expect(
      transferExecutorInput({ action: "update", input: { custom: {} } }),
    ).toBeUndefined();
  });
});
