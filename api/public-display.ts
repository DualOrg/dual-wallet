const OBJECT_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const VARIANTS = new Set(["card", "detail", "share"]);

export const MAX_PUBLIC_DISPLAY_BYTES = 2 * 1024 * 1024;

export function validPublicDisplayRequest(objectId: string, variant: string) {
  return OBJECT_ID.test(objectId) && VARIANTS.has(variant);
}

export function publicDisplayUpstreamPath(objectId: string, variant: string) {
  if (!validPublicDisplayRequest(objectId, variant)) return undefined;
  return `/public/objects/${encodeURIComponent(objectId)}/display/${variant}`;
}
