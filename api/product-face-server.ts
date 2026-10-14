import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  clearFaceJournal,
  FACE_LAUNCH_HEADER,
  FACE_LAUNCH_ID,
  readFaceJournal,
  writeFaceJournal,
  type FaceJournal,
  type FaceJournalOwner,
  type FaceJournalScope,
} from "@/api/face-journal";
import { clearFaceAcceptance } from "@/api/face-acceptance";
import { clearFaceHandover } from "@/api/face-handover";
import type { ProductFaceBinding } from "@/api/product-face-binding";
import { productFaceBinding } from "@/api/product-face-registry";
import { mutationGuard } from "@/api/request";
import {
  clearSessionCookie,
  currentWallet,
  sessionIdHash,
  withSessionId,
  writeSession,
  type SessionState,
} from "@/api/server-session";
import { ResponseError } from "@/api/web-sdk/runtime";
import { getObjectsApi } from "@/api/web-sdk-client";
import {
  toProgrammeProduct,
  toProgrammeUnitFacts,
} from "@/app/_adapters/product-face";
import {
  evaluateCanonicalRegistration,
  registrationReadback,
  type ProgrammeProduct,
} from "@/app/_domain/product-face";
import type { ViewerWallet } from "@/app/_domain/wallet";

export interface FaceRequestContext {
  binding: ProductFaceBinding;
  wallet: ViewerWallet;
  holder: string;
  state: SessionState;
  owner: FaceJournalOwner;
  /** This launch's journal scope (host-generated launch id, per frame). */
  scope: FaceJournalScope;
  journal: FaceJournal;
  request: NextRequest;
}

const NO_STORE = { "Cache-Control": "private, no-store" };

export function faceError(code: string, status: number) {
  return NextResponse.json(
    { code, message: code.replaceAll("_", " ") },
    { status, headers: NO_STORE },
  );
}

/**
 * Resolves the server-side binding, the active session and its journal. The
 * browser supplies only the slug; the binding, holder and wallet come from
 * the server registry and the session, never from the request body.
 */
export async function resolveFaceRequest(
  request: NextRequest,
  slug: string,
  { mutation = false }: { mutation?: boolean } = {},
): Promise<FaceRequestContext | NextResponse> {
  const binding = productFaceBinding(slug);
  if (!binding) return faceError("unknown_application", 404);
  // Every journal and selection belongs to one launch (frame) of the face.
  const launchId = request.headers.get(FACE_LAUNCH_HEADER) ?? "";
  if (!FACE_LAUNCH_ID.test(launchId)) return faceError("launch_required", 400);
  if (mutation) {
    const invalidOrigin = mutationGuard(request);
    if (invalidOrigin) return invalidOrigin;
  }
  const result = await currentWallet(request);
  if (result.status === "expired") {
    const response = faceError("session_expired", 401);
    clearSessionCookie(response);
    clearFaceJournal(response, request);
    // A pending face handover never outlives the session (contract r14).
    clearFaceHandover(response);
    clearFaceAcceptance(response);
    return response;
  }
  if (result.status === "unavailable") {
    return faceError("session_unavailable", 503);
  }
  const state = withSessionId(result.state);
  const owner = { sidHash: sessionIdHash(state)!, walletId: result.wallet.id };
  const scope: FaceJournalScope = {
    owner,
    launchId,
    slug: binding.slug,
    programmeId: binding.programmeId,
  };
  return {
    binding,
    wallet: result.wallet,
    holder: result.wallet.account.address,
    state,
    owner,
    scope,
    journal: readFaceJournal(request, scope),
    request,
  };
}

/** Private, uncached response that carries the renewed session and journal. */
export function faceResponse(
  context: FaceRequestContext,
  body: unknown,
  { status = 200, journal }: { status?: number; journal?: FaceJournal } = {},
) {
  const response = NextResponse.json(body, { status, headers: NO_STORE });
  writeSession(response, context.state);
  if (journal) {
    writeFaceJournal(response, context.request, context.scope, journal);
  }
  return response;
}

export function faceContextError(
  context: FaceRequestContext,
  code: string,
  status: number,
) {
  return faceResponse(
    context,
    { code, message: code.replaceAll("_", " ") },
    { status },
  );
}

function isStatus(error: unknown, status: number) {
  return error instanceof ResponseError && error.response.status === status;
}

/** The public projection of a unit; undefined when it does not exist. */
export async function readPublicUnit(objectId: string) {
  try {
    return await getObjectsApi().getObjectByIdPublic(
      { objectId },
      { cache: "no-store" },
    );
  } catch (error) {
    if (isStatus(error, 404) || isStatus(error, 400)) return undefined;
    throw error;
  }
}

export function publicUnitFacts(
  context: FaceRequestContext,
  object: NonNullable<Awaited<ReturnType<typeof readPublicUnit>>>,
) {
  return toProgrammeUnitFacts(
    object,
    context.holder,
    context.binding.projectionFields,
    context.binding.canonicalRegistration,
  );
}

export type OwnedProductResult =
  | { ok: true; product: ProgrammeProduct }
  | {
      ok: false;
      code: "not_found" | "not_owned" | "not_in_programme" | "session_expired";
    };

/**
 * Re-reads one object with the session's own credential and requires it to
 * be held by the session wallet and to belong to the bound programme.
 */
export async function readOwnedProduct(
  context: FaceRequestContext,
  objectId: string,
): Promise<OwnedProductResult> {
  let product: ProgrammeProduct;
  try {
    product = toProgrammeProduct(
      await getObjectsApi(context.state.accessToken).getObjectById(
        { objectId },
        { cache: "no-store" },
      ),
    );
  } catch (error) {
    if (isStatus(error, 401)) return { ok: false, code: "session_expired" };
    if (isStatus(error, 403) || isStatus(error, 404)) {
      return { ok: false, code: "not_found" };
    }
    throw error;
  }
  if (!context.binding.templateIds.includes(product.templateId)) {
    return { ok: false, code: "not_in_programme" };
  }
  if (product.owner.toLowerCase() !== context.holder.toLowerCase()) {
    return { ok: false, code: "not_owned" };
  }
  return { ok: true, product };
}

export function productRegistration(
  context: FaceRequestContext,
  product: ProgrammeProduct,
) {
  const readback = registrationReadback(
    product.owner,
    context.holder,
    product.custom,
    context.binding.canonicalRegistration,
  );
  return {
    readback,
    evaluation: evaluateCanonicalRegistration(
      readback,
      context.binding.canonicalRegistration,
    ),
  };
}

export async function routeSlug(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  return slug;
}
