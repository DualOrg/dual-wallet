export const queryKeys = {
  session: {
    all: ["viewer-session"] as const,
  },
  inventory: {
    all: ["inventory"] as const,
    lists: () => ["inventory", "list"] as const,
    list: (input: { search: string; owner?: string }) =>
      ["inventory", "list", input] as const,
    details: () => ["inventory", "detail"] as const,
    detail: (objectId: string) =>
      ["inventory", "detail", { objectId }] as const,
  },
  activity: {
    all: ["activity"] as const,
    page: (input: {
      search: string;
      status: string;
      walletId?: string;
      cursor?: string;
    }) => ["activity", "page", input] as const,
  },
} as const;
