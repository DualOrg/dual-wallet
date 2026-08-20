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

// ponytail: one fixed interval, no server-driven expiry hint. Shorten this if
// the API refresh-token lifetime ever drops below ~10 minutes.
const SESSION_KEEPALIVE_MS = 5 * 60_000;

export function sessionQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.session.all,
    queryFn: ({ signal }) => loadSession({ signal }),
    retry: false,
    staleTime: 30_000,
    // The server only renews the tokens when a request arrives. An idle tab
    // makes no requests, so the refresh token expires and the next click lands
    // on a dead session. Poll well inside that window to keep it rolling, and
    // keep polling in a hidden tab because that is exactly where this bites.
    refetchInterval: SESSION_KEEPALIVE_MS,
    refetchIntervalInBackground: true,
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
