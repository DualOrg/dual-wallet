"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getEbusApi,
  getObjectsApi,
  normalizeApiError,
} from "@/api/web-sdk-client";
import { toActivityEntry, toInventoryObject } from "@/app/_domain/inventory";

async function usefulError(error: unknown, fallback: string) {
  const normalized = await normalizeApiError(error, fallback);
  const result = new Error(normalized.message) as Error & {
    requestId?: string;
  };
  result.requestId = normalized.requestId;
  return result;
}

export function useInventory(search: string, owner?: string) {
  return useInfiniteQuery({
    queryKey: ["inventory", search, owner],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      try {
        const result = await getObjectsApi().listObjects({
          autocomplete: search || undefined,
          owner,
          limit: 24,
          next: pageParam,
          order: "desc",
          sortBy: "when_modified",
          include: ["display"],
          displayVariant: "card",
        });
        return {
          items:
            result.items?.map((item) =>
              toInventoryObject(item.object, item.display),
            ) ?? result.objects.map((object) => toInventoryObject(object)),
          next: result.next,
        };
      } catch (error) {
        throw await usefulError(error, "Inventory could not be loaded.");
      }
    },
    getNextPageParam: (page) => page.next,
  });
}

export function useInventoryObject(objectId: string) {
  return useQuery({
    queryKey: ["inventory-object", objectId],
    enabled: Boolean(objectId),
    queryFn: async () => {
      try {
        const result = await getObjectsApi().listObjects({
          id: objectId,
          limit: 1,
          include: ["display"],
          displayVariant: "detail",
        });
        const item = result.items?.[0];
        if (item) return toInventoryObject(item.object, item.display);
        const object = result.objects[0];
        if (object) return toInventoryObject(object);
        throw new Error("This object could not be loaded.");
      } catch (error) {
        throw await usefulError(error, "This object could not be loaded.");
      }
    },
  });
}

export function useActivity(search: string, status: string, walletId?: string) {
  return useInfiniteQuery({
    queryKey: ["activity", search, status, walletId],
    enabled: Boolean(walletId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      try {
        const result = await getEbusApi().listActionLogs({
          autocomplete: search || undefined,
          status: status || undefined,
          walletId,
          limit: 30,
          next: pageParam,
          order: "desc",
          sortBy: "when_created",
        });
        return {
          items: result.actionLogs.map(toActivityEntry),
          next: result.next,
        };
      } catch (error) {
        throw await usefulError(error, "Activity could not be loaded.");
      }
    },
    getNextPageParam: (page) => page.next,
  });
}
