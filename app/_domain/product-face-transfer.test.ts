import { createHash } from "node:crypto";
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

function answer(overrides: Record<string, unknown> = {}) {
  return {
    status: "transfer_step_proposed",
    step: "request",
    proposal_id: "ptp-0123456789abcdef01234567",
    offer_id: OFFER,
    object_id: UNIT,
    action: "update",
    input: {
      data: {
        custom: {
          state: "Transfer pending",
          lifecycle: { target_state: "Transfer pending" },
          dual_object_id: UNIT,
          proof_event: {
            public_fields: [
              "state:Transfer pending",
              `recipientReferenceHash:${RECIPIENT_HASH}`,
            ],
          },
        },
      },
    },
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
// As the BFF calls it: the reference hash of the answer's own recipient.
const check = (value: Record<string, unknown>) => {
  const parsed = parseTransferProposal(value);
  if (!parsed) return "unparsed";
  return checkTransferProposal(parsed, {
    ...expected,
    recipientReferenceHash: sha(parsed.recipient),
  }).ok
    ? "ok"
    : "rejected";
};

describe("G8 transfer step proposals (contract r16 transfer.sign)", () => {
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
        input: {
          data: {
            custom: {
              state: "Registered",
              lifecycle: { target_state: "Registered" },
              proof_event: {
                public_fields: [`recipientReferenceHash:${RECIPIENT_HASH}`],
              },
            },
          },
        },
      },
    ],
    [
      "a request with more than {data: {custom}}",
      { input: { data: { custom: {} }, secret: "x" } },
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
