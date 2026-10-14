import { isObjectId, type ProgrammeProduct } from "@/app/_domain/product-face";
import type {
  ProductFaceCapability,
  ProductFaceRuntime,
} from "@/app/_lib/external-face-bridge/capabilities/product-types";
import { toProductProjection } from "@/app/_lib/external-face-bridge/core/product-context";
import {
  faceError,
  toBridgeError,
  type ProductFaceSelection,
  type ProductFaceSession,
} from "@/app/_lib/external-face-bridge/core/product-session";
import {
  exactKeys,
  isRecord,
} from "@/app/_lib/external-face-bridge/core/protocol";

export const productOperations = {
  list: "programme.products.list",
  select: "programme.product.select",
  read: "programme.product.read",
  attributes: "programme.product.attributes.read",
  history: "programme.product.history.read",
} as const;

const CURSOR = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_CURSORS = 64;
const MAX_ATTRIBUTES = 100;
const MAX_HISTORY = 25;

function randomToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Wraps wallet service failures into contract errors for the face. */
async function call<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    throw toBridgeError(error);
  }
}

/**
 * The payload names the context it was issued; it must still be the current
 * selection. Product-scoped work without one is refused.
 */
export function requireContext(
  payload: unknown,
  session: ProductFaceSession,
  extraKeys: readonly string[] = [],
): ProductFaceSelection {
  if (
    !isRecord(payload) ||
    !exactKeys(payload, ["context_id", ...extraKeys]) ||
    typeof payload.context_id !== "string"
  ) {
    throw faceError("invalid_request");
  }
  session.assertLive();
  if (!session.selection) throw faceError("no_selection");
  if (session.selection.contextId !== payload.context_id) {
    throw faceError("stale_context");
  }
  return session.selection;
}

/**
 * Late results are dropped: when the selection changed or the session ended
 * while a private read was in flight, the face gets stale_context instead.
 */
export function assertStillCurrent(
  session: ProductFaceSession,
  selection: ProductFaceSelection,
) {
  session.assertLive();
  if (session.selection?.contextId !== selection.contextId) {
    throw faceError("stale_context");
  }
}

function clearSelection(runtime: ProductFaceRuntime) {
  if (!runtime.session.selection) return;
  runtime.session.selection = null;
  runtime.session.generation += 1;
  runtime.events.contextChanged(null, "cleared");
}

function heldProduct(runtime: ProductFaceRuntime, product: ProgrammeProduct) {
  const { session } = runtime;
  if (!session.application.templateIds.includes(product.templateId)) {
    throw faceError("not_in_programme");
  }
  if (!session.ownsProduct(product)) throw faceError("not_owned");
  return product;
}

export function productCapabilities(): ProductFaceCapability[] {
  return [
    {
      operation: productOperations.list,
      async resolve(payload, { session, handlers }) {
        if (
          !isRecord(payload) ||
          !exactKeys(payload, ["next"]) ||
          (payload.next !== undefined &&
            (typeof payload.next !== "string" || !CURSOR.test(payload.next)))
        ) {
          throw faceError("invalid_request");
        }
        session.assertLive();
        const templates = session.application.templateIds;
        let cursor: { templateIndex: number; next?: string } = {
          templateIndex: 0,
        };
        if (typeof payload.next === "string") {
          const stored = session.cursors.get(payload.next);
          if (!stored) throw faceError("invalid_request");
          cursor = stored;
        }
        // Opaque host cursor over one api-v3 cursor per programme template;
        // the face never sees or forges an upstream cursor.
        while (cursor.templateIndex < templates.length) {
          const templateId = templates[cursor.templateIndex];
          const page = await call(() =>
            handlers.listProducts({ templateId, next: cursor.next }),
          );
          session.assertLive();
          const products = page.products
            .filter(
              (product) =>
                product.templateId === templateId &&
                session.ownsProduct(product),
            )
            .map((product) =>
              toProductProjection(product, session.application, session.holder),
            );
          const following = page.next
            ? { templateIndex: cursor.templateIndex, next: page.next }
            : { templateIndex: cursor.templateIndex + 1 };
          if (products.length || following.templateIndex >= templates.length) {
            let next: string | null = null;
            if (following.templateIndex < templates.length) {
              next = randomToken();
              if (session.cursors.size >= MAX_CURSORS) {
                const oldest = session.cursors.keys().next().value;
                if (oldest) session.cursors.delete(oldest);
              }
              session.cursors.set(next, following);
            }
            return { products, next };
          }
          cursor = following;
        }
        return { products: [], next: null };
      },
    },
    {
      operation: productOperations.select,
      async resolve(payload, runtime) {
        const { session, handlers, events } = runtime;
        if (
          !isRecord(payload) ||
          !exactKeys(payload, ["object_id"]) ||
          !isObjectId(payload.object_id)
        ) {
          throw faceError("invalid_request");
        }
        session.assertLive();
        const objectId = payload.object_id;
        // A new selection invalidates the previous context immediately. The
        // face asked for the switch, so only the outcome is announced: the new
        // context, or "cleared" when the switch fails.
        const hadSelection = Boolean(session.selection);
        session.selection = null;
        session.generation += 1;
        const generation = session.generation;
        let product: ProgrammeProduct;
        let contextId: string;
        try {
          const result = await call(() => handlers.selectProduct(objectId));
          session.assertLive();
          if (session.generation !== generation) {
            throw faceError("stale_context");
          }
          product = heldProduct(runtime, result.product);
          if (product.objectId !== objectId) throw faceError("not_owned");
          contextId = result.contextId;
        } catch (error) {
          if (hadSelection && session.generation === generation) {
            events.contextChanged(null, "cleared");
          }
          throw error;
        }
        session.selection = { contextId, objectId, product };
        events.contextChanged(contextId, "selected");
        return {
          context_id: contextId,
          product: toProductProjection(
            product,
            session.application,
            session.holder,
          ),
        };
      },
    },
    {
      operation: productOperations.read,
      async resolve(payload, runtime) {
        const { session, handlers } = runtime;
        const selection = requireContext(payload, session);
        const fresh = await call(() =>
          handlers.readProduct(selection.objectId),
        );
        assertStillCurrent(session, selection);
        try {
          heldProduct(runtime, fresh);
        } catch (error) {
          clearSelection(runtime);
          throw error;
        }
        return {
          context_id: selection.contextId,
          product: toProductProjection(
            fresh,
            session.application,
            session.holder,
          ),
        };
      },
    },
    {
      operation: productOperations.attributes,
      async resolve(payload, { session, handlers }) {
        const selection = requireContext(payload, session);
        const attributes = await call(() =>
          handlers.readAttributes(selection.objectId),
        );
        assertStillCurrent(session, selection);
        return {
          context_id: selection.contextId,
          attributes: attributes
            .slice(0, MAX_ATTRIBUTES)
            .map(({ key, value }) => ({ key, value })),
          next: null,
        };
      },
    },
    {
      operation: productOperations.history,
      async resolve(payload, { session, handlers }) {
        const selection = requireContext(payload, session);
        const entries = await call(() =>
          handlers.readHistory(selection.objectId),
        );
        assertStillCurrent(session, selection);
        return {
          context_id: selection.contextId,
          entries: entries.slice(0, MAX_HISTORY).map((entry) => ({
            action_id: entry.actionId,
            action: entry.action,
            status: entry.status,
            when: entry.when.toISOString(),
          })),
        };
      },
    },
  ];
}

export { call as callWalletService };
