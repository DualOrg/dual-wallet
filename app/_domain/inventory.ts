import type { ActionLog } from "@/api/web-sdk/models/ActionLog";
import type { ObjectDisplay } from "@/api/web-sdk/models/ObjectDisplay";
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
  display?: ObjectPresentation;
}

export interface ObjectPresentation {
  kind: "document" | "external-document" | "image";
  url: string;
  mediaType: string;
  aspectRatio?: string;
  interactive: boolean;
  revision: string;
  config?: object;
}

export interface InventoryObject extends ObjectDetail {
  actions: string[];
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
  detail: ActivityDetail;
}

export interface ActivityDetail {
  id: string;
  batchId?: string;
  name: string;
  alias?: string;
  params: Omit<ActionLog["params"], "permitSecret">;
  messageHash: string;
  signer: string;
  delegatedSigner?: string;
  hash: string;
  affectedObjects: ActionLog["affectedObjects"];
  baseFee: string;
  baseFeeWei: string;
  dynamicFee: string;
  dynamicFeeWei: string;
  additionalFee?: string;
  additionalFeeWei?: string;
  tokenPrice: string;
  totalFee: string;
  totalFeeWei: string;
  nonce: number;
  permit?: ActionLog["permit"];
  access?: ActionLog["access"];
  authenticationType?: NonNullable<ActionLog["auth"]>["type"];
  version: number;
  whenModified: Date;
  whenCreated: Date;
}

function safeAssetUrl(value?: string) {
  if (!value) return undefined;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
    if (
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      return url.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function toInventoryObject(
  value: SmartObject,
  display?: ObjectDisplay,
  actions: string[] = [],
): InventoryObject {
  return {
    ...toObjectDetail(
      value,
      value.assets?.find((asset) => asset.type?.startsWith("image/"))?.url,
      display,
    ),
    actions,
    raw: value,
  };
}

function toObjectDetail(
  value: SmartObject | PublicSmartObject,
  fallbackImageUrl?: string,
  display?: ObjectDisplay,
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
    display: toObjectPresentation(value.id, value.contentHash, display),
  };
}

export function toPublicObject(
  value: PublicSmartObject,
  display?: ObjectDisplay,
): ObjectDetail {
  return toObjectDetail(value, undefined, display);
}

function toObjectPresentation(
  objectId: string,
  contentRevision: string,
  value?: ObjectDisplay,
): ObjectPresentation | undefined {
  if (!value) return undefined;
  const aspectRatio = /^[1-9][0-9]*\/[1-9][0-9]*$/.test(value.aspectRatio ?? "")
    ? value.aspectRatio
    : undefined;
  const expectedPath = `/public/objects/${objectId}/display/${value.variant}`;
  if (
    value.href === expectedPath &&
    ["text/html", "image/svg+xml"].includes(value.mediaType)
  ) {
    return {
      kind: "document",
      url: `/api${value.href}?revision=${encodeURIComponent(value.revision)}&content=${encodeURIComponent(contentRevision)}`,
      mediaType: value.mediaType,
      aspectRatio,
      interactive: value.interactive,
      revision: value.revision,
      config: value.config,
    };
  }
  const imageUrl = safeAssetUrl(value.href);
  if (
    imageUrl &&
    (imageUrl.startsWith("https://") ||
      (process.env.NODE_ENV !== "production" &&
        imageUrl.startsWith("http://"))) &&
    value.mediaType === "text/html"
  ) {
    return {
      kind: "external-document",
      url: imageUrl,
      mediaType: value.mediaType,
      aspectRatio,
      interactive: value.interactive,
      revision: value.revision,
      config: value.config,
    };
  }
  if (
    imageUrl?.startsWith("https://") &&
    value.mediaType.startsWith("image/")
  ) {
    return {
      kind: "image",
      url: imageUrl,
      mediaType: value.mediaType,
      aspectRatio,
      interactive: false,
      revision: value.revision,
      config: value.config,
    };
  }
  return undefined;
}

export function toActivityEntry(value: ActionLog): ActivityEntry {
  const status = ["pending", "failed"].includes(value.status)
    ? value.status
    : "completed";
  const params = { ...value.params };
  delete params.permitSecret;
  return {
    id: value.id,
    name: value.alias || value.name,
    status,
    hash: value.hash,
    signer: value.signer,
    affectedCount: value.affectedObjects.length,
    totalFee: value.totalFee,
    createdAt: value.whenCreated,
    detail: {
      id: value.id,
      batchId: value.batchId,
      name: value.name,
      alias: value.alias,
      params,
      messageHash: value.messageHash,
      signer: value.signer,
      delegatedSigner: value.delegatedSigner,
      hash: value.hash,
      affectedObjects: value.affectedObjects,
      baseFee: value.baseFee,
      baseFeeWei: value.baseFeeWei,
      dynamicFee: value.dynamicFee,
      dynamicFeeWei: value.dynamicFeeWei,
      additionalFee: value.additionalFee,
      additionalFeeWei: value.additionalFeeWei,
      tokenPrice: value.tokenPrice,
      totalFee: value.totalFee,
      totalFeeWei: value.totalFeeWei,
      nonce: value.nonce,
      permit: value.permit,
      access: value.access,
      authenticationType: value.auth?.type,
      version: value.version,
      whenModified: value.whenModified,
      whenCreated: value.whenCreated,
    },
  };
}

export function shortId(value: string, size = 7) {
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}
