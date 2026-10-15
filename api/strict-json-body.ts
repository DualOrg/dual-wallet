import "server-only";

/**
 * A request body read exactly as every decoder will read it. The backend
 * proxy forwards a request's raw bytes, so a decision taken on them holds
 * only if no decoder can read those bytes another way: valid UTF-8, one
 * top-level JSON object, and no member name repeated at any depth, however it
 * is spelled (escaped, case-folded, with or without underscores) — except
 * that inside a designated free-form map (EXACT_KEY_MAPS) the map's own keys
 * are compared exactly as decoded, because there they are distinct map keys,
 * not spellings of one typed field.
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
 * The free-form maps whose own keys are compared exactly, by their exact
 * decoded path from the body's root (object members only, never through an
 * array). Dual's contract types these as open string-keyed maps, not typed
 * fields: `Update.data` is `{ [key: string]: any }` and an object's `custom`
 * is an untyped `object` of the template's own keys (api/web-sdk/models
 * Update.ts, SmartObject.ts), and a map decoder (Go's encoding/json into a
 * map) never folds keys: `serialNumber` and `serial_number` are two keys of
 * one custom map, not one field spelled twice. Only the map's OWN keys are
 * exact; an object nested inside it, any other spelling of the path, and
 * every other position stay folded. An exact duplicate is refused anywhere.
 */
export const EXACT_KEY_MAPS: ReadonlyArray<readonly string[]> = [
  ["action", "update", "data", "custom"],
];

const startsPath = (path: readonly string[]) =>
  EXACT_KEY_MAPS.some(
    (map) =>
      path.length <= map.length &&
      path.every((name, index) => map[index] === name),
  );
const isExactKeyMap = (path: readonly string[]) =>
  EXACT_KEY_MAPS.some(
    (map) =>
      path.length === map.length &&
      path.every((name, index) => map[index] === name),
  );

// A lone surrogate escape (\ud800) is kept by JavaScript but read as U+FFFD
// by Go, so two names that differ only there are one name to some decoder.
const wellFormed = (name: string) =>
  name.replace(
    /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
    "�",
  );

interface ObjectFrame {
  names: Set<string>;
  expectName: boolean;
  /** The member whose value is being read. */
  member?: string;
  /** Exact decoded path from the root while it leads to an EXACT_KEY_MAPS entry. */
  path: string[] | null;
  /** Whether this object is a designated free-form map (exact keys). */
  exact: boolean;
}

/**
 * Whether valid JSON text repeats a member name in any one object, at any
 * depth: folded everywhere, and exactly as decoded in a designated free-form
 * map's own keys. Keys are compared decoded, so an escaped spelling is the
 * same name. Only meaningful for text JSON.parse accepts.
 */
export function repeatsMemberName(text: string) {
  const frames: Array<ObjectFrame | null> = [];
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
        const decoded = String(name);
        const key = frame.exact
          ? wellFormed(decoded)
          : foldMemberName(wellFormed(decoded));
        if (frame.names.has(key)) return true;
        frame.names.add(key);
        frame.member = decoded;
        frame.expectName = false;
      }
      index = end;
    } else if (char === "{") {
      const parent = frames[frames.length - 1];
      let path: string[] | null = null;
      if (parent === undefined) path = [];
      else if (parent?.path && parent.member !== undefined) {
        const next = [...parent.path, parent.member];
        path = startsPath(next) ? next : null;
      }
      frames.push({
        names: new Set(),
        expectName: true,
        path,
        exact: path !== null && isExactKeyMap(path),
      });
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
