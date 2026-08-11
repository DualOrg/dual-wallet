import { createServer } from "node:http";

const expectedOrganizationId = "000000000000000000000001";
const port = 4010;
const publicObjectId = "507f1f77bcf86cd799439011";
const publicObject = {
  id: publicObjectId,
  metadata: {
    name: "Sample Membership",
    description: "A verified membership object used by the Viewer E2E suite.",
    category: "Membership",
    edition: 7,
    image: {
      id: "image-e2e-1",
      url: "/og-viewer.png",
      is_public: true,
    },
  },
  owner: "0x1234567890abcdef1234567890abcdef12345678",
  template_id: "507f1f77bcf86cd799439012",
  nonce: 1,
  version: 3,
  state_hash: "0xstatehash",
  content_hash: "0xcontenthash",
  integrity_hash: "0xintegrityhash",
  prev_integrity_hash: "0xprevintegrityhash",
  custom: { tier: "founder" },
  when_created: "2026-01-10T10:00:00.000Z",
  when_modified: "2026-02-12T12:30:00.000Z",
};

function respond(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function display(variant) {
  return {
    face_id: "507f1f77bcf86cd799439013",
    variant,
    media_type: "text/html",
    href: `/public/objects/${publicObjectId}/display/${variant}`,
    revision: `face-e2e-${variant}`,
    interactive: false,
  };
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && request.url === "/health") {
    return respond(response, 200, { ok: true });
  }

  if (
    request.method === "GET" &&
    request.url === `/public/objects/${publicObjectId}`
  ) {
    return respond(response, 200, publicObject);
  }

  if (request.method === "GET" && url.pathname === "/public/objects") {
    const objectId = url.searchParams.get("id");
    const variant = url.searchParams.get("display_variant") ?? "card";
    const found = objectId === publicObjectId;
    return respond(response, 200, {
      items: found ? [{ object: publicObject, display: display(variant) }] : [],
      objects: found ? [publicObject] : [],
    });
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith(`/public/objects/${publicObjectId}/display/`)
  ) {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      ETag: '"face-e2e"',
    });
    response.end(
      "<!doctype html><html><body><strong>Rendered face: Sample Membership</strong></body></html>",
    );
    return;
  }

  if (request.method === "POST" && request.url === "/auth/password") {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 64 * 1024) request.destroy();
    });
    request.on("end", () => {
      try {
        const body = JSON.parse(rawBody);
        if (body.org_id !== expectedOrganizationId) {
          return respond(response, 422, {
            message: `Unexpected organization ID: ${body.org_id}`,
          });
        }
        return respond(response, 200, {});
      } catch {
        return respond(response, 400, { message: "Invalid JSON" });
      }
    });
    return;
  }

  return respond(response, 404, { message: "Not found" });
});

server.listen(port, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close());
}
