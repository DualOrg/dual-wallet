import {
  faceEntryAction,
  faceExecutionBodyMatches,
  faceExecutionHeaders,
} from "@/app/_domain/face-execution";
import type { FaceJournalEntry } from "@/app/_domain/product-face-journal";

const UNIT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const entry = (overrides: Partial<FaceJournalEntry>): FaceJournalEntry => ({
  operationId: "settle-0123456789abcdef",
  kind: "settle",
  operation: "update",
  slug: "morrow-home",
  programmeId: "morrow.home",
  objectId: UNIT,
  phase: "submitted",
  dispatch: "won",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe("face execution binding (contract r18)", () => {
  it("names the one standard action each step may send", () => {
    expect(faceEntryAction(entry({}))).toBe("update");
    expect(faceEntryAction(entry({ operation: "remote" }))).toBe("remote");
    expect(faceEntryAction(entry({ operation: "burn" }))).toBeUndefined();
    expect(
      faceEntryAction(
        entry({ kind: "transfer", operation: "transfer.request" }),
      ),
    ).toBe("update");
    expect(
      faceEntryAction(
        entry({ kind: "transfer", operation: "transfer.transfer" }),
      ),
    ).toBe("transfer");
    expect(
      faceEntryAction(
        entry({ kind: "registration", operation: "registration.register" }),
      ),
    ).toBeUndefined();
  });

  it("accepts exactly the entry's action on the entry's unit", () => {
    const settle = entry({});
    expect(
      faceExecutionBodyMatches(
        { action: { update: { id: UNIT }, alias: "verify" }, nonce: 0 },
        settle,
      ),
    ).toBe(true);
    const transfer = entry({
      kind: "transfer",
      operation: "transfer.transfer",
    });
    expect(
      faceExecutionBodyMatches(
        { action: { transfer: { id: UNIT, to: "0xb2" } } },
        transfer,
      ),
    ).toBe(true);
  });

  it.each([
    ["no action", {}],
    ["another unit", { action: { update: { id: "b".repeat(24) } } }],
    ["another action", { action: { burn: { id: UNIT } } }],
    ["two actions", { action: { update: { id: UNIT }, burn: { id: UNIT } } }],
    [
      "a permit secret",
      { action: { update: { id: UNIT }, permit_secret: "x" } },
    ],
    ["an action that is not an object", { action: { update: UNIT } }],
    ["an array", [{ action: { update: { id: UNIT } } }]],
  ])("refuses %s", (_label, body) => {
    expect(faceExecutionBodyMatches(body, entry({}))).toBe(false);
  });

  it("refuses an alias on a transfer step", () => {
    expect(
      faceExecutionBodyMatches(
        { action: { update: { id: UNIT }, alias: "x" } },
        entry({ kind: "transfer", operation: "transfer.request" }),
      ),
    ).toBe(false);
  });

  it("carries the launch, slug, operation and captured wallet only", () => {
    expect(
      faceExecutionHeaders({
        launchId: "launch-1",
        slug: "morrow-home",
        operationId: "xfer-1",
        walletId: "wallet-a",
      }),
    ).toEqual({
      "x-dual-face-launch": "launch-1",
      "x-dual-face-slug": "morrow-home",
      "x-dual-face-operation": "xfer-1",
      "x-dual-face-wallet": "wallet-a",
    });
  });
});
