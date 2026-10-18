import type { ActionLog } from "@/api/web-sdk/models/ActionLog";
import type { ObjectAttribute } from "@/api/web-sdk/models/ObjectAttribute";
import type { PublicSmartObject } from "@/api/web-sdk/models/PublicSmartObject";
import type { SmartObject } from "@/api/web-sdk/models/SmartObject";
import {
  evaluateCanonicalRegistration,
  isRecordId,
  projectFields,
  registrationReadback,
  type CanonicalRegistrationRules,
  type ProductAttribute,
  type ProductHistoryEntry,
  type ProgrammeProduct,
  type ProgrammeUnitFacts,
  type ProjectionField,
} from "@/app/_domain/product-face";

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function customRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toProgrammeProduct(
  object: SmartObject | PublicSmartObject,
): ProgrammeProduct {
  return {
    objectId: object.id.toLowerCase(),
    templateId: object.templateId.toLowerCase(),
    name: object.metadata?.name || object.id,
    imageUrl: httpsUrl(object.metadata?.image?.url),
    owner: object.owner,
    custom: customRecord(object.custom),
    modifiedAt: object.whenModified,
  };
}

export function toProgrammeUnitFacts(
  object: PublicSmartObject,
  holder: string,
  projectionFields: readonly ProjectionField[],
  rules: CanonicalRegistrationRules,
): ProgrammeUnitFacts {
  const product = toProgrammeProduct(object);
  const readback = registrationReadback(
    product.owner,
    holder,
    product.custom,
    rules,
  );
  return {
    objectId: product.objectId,
    templateId: product.templateId,
    name: product.name,
    imageUrl: product.imageUrl,
    recordId: isRecordId(product.custom.recordId)
      ? product.custom.recordId
      : null,
    fields: projectFields(product.custom, projectionFields),
    readback,
    registration: evaluateCanonicalRegistration(readback, rules),
  };
}

/** The action's own record says it touched exactly this object. */
export function touchesObject(log: ActionLog, objectId: string) {
  return (
    Array.isArray(log.affectedObjects) &&
    log.affectedObjects.some((affected) => affected?.id === objectId)
  );
}

export function toProductHistoryEntry(log: ActionLog): ProductHistoryEntry {
  return {
    actionId: log.id,
    action: log.alias || log.name,
    status:
      log.status === "pending" || log.status === "failed"
        ? log.status
        : "completed",
    when: log.whenCreated,
  };
}

export function toProductAttribute(
  attribute: ObjectAttribute,
): ProductAttribute {
  return { key: attribute.key, value: attribute.value };
}
