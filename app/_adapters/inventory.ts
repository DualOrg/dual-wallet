import type { ActionLog } from "@/api/web-sdk/models/ActionLog";
import type { ObjectDisplay } from "@/api/web-sdk/models/ObjectDisplay";
import type { PublicSmartObject } from "@/api/web-sdk/models/PublicSmartObject";
import type { SmartObject } from "@/api/web-sdk/models/SmartObject";
import type {
  ActivityAccess,
  ActivityAffectedObject,
  ActivityEntry,
  ActivityParameters,
  ActivityPermit,
  InventoryObject,
  ObjectDetail,
  ObjectPresentation,
} from "@/app/_domain/inventory";

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

function publicConfig(value: ObjectDisplay["config"]): object | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
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
  const config = publicConfig(value.config);
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
      config,
    };
  }
  const assetUrl = safeAssetUrl(value.href);
  if (
    assetUrl &&
    (assetUrl.startsWith("https://") ||
      (process.env.NODE_ENV !== "production" &&
        assetUrl.startsWith("http://"))) &&
    value.mediaType === "text/html"
  ) {
    return {
      kind: "external-document",
      url: assetUrl,
      mediaType: value.mediaType,
      aspectRatio,
      interactive: value.interactive,
      revision: value.revision,
      config,
    };
  }
  if (
    assetUrl?.startsWith("https://") &&
    value.mediaType.startsWith("image/")
  ) {
    return {
      kind: "image",
      url: assetUrl,
      mediaType: value.mediaType,
      aspectRatio,
      interactive: false,
      revision: value.revision,
      config,
    };
  }
  return undefined;
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
  };
}

export function toPublicObject(
  value: PublicSmartObject,
  display?: ObjectDisplay,
): ObjectDetail {
  return toObjectDetail(value, undefined, display);
}

function activityParameters(value: ActionLog["params"]): ActivityParameters {
  return {
    id: value.id,
    templateId: value.templateId,
    num: value.num,
    to: value.to,
    dataHash: value.dataHash,
  };
}

function affectedObject(
  value: ActionLog["affectedObjects"][number],
): ActivityAffectedObject {
  return {
    id: value.id,
    templateId: value.templateId,
    prevStateHash: value.prevStateHash,
    nextStateHash: value.nextStateHash,
    prevIntegrityHash: value.prevIntegrityHash,
    integrityHash: value.integrityHash,
    stateChangeId: value.stateChangeId,
    changeType: value.changeType,
  };
}

function activityPermit(
  value: NonNullable<ActionLog["permit"]>,
): ActivityPermit {
  return {
    commitment: value.commitment,
    actionType: value.actionType,
    nonce: value.nonce,
    recipient: value.recipient,
    deadline: value.deadline,
  };
}

function activityAccess(
  value: NonNullable<ActionLog["access"]>,
): ActivityAccess {
  return { type: value.type };
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
    account: value.account,
    controller: value.controller,
    version: value.version,
    affectedCount: value.affectedObjects.length,
    totalFee: value.totalFee,
    createdAt: value.whenCreated,
    detail: {
      id: value.id,
      batchId: value.batchId,
      name: value.name,
      alias: value.alias,
      params: activityParameters(value.params),
      messageHash: value.messageHash,
      account: value.account,
      controller: value.controller,
      hash: value.hash,
      affectedObjects: value.affectedObjects.map(affectedObject),
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
      permit: value.permit ? activityPermit(value.permit) : undefined,
      access: value.access ? activityAccess(value.access) : undefined,
      authenticationType: value.auth.type,
      version: value.version,
      whenModified: value.whenModified,
      whenCreated: value.whenCreated,
    },
  };
}
