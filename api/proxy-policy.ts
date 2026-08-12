export type ProxyDecision =
  | { allowed: true }
  | { allowed: false; status: 400 | 404 | 405; message: string };

const OBJECT_ID = /^[a-zA-Z0-9_-]{1,128}$/;

export function validateProxyPath(
  method: string,
  path: string[],
): ProxyDecision {
  if (
    !path.length ||
    path.some((part) => !part || part === "." || part === "..")
  ) {
    return { allowed: false, status: 400, message: "Invalid API path." };
  }
  if (
    path[0].startsWith("p") ||
    path[0] === "auth" ||
    (path[0] === "wallets" && path[1] === "connect")
  ) {
    return { allowed: false, status: 404, message: "Not found." };
  }

  if (method === "GET" && path.length === 1 && path[0] === "objects") {
    return { allowed: true };
  }
  if (
    method === "GET" &&
    path.length === 2 &&
    path[0] === "objects" &&
    OBJECT_ID.test(path[1])
  ) {
    return { allowed: true };
  }
  if (
    method === "GET" &&
    path.length === 3 &&
    path[0] === "objects" &&
    OBJECT_ID.test(path[1]) &&
    path[2] === "attributes"
  ) {
    return { allowed: true };
  }
  if (
    method === "GET" &&
    path.length === 2 &&
    path[0] === "ebus" &&
    path[1] === "action-logs"
  ) {
    return { allowed: true };
  }
  if (
    method === "POST" &&
    path.length === 2 &&
    path[0] === "ebus" &&
    ["prepare", "execute"].includes(path[1])
  ) {
    return { allowed: true };
  }
  if (
    ["GET", "PATCH", "DELETE"].includes(method) &&
    path.length === 2 &&
    path[0] === "wallets" &&
    path[1] === "me"
  ) {
    return { allowed: true };
  }
  return {
    allowed: false,
    status: method === "GET" ? 404 : 405,
    message: "Not found.",
  };
}
