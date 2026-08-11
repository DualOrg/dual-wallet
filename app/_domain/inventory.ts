import type { ActionLog } from "@/api/web-sdk/models/ActionLog";
import type { PublicSmartObject } from "@/api/web-sdk/models/PublicSmartObject";
import type { SmartObject } from "@/api/web-sdk/models/SmartObject";

export interface ObjectDetail {
  id: string;
  name: string;
  description?: string;
  category?: string;
  edition?: number;
  imageUrl?: string;
  owner: string;
  templateId: string;
  version: number;
  stateHash: string;
  contentHash: string;
  createdAt: Date;
  modifiedAt: Date;
  custom?: object;
  system?: object;
}

export interface InventoryObject extends ObjectDetail {
  raw: SmartObject;
}

export interface ActivityEntry {
  id: string;
  name: string;
  status: "pending" | "completed" | "failed";
  hash: string;
  signer: string;
  affectedCount: number;
  totalFee: string;
  createdAt: Date;
}

function safeAssetUrl(value?: string) {
  if (!value) return undefined;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function toInventoryObject(value: SmartObject): InventoryObject {
  return {
    ...toObjectDetail(
      value,
      value.assets?.find((asset) => asset.type?.startsWith("image/"))?.url,
    ),
    raw: value,
  };
}

function toObjectDetail(
  value: SmartObject | PublicSmartObject,
  fallbackImageUrl?: string,
): ObjectDetail {
  return {
    id: value.id,
    name: value.metadata.name?.trim() || `Smart object ${value.id.slice(0, 8)}`,
    description: value.metadata.description,
    category: value.metadata.category,
    edition: value.metadata.edition,
    imageUrl: safeAssetUrl(value.metadata.image?.url || fallbackImageUrl),
    owner: value.owner,
    templateId: value.templateId,
    version: value.version,
    stateHash: value.stateHash,
    contentHash: value.contentHash,
    createdAt: value.whenCreated,
    modifiedAt: value.whenModified,
    custom: value.custom,
    system: value.system,
  };
}

export function toPublicObject(value: PublicSmartObject): ObjectDetail {
  return toObjectDetail(value);
}

export function toActivityEntry(value: ActionLog): ActivityEntry {
  const status = ["pending", "failed"].includes(value.status)
    ? value.status
    : "completed";
  return {
    id: value.id,
    name: value.alias || value.name,
    status,
    hash: value.hash,
    signer: value.signer,
    affectedCount: value.affectedObjects.length,
    totalFee: value.totalFee,
    createdAt: value.whenCreated,
  };
}

export function shortId(value: string, size = 7) {
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}
