import "server-only";

import type { NextRequest } from "next/server";
import type { FaceJournal } from "@/api/face-journal";
import { MAX_BFF_BODY_BYTES } from "@/api/settings";
import { hostJourneyEnabled, walletHost } from "@/api/wallet-host";
import { isRuntimeOperation } from "@/app/_domain/product-face";
import {
  journeyOfJournalEntry,
  journeyOfOperation,
  type HostJourney,
} from "@/app/_domain/wallet-host";

const FACE_ROUTE = /^\/api\/faces\/[^/]+(\/[^?#]*)?$/;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The JSON body, read from a clone so the route still reads its own. */
async function peekBody(request: NextRequest) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BFF_BODY_BYTES) return;
  try {
    const body = await request.clone().arrayBuffer();
    if (body.byteLength > MAX_BFF_BODY_BYTES) return undefined;
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    return record(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The journey one face BFF request serves, from its route and (for the
 * assertion and journal routes) its operation or journal entry. Undefined:
 * shared machinery (context, selection, the journal list) or a request its
 * route refuses as invalid anyway.
 */
export async function faceRequestJourney(
  request: NextRequest,
  journal: FaceJournal,
): Promise<HostJourney | undefined> {
  const route = FACE_ROUTE.exec(request.nextUrl.pathname)?.[1] ?? "";
  const post = request.method === "POST";
  if (route === "/settle-proposal" || route.startsWith("/units/")) {
    return "registration";
  }
  if (
    route === "/transfer-proposal" ||
    route === "/transfer-progress" ||
    route === "/accept-offer"
  ) {
    return "transfer";
  }
  if (route === "/assertions" && post) {
    const body = await peekBody(request);
    return isRuntimeOperation(body?.operation)
      ? journeyOfOperation(body.operation)
      : undefined;
  }
  if (route === "/operations" && post) {
    const body = await peekBody(request);
    if (!body) return undefined;
    if (body.transition === "begin") {
      if (body.kind === "runtime") {
        return isRuntimeOperation(body.operation)
          ? journeyOfOperation(body.operation)
          : undefined;
      }
      return typeof body.kind === "string"
        ? journeyOfJournalEntry({ kind: body.kind })
        : undefined;
    }
    const entry = journal.entries.find(
      (item) => item.operationId === body.operation_id,
    );
    return entry ? journeyOfJournalEntry(entry) : undefined;
  }
  if (route.startsWith("/operations/")) {
    let operationId: string;
    try {
      operationId = decodeURIComponent(route.slice("/operations/".length));
    } catch {
      // Not an operation id at all; the route's only other journey.
      return "registration";
    }
    const entry = journal.entries.find(
      (item) => item.operationId === operationId,
    );
    // Not this launch's own: only ever a recovered registration.
    return entry ? journeyOfJournalEntry(entry) : "registration";
  }
  return undefined;
}

/**
 * Whether a branded host refuses this face request because the journey it
 * serves is disabled. Called once, from resolveFaceRequest, before any route
 * logic runs: nothing is journaled, read from a runtime or minted for it.
 * The generic wallet enables every journey and never reads the request here.
 */
export async function faceJourneyRefused(
  request: NextRequest,
  journal: FaceJournal,
) {
  if (walletHost().status !== "active") return false;
  const journey = await faceRequestJourney(request, journal);
  return journey !== undefined && !hostJourneyEnabled(journey);
}
