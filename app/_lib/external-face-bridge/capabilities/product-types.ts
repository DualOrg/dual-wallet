import type {
  ProductFaceHandlers,
  ProductFaceSession,
} from "@/app/_lib/external-face-bridge/core/product-session";

export interface ProductFaceEvents {
  contextChanged(
    contextId: string | null,
    reason: "selected" | "cleared" | "account_changed",
  ): void;
}

export interface ProductFaceRuntime {
  session: ProductFaceSession;
  handlers: ProductFaceHandlers;
  events: ProductFaceEvents;
}

/** A named application-variant operation with its own payload validation. */
export interface ProductFaceCapability {
  operation: string;
  resolve(payload: unknown, runtime: ProductFaceRuntime): Promise<unknown>;
}
