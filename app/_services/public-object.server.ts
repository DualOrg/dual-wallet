import "server-only";

import { cache } from "react";
import { ResponseError } from "@/api/web-sdk/runtime";
import { getObjectsApi } from "@/api/web-sdk-client";
import { toPublicObject } from "@/app/_adapters/inventory";

export const getPublicObject = cache(async (objectId: string) => {
  const result = await getObjectsApi().listObjectsPublic(
    {
      id: objectId,
      limit: 1,
      include: ["display"],
      displayVariant: "card",
    },
    { cache: "no-store" },
  );
  const item = result.items?.[0];
  if (item) return toPublicObject(item.object, item.display);
  const object = result.objects[0];
  return object ? toPublicObject(object) : undefined;
});

export function isPublicObjectNotFound(error: unknown) {
  return error instanceof ResponseError && error.response.status === 404;
}
