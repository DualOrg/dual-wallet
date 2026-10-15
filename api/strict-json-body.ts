import "server-only";

/**
 * A request body read exactly as every decoder will read it. The backend
 * proxy forwards a request's raw bytes, so a decision taken on them holds
 * only if no decoder can read those bytes another way: valid UTF-8, one
 * top-level JSON object, and no member name repeated at any depth, however it
 * is spelled (escaped, case-folded, with or without underscores).
 */

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Member names are compared the way a case-insensitive JSON decoder could
// match them (Go's encoding/json folds case: "ſ" is S, the Kelvin sign K),
// and without underscores (claim_ownership, claimOwnership), so no spelling
// of a name slips past or stands in for another.
export const foldMemberName = (name: string) =>
  name.toLowerCase().toUpperCase().replace(/_/g, "");

/**
 * Whether valid JSON text repeats a member name (folded) in any one object,
 * at any depth. Keys are compared decoded, so an escaped spelling is the same
 * name. Only meaningful for text JSON.parse accepts.
 */
export function repeatsMemberName(text: string) {
  const frames: Array<{ names: Set<string>; expectName: boolean } | null> = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== '"') {
        end += text[end] === "\\" ? 2 : 1;
      }
      const frame = frames[frames.length - 1];
      if (frame?.expectName) {
        let name: unknown;
        try {
          name = JSON.parse(text.slice(index, end + 1));
        } catch {
          return true;
        }
        const folded = foldMemberName(String(name));
        if (frame.names.has(folded)) return true;
        frame.names.add(folded);
        frame.expectName = false;
      }
      index = end;
    } else if (char === "{") {
      frames.push({ names: new Set(), expectName: true });
    } else if (char === "[") {
      frames.push(null);
    } else if (char === "}" || char === "]") {
      frames.pop();
    } else if (char === ",") {
      const frame = frames[frames.length - 1];
      if (frame) frame.expectName = true;
    }
  }
  return false;
}

/** The one JSON object these bytes are, read unambiguously; else undefined. */
export function unambiguousObject(bytes: ArrayBuffer) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!record(parsed) || repeatsMemberName(text)) return undefined;
  return parsed;
}
