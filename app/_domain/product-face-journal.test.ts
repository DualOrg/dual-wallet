import {
  applyJournalTransition,
  journalOperationStatus,
  parseJournalEntry,
  pruneJournal,
  REGISTRATION_CLOSE_AFTER_MS,
  registrationClosable,
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

describe("closing a registration the runtime never accepted", () => {
  const close = {
    kind: "close",
    operationId: base.operationId,
    reason: "runtime_never_accepted",
  } as const;
  // Issued at 1_000 (run()); provable from issuedAt + 30 minutes.
  const horizon = 1_000 + REGISTRATION_CLOSE_AFTER_MS;
  const issued = () =>
    run([
      {
        kind: "begin",
        entry: { ...base, requestHash: `sha256:${"d".repeat(64)}` },
      },
      { kind: "confirm", operationId: base.operationId, objectId: OBJECT },
      { kind: "issue", operationId: base.operationId, objectId: OBJECT },
    ]);

  it("closes only an issued registration, only once it can no longer be accepted", () => {
    const entries = issued();
    expect(REGISTRATION_CLOSE_AFTER_MS).toBe(30 * 60 * 1000);
    expect(registrationClosable(entries[0], horizon - 1)).toBe(false);
    expect(applyJournalTransition(entries, close, horizon - 1)).toEqual({
      ok: false,
      error: "operation_conflict",
    });
    // Before issue there is nothing to close (cancel is the path there).
    const confirmed = run([
      { kind: "begin", entry: base },
      { kind: "confirm", operationId: base.operationId, objectId: OBJECT },
    ]);
    expect(applyJournalTransition(confirmed, close, horizon)).toEqual({
      ok: false,
      error: "operation_conflict",
    });
    // Never a settle, a transfer step, a runtime step or an observed one.
    const settle = run([
      {
        kind: "begin",
        entry: {
          ...base,
          kind: "settle",
          operation: "update",
          proposalId: "p-1",
        },
      },
      { kind: "confirm", operationId: base.operationId, objectId: OBJECT },
      { kind: "submit", operationId: base.operationId, objectId: OBJECT },
    ]);
    const runtimeStep = run([
      {
        kind: "begin",
        entry: { ...base, kind: "runtime", operation: "case.open" },
      },
      { kind: "confirm", operationId: base.operationId, objectId: OBJECT },
      { kind: "issue", operationId: base.operationId, objectId: OBJECT },
    ]);
    const observed = run([
      {
        kind: "observe",
        operationId: base.operationId,
        objectId: OBJECT,
        slug: base.slug,
        programmeId: base.programmeId,
      },
    ]);
    for (const other of [settle, runtimeStep, observed]) {
      expect(applyJournalTransition(other, close, horizon * 10)).toEqual({
        ok: false,
        error: "operation_conflict",
      });
    }
    // Past the runtime's own journal retention its absence proves nothing.
    expect(registrationClosable(entries[0], 1_000 + 30 * 24 * 3_600_000)).toBe(
      false,
    );
  });

  it("marks it closed with its reason and keeps its history", () => {
    const [entry] = issued();
    const closed = applyJournalTransition([entry], close, horizon);
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.entries).toHaveLength(1);
    expect(closed.entry).toEqual({
      ...entry,
      phase: "settled",
      status: "not_submitted",
      closure: { reason: "runtime_never_accepted", at: horizon },
      updatedAt: horizon,
    });
    // It never ran, so nothing read later is its outcome.
    for (const evaluation of [
      "registered",
      "ownership_moved_state_pending",
      "not_owned",
      undefined,
    ] as const) {
      expect(journalOperationStatus(closed.entry, evaluation)).toBe(
        "not_submitted",
      );
    }
    for (const step of [
      { kind: "settle", operationId: base.operationId, status: "registered" },
      close,
    ] as const) {
      expect(applyJournalTransition(closed.entries, step, horizon + 1)).toEqual(
        {
          ok: false,
          error: "operation_conflict",
        },
      );
    }
    for (const step of [
      { kind: "issue", operationId: base.operationId, objectId: OBJECT },
      { kind: "cancel", operationId: base.operationId },
      { kind: "begin", entry: base },
    ] as const) {
      expect(applyJournalTransition(closed.entries, step, horizon + 1)).toEqual(
        {
          ok: false,
          error: "operation_already_submitted",
        },
      );
    }
    // Stored and read back as it is; kept as long as an open entry would be.
    expect(parseJournalEntry(JSON.parse(JSON.stringify(closed.entry)))).toEqual(
      closed.entry,
    );
    expect(pruneJournal([closed.entry], horizon + 6 * 24 * 3_600_000)).toEqual([
      closed.entry,
    ]);
    // A closure is only ever a not_submitted settled registration's.
    for (const forged of [
      { ...closed.entry, status: "registered" },
      { ...closed.entry, phase: "assertion_issued" },
      { ...closed.entry, kind: "runtime" },
      { ...closed.entry, closure: { reason: "timeout", at: horizon } },
      { ...closed.entry, closure: { reason: "runtime_never_accepted" } },
    ]) {
      expect(parseJournalEntry(forged)).toBeUndefined();
    }
  });

  it("makes room with another finished entry before a closed one", () => {
    const [entry] = issued();
    const closed = applyJournalTransition([entry], close, horizon);
    if (!closed.ok) throw new Error(closed.error);
    let entries = closed.entries;
    for (let index = 1; index < 6; index += 1) {
      const operationId = `register-op-100${index}`;
      const begun = applyJournalTransition(
        entries,
        { kind: "begin", entry: { ...base, operationId } },
        horizon + index,
      );
      if (!begun.ok) throw new Error(begun.error);
      const cancelled = applyJournalTransition(
        begun.entries,
        { kind: "cancel", operationId },
        horizon + index,
      );
      if (!cancelled.ok) throw new Error(cancelled.error);
      entries = cancelled.entries;
    }
    const next = applyJournalTransition(
      entries,
      { kind: "begin", entry: { ...base, operationId: "register-op-2000" } },
      horizon + 10,
    );
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.entries.map((item) => item.operationId)).toContain(
      base.operationId,
    );
    expect(next.entries.map((item) => item.operationId)).not.toContain(
      "register-op-1001",
    );
  });
});
