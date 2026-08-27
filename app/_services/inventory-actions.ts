import type { ActionsRequest } from "@/api/web-sdk/models/ActionsRequest";
import type { AttributeInput } from "@/api/web-sdk/models/AttributeInput";

export type ActionFieldKind = "text" | "number" | "json" | "datetime";

export interface ActionFieldDefinition {
  name: string;
  kind: ActionFieldKind;
  required?: boolean;
  /** Placeholder message key when the field name alone is too generic. */
  placeholder?: string;
}

const definitions = {
  burn: [],
  transfer: [
    { name: "to", kind: "text", required: true, placeholder: "walletAddress" },
  ],
  drop: [
    { name: "latitude", kind: "number", required: true },
    { name: "longitude", kind: "number", required: true },
  ],
  pickup: [],
  redeem: [{ name: "templateId", kind: "text" }],
  update: [
    { name: "custom", kind: "json" },
    { name: "secret", kind: "text" },
  ],
  claim_ownership: [],
  connect: [{ name: "to", kind: "text", required: true }],
  disconnect: [],
  remote: [{ name: "data", kind: "json" }],
  permit: [
    { name: "scope", kind: "text", required: true },
    { name: "commitment", kind: "text", required: true },
    { name: "nonce", kind: "number" },
    { name: "recipient", kind: "text" },
    { name: "deadline", kind: "datetime" },
  ],
  set_attributes: [
    { name: "attributes", kind: "json", required: true },
    { name: "expectedObjectNonce", kind: "number" },
  ],
  delete_attributes: [
    { name: "keys", kind: "json", required: true },
    { name: "expectedObjectNonce", kind: "number" },
  ],
} as const satisfies Record<string, readonly ActionFieldDefinition[]>;

export type InventoryActionName = keyof typeof definitions;
export type ActionInput = Record<string, string>;
export type ActionInputErrorCode = "required" | "number" | "json";

export class ActionInputError extends Error {
  constructor(
    public field: string,
    public code: ActionInputErrorCode,
  ) {
    super(`${field}:${code}`);
  }
}

export function isInventoryActionName(
  value: string,
): value is InventoryActionName {
  return value in definitions;
}

export function actionFields(
  name: InventoryActionName,
): readonly ActionFieldDefinition[] {
  return definitions[name];
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Treat bridge-provided values as untrusted form defaults. The normal action
 * builder remains the authority when the user submits the Viewer-owned form.
 */
export function bridgeActionInput(
  name: InventoryActionName,
  value: unknown,
): ActionInput {
  if (value === undefined) return {};
  if (!record(value)) throw new ActionInputError("input", "json");

  const fields = new Map(
    actionFields(name).map((field) => [field.name, field]),
  );
  const result: ActionInput = {};
  for (const [key, raw] of Object.entries(value)) {
    const field = fields.get(key);
    if (!field) throw new ActionInputError(key, "json");
    if (raw === undefined || raw === null) continue;

    if (field.kind === "json") {
      if (typeof raw === "string") {
        result[key] = raw;
      } else {
        try {
          result[key] = JSON.stringify(raw);
        } catch {
          throw new ActionInputError(key, "json");
        }
      }
      continue;
    }
    if (field.kind === "number") {
      if (typeof raw !== "string" && typeof raw !== "number") {
        throw new ActionInputError(key, "number");
      }
      result[key] = String(raw);
      continue;
    }
    if (typeof raw !== "string") throw new ActionInputError(key, "json");
    result[key] = raw;
  }
  return result;
}

function text(input: ActionInput, field: string, required = false) {
  const value = input[field]?.trim();
  if (required && !value) throw new ActionInputError(field, "required");
  return value || undefined;
}

function number(input: ActionInput, field: string, required = false) {
  const value = text(input, field, required);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ActionInputError(field, "number");
  return parsed;
}

function unsignedInteger(input: ActionInput, field: string) {
  const value = number(input, field);
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0)
    throw new ActionInputError(field, "number");
  return value;
}

function json(input: ActionInput, field: string, required = false) {
  const value = text(input, field, required);
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ActionInputError(field, "json");
  }
}

function jsonObject(input: ActionInput, field: string) {
  const value = json(input, field);
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ActionInputError(field, "json");
  return value as Record<string, unknown>;
}

function attributeInputs(value: unknown): AttributeInput[] {
  if (!Array.isArray(value)) throw new ActionInputError("attributes", "json");

  return value.map((attribute) => {
    if (!attribute || typeof attribute !== "object" || Array.isArray(attribute))
      throw new ActionInputError("attributes", "json");

    const record = attribute as Record<string, unknown>;
    if (typeof record.key !== "string" || !("value" in record))
      throw new ActionInputError("attributes", "json");

    const publicValue = record.public ?? record._public;
    if (publicValue !== undefined && typeof publicValue !== "boolean")
      throw new ActionInputError("attributes", "json");

    const contentType = record.contentType ?? record.content_type;
    if (
      contentType !== undefined &&
      contentType !== "text" &&
      contentType !== "json"
    )
      throw new ActionInputError("attributes", "json");

    const normalized: Record<string, unknown> = {
      ...record,
      contentType,
      _public: publicValue,
    };
    delete normalized.public;
    delete normalized.content_type;
    return normalized as unknown as AttributeInput;
  });
}

export function buildInventoryAction(
  name: InventoryActionName,
  objectId: string,
  input: ActionInput = {},
): ActionsRequest {
  switch (name) {
    case "burn":
      return { burn: { id: objectId } };
    case "transfer":
      return { transfer: { id: objectId, to: text(input, "to", true)! } };
    case "drop":
      return {
        drop: {
          id: objectId,
          latitude: number(input, "latitude", true)!,
          longitude: number(input, "longitude", true)!,
        },
      };
    case "pickup":
      return { pickup: { id: objectId } };
    case "redeem":
      return {
        redeem: { id: objectId, templateId: text(input, "templateId") },
      };
    case "update": {
      const custom = jsonObject(input, "custom");
      return {
        update: {
          id: objectId,
          data: custom ? { custom } : undefined,
          secret: text(input, "secret"),
        },
      };
    }
    case "claim_ownership":
      return { claimOwnership: { id: objectId } };
    case "connect":
      return { connect: { id: objectId, to: text(input, "to", true)! } };
    case "disconnect":
      return { disconnect: { id: objectId } };
    case "remote":
      return { remote: { id: objectId, data: jsonObject(input, "data") } };
    case "permit": {
      const deadline = text(input, "deadline");
      const parsedDeadline = deadline ? new Date(deadline) : undefined;
      if (parsedDeadline && Number.isNaN(parsedDeadline.getTime()))
        throw new ActionInputError("deadline", "required");
      return {
        permit: {
          id: objectId,
          scope: text(input, "scope", true)!,
          commitment: text(input, "commitment", true)!,
          nonce: unsignedInteger(input, "nonce"),
          recipient: text(input, "recipient"),
          deadline: parsedDeadline,
        },
      };
    }
    case "set_attributes": {
      const attributes = attributeInputs(json(input, "attributes", true));
      return {
        setAttributes: {
          id: objectId,
          attributes,
          expectedObjectNonce: unsignedInteger(input, "expectedObjectNonce"),
        },
      };
    }
    case "delete_attributes": {
      const keys = json(input, "keys", true);
      if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string"))
        throw new ActionInputError("keys", "json");
      return {
        deleteAttributes: {
          id: objectId,
          keys: new Set(keys),
          expectedObjectNonce: unsignedInteger(input, "expectedObjectNonce"),
        },
      };
    }
  }
}
