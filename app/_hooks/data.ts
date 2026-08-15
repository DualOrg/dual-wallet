"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  activityQueryOptions,
  inventoryObjectQueryOptions,
  inventoryQueryOptions,
} from "@/app/_hooks/query-options";

export function useInventory(search: string, owner?: string) {
  return useInfiniteQuery(inventoryQueryOptions(search, owner));
}

export function useInventoryObject(objectId: string) {
  return useQuery(inventoryObjectQueryOptions(objectId));
}

export function useActivity(
  search: string,
  status: string,
  walletId?: string,
  cursor?: string,
) {
  return useQuery(activityQueryOptions(search, status, walletId, cursor));
}
