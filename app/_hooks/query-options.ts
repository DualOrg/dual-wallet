"use client";

import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
} from "@tanstack/react-query";
import { queryKeys } from "@/app/_hooks/query-keys";
import {
  getInventoryObject,
  listActivityPage,
  listInventoryPage,
} from "@/app/_services/inventory.client";
import { loadSession } from "@/app/_services/session.client";

export function sessionQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.session.all,
    queryFn: ({ signal }) => loadSession({ signal }),
    retry: false,
    staleTime: 30_000,
  });
}

export function inventoryQueryOptions(search: string, owner?: string) {
  return infiniteQueryOptions({
    queryKey: queryKeys.inventory.list({ search, owner }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listInventoryPage({ search, owner, cursor: pageParam, signal }),
    getNextPageParam: (page) => page.next,
  });
}

export function inventoryObjectQueryOptions(objectId: string) {
  return queryOptions({
    queryKey: queryKeys.inventory.detail(objectId),
    queryFn: objectId
      ? ({ signal }) => getInventoryObject({ objectId, signal })
      : skipToken,
  });
}

export function activityQueryOptions(
  search: string,
  status: string,
  walletId?: string,
  cursor?: string,
) {
  return queryOptions({
    queryKey: queryKeys.activity.page({ search, status, walletId, cursor }),
    queryFn: walletId
      ? ({ signal }) =>
          listActivityPage({ search, status, walletId, cursor, signal })
      : skipToken,
  });
}
