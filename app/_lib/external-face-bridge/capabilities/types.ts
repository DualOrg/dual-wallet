import type { AuthenticatedExternalFaceContext } from "@/app/_lib/external-face-bridge/core/context";

export interface ExternalFaceCapability {
  operation: string;
  resolve(
    payload: unknown,
    context: AuthenticatedExternalFaceContext,
  ): unknown | Promise<unknown>;
}
