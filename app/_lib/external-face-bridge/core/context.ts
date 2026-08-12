import type { ObjectDetail } from "@/app/_domain/inventory";

export interface ExternalFaceObject {
  id: string;
  template_id: string;
  owner: string;
  version: number;
  metadata: {
    name: string;
    description?: string;
    category?: string;
    edition?: number;
    image?: { url: string };
  };
  custom: object;
  content_hash: string;
  state_hash: string;
  when_created: string;
  when_modified: string;
}

export interface AuthenticatedExternalFaceContext {
  object: ExternalFaceObject;
  actions: string[];
  config: object | null;
  variant: "card" | "detail" | "share";
}

export function toAuthenticatedExternalFaceContext(
  item: ObjectDetail,
  actions: string[] = [],
  config: object | null = item.display?.config ?? null,
  variant: AuthenticatedExternalFaceContext["variant"] = "card",
): AuthenticatedExternalFaceContext {
  return {
    object: {
      id: item.id,
      template_id: item.templateId,
      owner: item.owner,
      version: item.version,
      metadata: {
        name: item.name,
        description: item.description,
        category: item.category,
        edition: item.edition,
        image: item.imageUrl ? { url: item.imageUrl } : undefined,
      },
      custom: item.custom ?? {},
      content_hash: item.contentHash,
      state_hash: item.stateHash,
      when_created: item.createdAt.toISOString(),
      when_modified: item.modifiedAt.toISOString(),
    },
    actions: Array.from(new Set(actions)),
    config,
    variant,
  };
}
