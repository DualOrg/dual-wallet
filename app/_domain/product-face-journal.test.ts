import {
  applyJournalTransition,
  journalOperationStatus,
  parseJournalEntry,
  pruneJournal,
  type FaceJournalEntry,
} from "@/app/_domain/product-face-journal";

const OBJECT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const base = {
  operationId: "register-op-0001",
  kind: "registration" as const,
  operation: "registration.submit",
  slug: "morrow-home",
  programmeId: "morrow-home-arc",
  objectId: OBJECT,
};

function run(
  steps: Array<Parameters<typeof applyJournalTransition>[1]>,
): FaceJournalEntry[] {
  let entries: FaceJournalEntry[] = [];
  for (const step of steps) {
    const result = applyJournalTransition(entries, step, 1_000);
    if (!result.ok) throw new Error(result.error);
    entries = result.entries;
  }
  return entries;
}

describe("face operation journal", () => {
  it("moves begin -> confirm -> issue and never issues twice", () => {
    const entries = run([
      { kind: "begin", entry: base },
      { kind: "confirm", operationId: base.operationId, objectId: OBJECT },
      { kind: "issue", operationId: base.operationId, objectId: OBJECT },
    ]);
    expect(entries[0]).toMatchObject({ phase: "assertion_issued" });
    for (const step of [
      { kind: "issue", operationId: base.operationId, objectId: OBJECT },
      { kind: "cancel", operationId: base.operationId },
      { kind: "begin", entry: base },
      { kind: "confirm", operationId: base.operationId, objectId: OBJECT },
    ] as const) {
      expect(applyJournalTransition(entries, step, 2_000)).toEqual({
        ok: false,
        error: "operation_already_submitted",
      });
    }
  });

  it("cancels before issue as not_submitted", () => {
    const entries = run([
      { kind: "begin", entry: base },
      { kind: "cancel", operationId: base.operationId },
    ]);
    expect(entries[0]).toMatchObject({
      phase: "cancelled",
      status: "not_submitted",
    });
    expect(journalOperationStatus(entries[0], "not_owned")).toBe(
      "not_submitted",
    );
  });

  it("refuses issuing for another object or without confirmation", () => {
    const begun = run([{ kind: "begin", entry: base }]);
    expect(
      applyJournalTransition(
        begun,
        { kind: "issue", operationId: base.operationId, objectId: OBJECT },
        1,
      ),
    ).toEqual({ ok: false, error: "operation_conflict" });
    const confirmed = run([
      { kind: "begin", entry: base },
      { kind: "confirm", operationId: base.operationId, objectId: OBJECT },
    ]);
    expect(
      applyJournalTransition(
        confirmed,
        {
          kind: "issue",
          operationId: base.operationId,
          objectId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        },
        1,
      ),
    ).toEqual({ ok: false, error: "operation_conflict" });
  });

  it("reports an issued operation as outcome_unknown until readback agrees", () => {
    const [entry] = run([
      { kind: "begin", entry: base },
      { kind: "confirm", operationId: base.operationId, objectId: OBJECT },
      { kind: "issue", operationId: base.operationId, objectId: OBJECT },
    ]);
    expect(journalOperationStatus(entry, "not_owned")).toBe("outcome_unknown");
    expect(journalOperationStatus(entry, undefined)).toBe("outcome_unknown");
    expect(journalOperationStatus(entry, "ownership_moved_state_pending")).toBe(
      "ownership_moved_state_pending",
    );
    expect(journalOperationStatus(entry, "registered")).toBe("registered");
  });

  it("keeps a submitted settle unknown until its action is recorded", () => {
    const settle = {
      ...base,
      operationId: "settle-op-0001",
      kind: "settle" as const,
      operation: "update",
      proposalId: "proposal-1",
    };
    const submitted = run([
      { kind: "begin", entry: settle },
      { kind: "confirm", operationId: settle.operationId, objectId: OBJECT },
      { kind: "submit", operationId: settle.operationId, objectId: OBJECT },
    ]);
    expect(
      journalOperationStatus(submitted[0], "ownership_moved_state_pending"),
    ).toBe("outcome_unknown");
    const recorded = applyJournalTransition(
      submitted,
      {
        kind: "record_action",
        operationId: settle.operationId,
        actionId: "action-9",
      },
      2,
    );
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    expect(
      journalOperationStatus(recorded.entry, "ownership_moved_state_pending"),
    ).toBe("ownership_moved_state_pending");
    expect(journalOperationStatus(recorded.entry, "registered")).toBe(
      "registered",
    );
    // A submitted settle is never resubmitted.
    expect(
      applyJournalTransition(
        recorded.entries,
        { kind: "submit", operationId: settle.operationId, objectId: OBJECT },
        3,
      ),
    ).toEqual({ ok: false, error: "operation_already_submitted" });
  });

  it("never treats a submitted settle as nothing executed, however old (r13)", () => {
    const settle = {
      ...base,
      operationId: "settle-op-0002",
      kind: "settle" as const,
      operation: "update",
      proposalId: "proposal-2",
    };
    const [submitted] = run([
      { kind: "begin", entry: settle },
      { kind: "confirm", operationId: settle.operationId, objectId: OBJECT },
      { kind: "submit", operationId: settle.operationId, objectId: OBJECT },
    ]);
    // Long after any proposal expiry, with the unit still pending (an empty
    // history) or unreadable, the status stays unknown, never not_submitted.
    const later = { ...submitted, updatedAt: 1_000 + 6 * 24 * 3_600_000 };
    for (const evaluation of [
      "ownership_moved_state_pending",
      undefined,
    ] as const) {
      expect(journalOperationStatus(later, evaluation)).toBe("outcome_unknown");
    }
    // It is kept (not pruned like a finished entry) and cannot be cancelled.
    expect(pruneJournal([submitted], 1_000 + 2 * 24 * 3_600_000)).toEqual([
      submitted,
    ]);
    expect(
      applyJournalTransition(
        [submitted],
        { kind: "cancel", operationId: settle.operationId },
        5_000,
      ),
    ).toEqual({ ok: false, error: "operation_already_submitted" });
  });

  it("re-validates entries read back from storage", () => {
    expect(parseJournalEntry({ ...base, phase: "confirmed" })).toBeUndefined();
    expect(
      parseJournalEntry({
        ...base,
        phase: "confirmed",
        createdAt: 1,
        updatedAt: 1,
        assertion: "must-not-survive",
      }),
    ).toEqual({ ...base, phase: "confirmed", createdAt: 1, updatedAt: 1 });
    expect(
      parseJournalEntry({
        ...base,
        operation: "claim_ownership",
        phase: "confirmed",
        createdAt: 1,
        updatedAt: 1,
      }),
    ).toBeUndefined();
  });
});
