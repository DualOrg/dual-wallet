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
          actions: true,
        });
        const actions = new Map(
          result.actions?.map((item) => [item.templateId, item.actions]),
        );
        return {
          items:
            result.items?.map((item) =>
              toInventoryObject(
                item.object,
                item.display,
                actions.get(item.object.templateId),
              ),
            ) ??
            result.objects.map((object) =>
              toInventoryObject(
                object,
                undefined,
                actions.get(object.templateId),
              ),
            ),
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
          actions: true,
        });
        const actions = new Map(
          result.actions?.map((entry) => [entry.templateId, entry.actions]),
        );
        const item = result.items?.[0];
        if (item)
          return toInventoryObject(
            item.object,
            item.display,
            actions.get(item.object.templateId),
          );
        const object = result.objects[0];
        if (object)
          return toInventoryObject(
            object,
            undefined,
            actions.get(object.templateId),
          );
        throw new Error("This object could not be loaded.");
      } catch (error) {
        throw await usefulError(error, "This object could not be loaded.");
      }
    },
  });
}

export function useActivity(
  search: string,
  status: string,
  walletId?: string,
  cursor?: string,
) {
  return useQuery({
    queryKey: ["activity", search, status, walletId, cursor],
    enabled: Boolean(walletId),
    queryFn: async () => {
      try {
        const result = await getEbusApi().listActionLogs({
          autocomplete: search || undefined,
          status: status || undefined,
          walletId,
          limit: 25,
          next: cursor,
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
  });
}
