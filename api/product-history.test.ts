/**
 * @jest-environment node
 */
// Live finding (fresh Mug, after a transfer): the recipient's History showed
// only their own update. The signed-in action-log list answers for the
// caller's organisation only, so the mint, the first registration and the
// earlier owner's request and custody action never appeared. The object's
// public state changes are its history whoever acted; statuses are the public
// action log's own answer per exact action.
import {
  ProductHistoryUnavailable,
  readPublicProductHistory,
} from "@/api/product-history";
import { getEbusApi, getObjectsApi } from "@/api/web-sdk-client";
import { ResponseError } from "@/api/web-sdk/runtime";

jest.mock("@/api/web-sdk-client", () => ({
  getEbusApi: jest.fn(),
  getObjectsApi: jest.fn(),
}));

const MUG = "6ad42c64f62f7c23306b2a6b";
const OTHER = "6ad0000000000000000000ff";
const at = (minutes: number) =>
  new Date(Date.UTC(2026, 9, 18, 4, 0) + minutes * 60e3);

// The Mug's lifecycle, newest first: mint by the brand, the first owner's
// registration, A's request and custody action, B's authenticity update.
interface Step {
  actionId: string;
  actionName: string;
  nonce: number;
  minute: number;
  prev?: number;
  create?: boolean;
}
const LIFECYCLE: Step[] = [
  {
    actionId: "6ad485b5aaaaaaaaaaaaaaaa",
    actionName: "update",
    nonce: 9,
    minute: 99,
  },
  {
    actionId: "6ad4849d2b60345f345efbdb",
    actionName: "transfer",
    nonce: 8,
    minute: 80,
  },
  {
    actionId: "6ad484562b60345f345efbc7",
    actionName: "update",
    nonce: 7,
    minute: 79,
  },
  {
    actionId: "6ad4800000000000000000a6",
    actionName: "update",
    nonce: 6,
    minute: 50,
  },
  {
    actionId: "6ad4800000000000000000a1",
    actionName: "mint",
    nonce: 1,
    prev: 0,
    minute: 1,
    create: true,
  },
];
function change(
  item: (typeof LIFECYCLE)[number],
  extra: Record<string, unknown> = {},
) {
  return {
    id: `sc-${item.actionId}`,
    objectId: MUG,
    actionId: item.actionId,
    actionName: item.actionName,
    changeType: item.create ? "create" : "update",
    change: { custom: { private: "never returned" } },
    prevNonce: item.prev ?? item.nonce - 1,
    nextNonce: item.nonce,
    prevOwner: "0xa",
    currentOwner: "0xb",
    batchId: "batch-1",
    whenCreated: at(item.minute),
    ...extra,
  };
}
// The registration steps between the mint and nonce 6 (nonces 2 to 5).
const MIDDLE: Step[] = [5, 4, 3, 2].map((nonce) => ({
  actionId: `6ad4800000000000000000b${nonce}`,
  actionName: "update",
  nonce,
  minute: nonce * 5,
}));
const FULL = [...LIFECYCLE.slice(0, 4), ...MIDDLE, LIFECYCLE[4]];
const STATUS: Record<string, string> = {
  "6ad484562b60345f345efbc7": "completed",
  "6ad4849d2b60345f345efbdb": "pending",
  "6ad485b5aaaaaaaaaaaaaaaa": "pending",
};
function log(
  actionId: string,
  objects = [MUG],
  extra: Record<string, unknown> = {},
) {
  return {
    id: actionId,
    name: "update",
    status: STATUS[actionId] ?? "completed",
    whenCreated: at(1),
    affectedObjects: objects.map((id) => ({ id })),
    ...extra,
  };
}

function upstream({
  pages = [{ stateChanges: FULL.map((item) => change(item)) }] as {
    stateChanges: unknown[];
    next?: string;
  }[],
  objectLogs = FULL.map((item) => log(item.actionId)) as unknown[],
  byId = (id: string): unknown[] => [log(id)],
  objectLogsFail = false,
} = {}) {
  const listStateChangesPublic = jest.fn();
  for (const page of pages) listStateChangesPublic.mockResolvedValueOnce(page);
  const listActionLogsPublic = jest.fn(async (request: { id?: string }) => {
    if (request.id) return { actionLogs: byId(request.id) };
    if (objectLogsFail) throw new Error("unreadable");
    return { actionLogs: objectLogs };
  });
  jest.mocked(getObjectsApi).mockReturnValue({
    listStateChangesPublic,
  } as unknown as ReturnType<typeof getObjectsApi>);
  jest.mocked(getEbusApi).mockReturnValue({
    listActionLogsPublic,
  } as unknown as ReturnType<typeof getEbusApi>);
  return { listStateChangesPublic, listActionLogsPublic };
}

describe("an object's public history across owners", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is every action on the object, whoever acted, newest first and ending in its mint, each with its own id and the action log's own status", async () => {
    const { listStateChangesPublic } = upstream();
    const entries = await readPublicProductHistory(MUG);
    expect(entries?.map((entry) => entry.actionId)).toEqual(
      FULL.map((item) => item.actionId),
    );
    expect(entries?.slice(0, 3).map((entry) => entry.status)).toEqual([
      "pending",
      "pending",
      "completed",
    ]);
    expect(entries?.at(-1)?.actionId).toBe("6ad4800000000000000000a1");
    // Only the action, its status and when: never an attribute change or owner.
    expect(Object.keys(entries![0]).sort()).toEqual([
      "action",
      "actionId",
      "status",
      "when",
    ]);
    expect(JSON.stringify(entries)).not.toContain("never returned");
    expect(listStateChangesPublic).toHaveBeenCalledWith(
      { objectId: MUG, limit: 25, next: undefined },
      { cache: "no-store" },
    );
  });

  it("never promotes a status: one the action log cannot answer is unknown, and a log for another object is not its answer", async () => {
    upstream({
      objectLogs: [log("6ad4849d2b60345f345efbdb", [OTHER])],
      byId: (id) =>
        id === "6ad484562b60345f345efbc7"
          ? [log(id)]
          : id === "6ad4849d2b60345f345efbdb"
            ? [log(id, [OTHER])]
            : [],
    });
    const entries = (await readPublicProductHistory(MUG))!;
    const status = Object.fromEntries(
      entries.map((entry) => [entry.actionId, entry.status]),
    );
    expect(status["6ad484562b60345f345efbc7"]).toBe("completed");
    expect(status["6ad4849d2b60345f345efbdb"]).toBe("unknown");
    expect(status["6ad485b5aaaaaaaaaaaaaaaa"]).toBe("unknown");
    // Without a log, the change's own action name and time are shown.
    expect(entries[0]).toMatchObject({ action: "update", when: at(99) });
  });

  it("reads each missing status by its exact action id when the object's own list cannot be read", async () => {
    const { listActionLogsPublic } = upstream({ objectLogsFail: true });
    const entries = (await readPublicProductHistory(MUG))!;
    expect(entries.map((entry) => entry.status).slice(0, 3)).toEqual([
      "pending",
      "pending",
      "completed",
    ]);
    const ids = listActionLogsPublic.mock.calls
      .map(([request]) => (request as { id?: string }).id)
      .filter(Boolean);
    expect(new Set(ids)).toEqual(new Set(FULL.map((item) => item.actionId)));
  });

  it("is read across pages with the list's own marker, a change repeated by an overlapping page counted once", async () => {
    const changes = FULL.map((item) => change(item));
    const { listStateChangesPublic } = upstream({
      pages: [
        { stateChanges: changes.slice(0, 4), next: "page-2" },
        { stateChanges: changes.slice(3) },
      ],
    });
    const entries = await readPublicProductHistory(MUG);
    expect(entries).toHaveLength(FULL.length);
    expect(
      listStateChangesPublic.mock.calls.map(([request]) => request.next),
    ).toEqual([undefined, "page-2"]);
  });

  it("is unavailable, never shown in part, when a change is missing between two others, the creation is missing, or a change names another object", async () => {
    const withoutRequest = FULL.filter((item) => item.nonce !== 7).map((item) =>
      change(item),
    );
    upstream({ pages: [{ stateChanges: withoutRequest }] });
    await expect(readPublicProductHistory(MUG)).rejects.toEqual(
      new ProductHistoryUnavailable("history_not_continuous"),
    );

    upstream({
      pages: [{ stateChanges: FULL.slice(0, 4).map((item) => change(item)) }],
    });
    await expect(readPublicProductHistory(MUG)).rejects.toEqual(
      new ProductHistoryUnavailable("creation_missing"),
    );
    upstream({ pages: [{ stateChanges: [] }] });
    await expect(readPublicProductHistory(MUG)).rejects.toEqual(
      new ProductHistoryUnavailable("creation_missing"),
    );

    upstream({
      pages: [
        {
          stateChanges: [
            change(FULL[0], { objectId: OTHER }),
            ...FULL.slice(1).map((item) => change(item)),
          ],
        },
      ],
    });
    await expect(readPublicProductHistory(MUG)).rejects.toEqual(
      new ProductHistoryUnavailable("change_for_another_object"),
    );
  });

  it("an object that does not exist has no history; an unreadable history is an error, not an empty one", async () => {
    const notFound = new ResponseError(new Response(null, { status: 404 }));
    jest.mocked(getObjectsApi).mockReturnValue({
      listStateChangesPublic: jest.fn().mockRejectedValue(notFound),
    } as unknown as ReturnType<typeof getObjectsApi>);
    await expect(readPublicProductHistory(MUG)).resolves.toBeUndefined();

    jest.mocked(getObjectsApi).mockReturnValue({
      listStateChangesPublic: jest
        .fn()
        .mockRejectedValue(
          new ResponseError(new Response(null, { status: 503 })),
        ),
    } as unknown as ReturnType<typeof getObjectsApi>);
    await expect(readPublicProductHistory(MUG)).rejects.toBeInstanceOf(
      ResponseError,
    );
  });

  it("a long history shows its newest 25 actions, continuous from the current change", async () => {
    const many: Step[] = Array.from({ length: 30 }, (_, index) => ({
      actionId: `6ad49${String(index).padStart(19, "0")}`,
      actionName: index === 29 ? "mint" : "update",
      nonce: 30 - index,
      minute: 300 - index,
      create: index === 29,
    }));
    const changes = many.map((item) => change(item));
    upstream({
      pages: [
        { stateChanges: changes.slice(0, 25), next: "page-2" },
        { stateChanges: changes.slice(25) },
      ],
      objectLogs: [],
    });
    const entries = (await readPublicProductHistory(MUG))!;
    expect(entries.map((entry) => entry.actionId)).toEqual(
      many.slice(0, 25).map((item) => item.actionId),
    );
  });
});
