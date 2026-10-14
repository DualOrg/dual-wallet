import "server-only";

import {
  parseProductFaceApplications,
  type ProductFaceBinding,
} from "@/api/product-face-binding";
import {
  PRODUCT_FACE_CONTRACT,
  type ProductFaceApplication,
  type ProductFaceEntry,
} from "@/app/_domain/product-face";

let cached: { raw: string | undefined; bindings: ProductFaceBinding[] } = {
  raw: undefined,
  bindings: [],
};

// G5: there is no backend face-application registry yet. The deployment's
// server-only PRODUCT_FACE_APPLICATIONS is the registry; the browser never
// chooses a binding, origin or path.
export function productFaceBindings(): ProductFaceBinding[] {
  const raw = process.env.PRODUCT_FACE_APPLICATIONS;
  if (raw !== cached.raw) {
    cached = {
      raw,
      bindings: parseProductFaceApplications(raw, {
        production: process.env.NODE_ENV === "production",
      }),
    };
  }
  return cached.bindings;
}

export function productFaceBinding(slug: string) {
  return productFaceBindings().find((binding) => binding.slug === slug);
}

export function productFaceEntries(): ProductFaceEntry[] {
  return productFaceBindings().map((binding) => ({
    slug: binding.slug,
    programmeName: binding.programmeName,
    publisher: binding.publisher,
  }));
}

/** What browser code may know about a binding: no secrets exist in it. */
export function toProductFaceApplication(
  binding: ProductFaceBinding,
): ProductFaceApplication {
  return {
    slug: binding.slug,
    id: binding.applicationId,
    version: binding.version,
    publisher: binding.publisher,
    programme: { id: binding.programmeId, name: binding.programmeName },
    origin: binding.origin,
    path: binding.path,
    artifact: binding.artifactHash,
    contract: PRODUCT_FACE_CONTRACT,
    templateIds: [...binding.templateIds],
    projectionFields: [...binding.projectionFields],
    canonicalRegistration: binding.canonicalRegistration,
    settle: binding.settle,
  };
}
