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
  // Validated in the adapter from config.theme.colors.surface. Painted behind
  // the face so the reserved box matches it while loading and wherever the
  // frame letterboxes, instead of flashing the page background through.
  surface?: string;
}

export interface InventoryObject extends ObjectDetail {
  actions: string[];
}

export type ActivityStatus = "pending" | "completed" | "failed";
export type ActivityVersion = 1 | 2;
export type ActivityAuthenticationType =
  "eoa" | "webauthn" | "session_key" | "personal_sign";

export interface ActivityParameters {
  id?: string;
  templateId?: string;
  num?: number;
  to?: string;
  dataHash?: string;
}

export interface ActivityAffectedObject {
  id: string;
  templateId: string;
  prevStateHash: string;
  nextStateHash: string;
  prevIntegrityHash: string;
  integrityHash: string;
  stateChangeId: string;
  changeType: string;
}

export interface ActivityPermit {
  commitment: string;
  actionType: string;
  nonce: number;
  recipient?: string;
  deadline?: number;
}

export interface ActivityAccess {
  type: "public" | "private" | "whitelist" | "token";
}

export interface ActivityEntry {
  id: string;
  name: string;
  status: ActivityStatus;
  hash: string;
  account: string;
  controller: string;
  version: ActivityVersion;
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
  params: ActivityParameters;
  messageHash: string;
  account: string;
  controller: string;
  hash: string;
  affectedObjects: ActivityAffectedObject[];
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
  permit?: ActivityPermit;
  access?: ActivityAccess;
  authenticationType: ActivityAuthenticationType;
  version: ActivityVersion;
  whenModified: Date;
  whenCreated: Date;
}

export function shortId(value: string, size = 7) {
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}
