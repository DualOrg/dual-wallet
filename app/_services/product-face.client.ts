import "client-only";

import { getEbusApi, getObjectsApi } from "@/api/web-sdk-client";
import {
  toProductAttribute,
  toProductHistoryEntry,
  toProgrammeProduct,
} from "@/app/_adapters/product-face";
import {
  isRegistrationStatus,
  ProductFaceError,
  type CaseQuote,
  type ProductAttribute,
  type ProductFaceApplication,
  type ProductHistoryEntry,
  type ProgrammeProduct,
  type ProgrammeUnitFacts,
  type RegistrationStatus,
  type SettleFieldChange,
  type SettleProposal,
} from "@/app/_domain/product-face";
import type { AuthenticationMethod } from "@/app/_domain/session";
import { executeInventoryAction } from "@/app/_services/action-executor.client";
import {
  bridgeActionInput,
  buildInventoryAction,
  isInventoryActionName,
} from "@/app/_services/inventory-actions";

// Journal-writing BFF calls run one at a time in this tab. The journal is a
// sealed cookie, and two overlapping writes would otherwise race to replace
// each other's version of it.
let journalQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = journalQueue.then(work, work);
  journalQueue = run.catch(() => undefined);
  return run;
}

async function faceRequest<T>(
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch {
    throw new ProductFaceError("temporarily_unavailable");
  }
  const body = (await response.json().catch(() => ({}))) as {
    code?: unknown;
  } & T;
  if (!response.ok) {
    throw new ProductFaceError(
      typeof body.code === "string"
        ? body.code
        : response.status === 401
          ? "session_expired"
          : "temporarily_unavailable",
      response.status,
    );
  }
  return body;
}

const base = (slug: string) => `/api/faces/${encodeURIComponent(slug)}`;

export async function loadProductFaceContext(slug: string) {
  return faceRequest<{ application: ProductFaceApplication; frameUrl: string }>(
    `${base(slug)}/context`,
  );
}

export async function readProgrammeUnit(slug: string, objectId: string) {
  const { unit } = await faceRequest<{ unit: ProgrammeUnitFacts }>(
    `${base(slug)}/units/${encodeURIComponent(objectId)}`,
  );
  return unit;
}

interface WireProduct {
  object_id: string;
  template_id: string;
  name: string;
  image_url: string | null;
  owner: string;
  custom: Record<string, unknown>;
  when_modified: string;
}

export function selectProgrammeProduct(slug: string, objectId: string) {
  return serialized(async () => {
    const result = await faceRequest<{
      context_id: string;
      product: WireProduct;
    }>(`${base(slug)}/selection`, {
      method: "POST",
      json: { object_id: objectId },
    });
    return {
      contextId: result.context_id,
      product: {
        objectId: result.product.object_id,
        templateId: result.product.template_id,
        name: result.product.name,
        imageUrl: result.product.image_url ?? undefined,
        owner: result.product.owner,
        custom: result.product.custom,
        modifiedAt: new Date(result.product.when_modified),
      } satisfies ProgrammeProduct,
    };
  });
}

interface WireOperation {
  operation_id: string;
  kind: "registration" | "runtime" | "settle";
  operation: string;
  object_id: string;
  case_id: string | null;
  phase: string;
  status: string | null;
  action_id: string | null;
}

export function writeFaceJournal(slug: string, body: Record<string, unknown>) {
  return serialized(async () => {
    const result = await faceRequest<{
      operation: WireOperation;
      unit: ProgrammeUnitFacts | null;
      quote: {
        case_id: string;
        quote_version: string;
        provider: string;
        amount: string;
        currency: string;
      } | null;
    }>(`${base(slug)}/operations`, { method: "POST", json: body });
    return {
      unit: result.unit ?? undefined,
      quote: result.quote
        ? ({
            caseId: result.quote.case_id,
            quoteVersion: result.quote.quote_version,
            provider: result.quote.provider,
            amount: result.quote.amount,
            currency: result.quote.currency,
          } satisfies CaseQuote)
        : undefined,
    };
  });
}

export async function listFaceOperations(slug: string) {
  const { operations } = await faceRequest<{ operations: WireOperation[] }>(
    `${base(slug)}/operations`,
  );
  return operations;
}

export async function readFaceOperationStatus(
  slug: string,
  operationId: string,
) {
  const result = await faceRequest<{
    status: string;
    object_id: string;
    readback: { owner_is_you: boolean; state: string | null } | null;
  }>(`${base(slug)}/operations/${encodeURIComponent(operationId)}`);
  if (!isRegistrationStatus(result.status)) {
    throw new ProductFaceError("temporarily_unavailable");
  }
  return {
    status: result.status as RegistrationStatus,
    objectId: result.object_id,
    readback: result.readback
      ? {
          ownerIsYou: result.readback.owner_is_you,
          state: result.readback.state,
        }
      : null,
  };
}

export function mintFaceAssertion(slug: string, body: object) {
  return serialized(async () => {
    const { assertion } = await faceRequest<{ assertion: string }>(
      `${base(slug)}/assertions`,
      { method: "POST", json: body },
    );
    return assertion;
  });
}

export function readSettleProposal(
  slug: string,
  input: { contextId: string; operationId: string; objectId: string },
) {
  return serialized(async () => {
    const result = await faceRequest<{
      proposal: {
        proposal_id: string;
        operation_id: string;
        object_id: string;
        action: string;
        input: Record<string, unknown>;
        proposal_hash: string;
        expires_at: string;
      };
      changes: SettleFieldChange[];
    }>(`${base(slug)}/settle-proposal`, {
      method: "POST",
      json: {
        context_id: input.contextId,
        operation_id: input.operationId,
        object_id: input.objectId,
      },
    });
    return {
      proposal: {
        proposalId: result.proposal.proposal_id,
        operationId: result.proposal.operation_id,
        objectId: result.proposal.object_id,
        action: result.proposal.action,
        input: result.proposal.input,
        proposalHash: result.proposal.proposal_hash,
        expiresAt: new Date(result.proposal.expires_at),
      } satisfies SettleProposal,
      changes: result.changes,
    };
  });
}

async function sdkCall<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    const status =
      error && typeof error === "object" && "response" in error
        ? Number((error as { response: { status?: unknown } }).response.status)
        : 0;
    throw new ProductFaceError(
      status === 401
        ? "session_expired"
        : status === 403 || status === 404
          ? "not_found"
          : "temporarily_unavailable",
      status,
    );
  }
}

export function listProgrammeProducts({
  owner,
  templateId,
  next,
}: {
  owner: string;
  templateId: string;
  next?: string;
}) {
  return sdkCall(async () => {
    const result = await getObjectsApi().listObjects({
      owner,
      templateId,
      limit: 25,
      next,
      order: "desc",
      sortBy: "when_modified",
    });
    const objects = result.items?.map((item) => item.object) ?? result.objects;
    return {
      products: objects.map(toProgrammeProduct),
      next: result.next || undefined,
    };
  });
}

export function readProgrammeProduct(objectId: string) {
  return sdkCall(async () =>
    toProgrammeProduct(await getObjectsApi().getObjectById({ objectId })),
  );
}

/** Fresh action availability for one object, like an inventory action. */
export function readProgrammeProductActions(objectId: string) {
  return sdkCall(async () => {
    const result = await getObjectsApi().listObjects({
      id: objectId,
      limit: 1,
      actions: true,
    });
    const object = result.items?.[0]?.object ?? result.objects[0];
    if (!object || object.id.toLowerCase() !== objectId) return [];
    return (
      result.actions?.find((entry) => entry.templateId === object.templateId)
        ?.actions ?? []
    );
  });
}

export function readProgrammeProductAttributes(
  objectId: string,
): Promise<ProductAttribute[]> {
  return sdkCall(async () => {
    const result = await getObjectsApi().listObjectAttributes({ objectId });
    return result.attributes.map(toProductAttribute);
  });
}

export function readProgrammeProductHistory(
  objectId: string,
): Promise<ProductHistoryEntry[]> {
  return sdkCall(async () => {
    const result = await getEbusApi().listActionLogs({
      objectId,
      limit: 25,
      order: "desc",
      sortBy: "when_created",
    });
    return result.actionLogs.map(toProductHistoryEntry);
  });
}

/**
 * Executes exactly the validated settle proposal as the holder through the
 * wallet's existing executor (email execute, or passkey/EOA prepare + sign +
 * execute). `claim_ownership` can never reach this path.
 */
export async function executeSettleAction({
  objectId,
  action,
  alias,
  input,
  authenticationMethod,
  controllerAddress,
}: {
  objectId: string;
  action: string;
  alias?: string;
  input: Record<string, unknown>;
  authenticationMethod: AuthenticationMethod;
  controllerAddress?: string;
}) {
  if (
    !isInventoryActionName(action) ||
    action === "claim_ownership" ||
    !["update", "set_attributes", "remote"].includes(action)
  ) {
    throw new ProductFaceError("proposal_rejected");
  }
  const request = buildInventoryAction(
    action,
    objectId,
    bridgeActionInput(action, input),
  );
  const result = await executeInventoryAction(
    alias ? { ...request, alias } : request,
    authenticationMethod,
    controllerAddress,
  );
  return { actionId: result.actionId };
}

export async function sha256Hash(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}
