import type { ObjectDetail } from "@/app/_domain/inventory";

export interface ExternalFaceObject {
  id: string;
  template_id: string;
  version: number;
  metadata: {
    name: string;
    description?: string;
    category?: string;
    edition?: number;
    image?: { url: string };
  };
  when_created: string;
  when_modified: string;
}

export interface ExternalFaceDetailObject extends ExternalFaceObject {
  owner: string;
  custom: object;
  content_hash: string;
  state_hash: string;
}

export interface AuthenticatedExternalFaceContext {
  object: ExternalFaceObject | ExternalFaceDetailObject;
  actions: string[];
  config: object | null;
  variant: "card" | "detail";
  revision: {
    contentHash: string;
    stateHash: string;
  };
}

function toExternalFaceObject(item: ObjectDetail): ExternalFaceObject {
  return {
    id: item.id,
    template_id: item.templateId,
    version: item.version,
    metadata: {
      name: item.name,
      description: item.description,
      category: item.category,
      edition: item.edition,
      image: item.imageUrl ? { url: item.imageUrl } : undefined,
    },
    when_created: item.createdAt.toISOString(),
    when_modified: item.modifiedAt.toISOString(),
  };
}

function revision(item: ObjectDetail) {
  return { contentHash: item.contentHash, stateHash: item.stateHash };
}

export function toInventoryCardExternalFaceContext(
  item: ObjectDetail,
): AuthenticatedExternalFaceContext {
  return {
    object: toExternalFaceObject(item),
    actions: [],
    config: item.display?.config ?? null,
    variant: "card",
    revision: revision(item),
  };
}

export function toAuthenticatedExternalFaceDetailContext(
  item: ObjectDetail,
  actions: string[] = [],
  config: object | null = item.display?.config ?? null,
): AuthenticatedExternalFaceContext {
  return {
    object: {
      ...toExternalFaceObject(item),
      owner: item.owner,
      custom: item.custom ?? {},
      content_hash: item.contentHash,
      state_hash: item.stateHash,
    },
    actions: Array.from(new Set(actions)),
    config,
    variant: "detail",
    revision: revision(item),
  };
}
