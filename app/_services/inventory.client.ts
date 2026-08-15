import "client-only";

import { getEbusApi, getObjectsApi } from "@/api/web-sdk-client";
import { toActivityEntry, toInventoryObject } from "@/app/_adapters/inventory";
import { toViewerError } from "@/app/_services/errors.client";

export async function listInventoryPage({
  search,
  owner,
  cursor,
  signal,
}: {
  search: string;
  owner?: string;
  cursor?: string;
  signal?: AbortSignal;
}) {
  try {
    const result = await getObjectsApi().listObjects(
      {
        autocomplete: search || undefined,
        owner,
        limit: 24,
        next: cursor,
        order: "desc",
        sortBy: "when_modified",
        include: ["display"],
        displayVariant: "card",
        actions: true,
      },
      { signal },
    );
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
          toInventoryObject(object, undefined, actions.get(object.templateId)),
        ),
      next: result.next,
    };
  } catch (error) {
    throw await toViewerError(error, "Inventory could not be loaded.");
  }
}

export async function getInventoryObject({
  objectId,
  signal,
}: {
  objectId: string;
  signal?: AbortSignal;
}) {
  try {
    const result = await getObjectsApi().listObjects(
      {
        id: objectId,
        limit: 1,
        include: ["display"],
        displayVariant: "detail",
        actions: true,
      },
      { signal },
    );
    const actions = new Map(
      result.actions?.map((entry) => [entry.templateId, entry.actions]),
    );
    const item = result.items?.[0];
    if (item) {
      return toInventoryObject(
        item.object,
        item.display,
        actions.get(item.object.templateId),
      );
    }
    const object = result.objects[0];
    if (object) {
      return toInventoryObject(
        object,
        undefined,
        actions.get(object.templateId),
      );
    }
    throw new Error("This object could not be loaded.");
  } catch (error) {
    throw await toViewerError(error, "This object could not be loaded.");
  }
}

export async function listActivityPage({
  search,
  status,
  walletId,
  cursor,
  signal,
}: {
  search: string;
  status: string;
  walletId: string;
  cursor?: string;
  signal?: AbortSignal;
}) {
  try {
    const result = await getEbusApi().listActionLogs(
      {
        autocomplete: search || undefined,
        status: status || undefined,
        walletId,
        limit: 25,
        next: cursor,
        order: "desc",
        sortBy: "when_created",
      },
      { signal },
    );
    return {
      items: result.actionLogs.map(toActivityEntry),
      next: result.next,
    };
  } catch (error) {
    throw await toViewerError(error, "Activity could not be loaded.");
  }
}
