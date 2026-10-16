import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  FACE_LAUNCH_HEADER,
  FACE_LAUNCH_ID,
  launchCapacity,
  readFaceJournal,
  writeFaceJournal,
  type FaceJournal,
  type FaceJournalOwner,
  type FaceJournalScope,
} from "@/api/face-journal";
import { clearFaceAcceptance } from "@/api/face-acceptance";
import { clearFaceHandover } from "@/api/face-handover";
import { faceJourneyRefused, type FaceRoute } from "@/api/host-journey-guard";
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
import { walletHost } from "@/api/wallet-host";
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
  /**
   * "read_only": a new launch the budget cannot give a cookie without
   * dropping never-dropped evidence; it opens and reads, nothing of it is
   * persisted, and journal-writing requests are refused launch_capacity.
   */
  capacity: "full" | "read_only";
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
  {
    mutation = false,
    route,
    journals = mutation,
  }: {
    mutation?: boolean;
    /**
     * Whether the route writes this launch's journal on success (default:
     * every mutation, the assertions route included: a mint is recorded).
     * A read-only launch (`capacity`) is refused such a route here; a
     * mutation that never journals for the calling launch (recovery-ack, a
     * progress read of another launch's step) passes `journals: false`.
     */
    journals?: boolean;
    /**
     * The calling route's own identity, for a branded host's journey check.
     * The assertion and journal routes name none and are recognised only at
     * their canonical path; anything unrecognised is refused there.
     */
    route?: FaceRoute;
  } = {},
): Promise<FaceRequestContext | NextResponse> {
  // A branded host whose configuration is invalid serves no face at all.
  if (walletHost().status === "invalid") {
    return faceError("host_unavailable", 503);
  }
  // A branded host's registry holds only its own faces.
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
    // The launch journals stay, as on every other route that sees the
    // session end (sign-out alone clears them): sealed to that session they
    // give no other session any authority, and they are this wallet's only
    // evidence of what it issued, which the same wallet signed in again may
    // reconcile read-only (readFaceHistory). Their own 24 hours still apply.
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
  const context: FaceRequestContext = {
    binding,
    wallet: result.wallet,
    holder: result.wallet.account.address,
    state,
    owner,
    scope,
    journal: readFaceJournal(request, scope),
    capacity: launchCapacity(request, scope),
    request,
  };
  // Never drop a launch cookie holding unresolved evidence of this wallet.
  // A new launch the budget cannot hold runs read-only: it opens, lists and
  // reads, and recovers and acknowledges; a request that would have to
  // journal (a selection, a mint, a journal transition, a proposal) is
  // refused here, before the journey gate and any route logic.
  if (context.capacity === "read_only" && journals) {
    return faceContextError(context, "launch_capacity", 409);
  }
  // A branded host refuses a disabled journey's request here, before any
  // route logic: nothing is journaled, read or minted for it.
  if (await faceJourneyRefused(request, binding.slug, context.journal, route)) {
    return faceContextError(context, "capability_not_granted", 403);
  }
  return context;
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
