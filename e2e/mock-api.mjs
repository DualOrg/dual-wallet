// LOCAL FAKE of the api-v3 surface the wallet e2e suites use. It is not Dual:
// it keeps a tiny in-memory object store, never signs anything and is only
// ever bound to 127.0.0.1. The product-face suite additionally uses the
// programme objects below and the `/__test__/*` hooks.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const expectedOrganizationId =
  process.env.DEFAULT_ORGANIZATION_ID || "000000000000000000000001";
const port = Number(process.env.MOCK_API_PORT || 4010);
// Integrated mode (contract.localHarness): programme-template object reads go
// to the Studio local fake Dual so both sides read one state.
const programmeDualUrl = process.env.MOCK_PROGRAMME_DUAL_URL || "";
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

// ---------------------------------------------------------------- programme

export const PROGRAMME = {
  walletId: "wallet-face-e2e",
  walletAddress: "0x00000000000000000000000000000000000f00d1",
  controllerAddress: "0x00000000000000000000000000000000000c0de1",
  issuerAddress: "0x00000000000000000000000000000000000155ae",
  morrowTemplate: "6a0000000000000000000001",
  tidewellTemplate: "6a0000000000000000000002",
  unitA: "6a00000000000000000000a1",
  unitB: "6a00000000000000000000b2",
  ownedA: "6a00000000000000000000c3",
  ownedB: "6a00000000000000000000d4",
  tidewellKettle: "6a00000000000000000000e5",
  email: "face-e2e@example.com",
  password: "correct horse battery staple",
};

function programmeObject(id, { owner, template, name, serial, state }) {
  return {
    id,
    org_id: expectedOrganizationId,
    metadata: {
      name,
      description: `${name} (local fake)`,
      category: "Product",
    },
    owner,
    template_id: template,
    nonce: 1,
    version: 1,
    state_hash: `0x${id}`,
    content_hash: `0x${id}`,
    integrity_hash: `0x${id}`,
    prev_integrity_hash: `0x${id}`,
    custom: {
      title: name,
      serialNumber: serial,
      model: "ARC-G1",
      manufacturer: "Morrow Home",
      state,
    },
    when_created: "2026-09-01T09:00:00.000Z",
    when_modified: "2026-09-01T09:00:00.000Z",
  };
}

function seedProgramme() {
  const objects = new Map();
  const add = (object) => objects.set(object.id, object);
  add(
    programmeObject(PROGRAMME.unitA, {
      owner: PROGRAMME.issuerAddress,
      template: PROGRAMME.morrowTemplate,
      name: "Arc grinder",
      serial: "MH-ARC-0001",
      state: "Issued",
    }),
  );
  add(
    programmeObject(PROGRAMME.unitB, {
      owner: PROGRAMME.issuerAddress,
      template: PROGRAMME.morrowTemplate,
      name: "Arc grinder",
      serial: "MH-ARC-0002",
      state: "Issued",
    }),
  );
  add(
    programmeObject(PROGRAMME.ownedA, {
      owner: PROGRAMME.walletAddress,
      template: PROGRAMME.morrowTemplate,
      name: "Arc grinder",
      serial: "MH-ARC-0101",
      state: "Registered",
    }),
  );
  add(
    programmeObject(PROGRAMME.ownedB, {
      owner: PROGRAMME.walletAddress,
      template: PROGRAMME.morrowTemplate,
      name: "Morrow Arc grinder",
      serial: "MH-ARC-0102",
      state: "In service",
    }),
  );
  // A second brand's product: never part of the Morrow programme.
  add({
    ...programmeObject(PROGRAMME.tidewellKettle, {
      owner: PROGRAMME.walletAddress,
      template: PROGRAMME.tidewellTemplate,
      name: "Tidewell kettle",
      serial: "TW-K-0001",
      state: "Registered",
    }),
    custom: {
      title: "Tidewell kettle",
      serialNumber: "TW-K-0001",
      model: "TW-K",
      manufacturer: "Tidewell",
      state: "Registered",
    },
  });
  return objects;
}

let objects = seedProgramme();
let actionLogs = [];
const isProgrammeTemplate = (templateId) =>
  [PROGRAMME.morrowTemplate, PROGRAMME.tidewellTemplate].includes(templateId);

function wallet() {
  return {
    id: PROGRAMME.walletId,
    nickname: "Face E2E",
    email: PROGRAMME.email,
    language: "en",
    fqdn: "demo.localhost",
    activated: true,
    email_verified: true,
    disabled: false,
    account: {
      address: PROGRAMME.walletAddress,
      type: "SMART_WALLET",
      controller: {
        address: PROGRAMME.controllerAddress,
        type: "SECP256K1",
        custody: "custodial",
      },
      smart_account: {
        chain_id: 1,
        factory: "0xfactory",
        implementation: "0ximplementation",
        index: 0,
        validator: "0xvalidator",
        validator_type: "ECDSA",
        version: "0.3.1",
      },
    },
    when_created: "2026-01-01T00:00:00.000Z",
    when_modified: "2026-01-01T00:00:00.000Z",
  };
}

function token(claims) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(claims)}.fake`;
}

function login() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: token({ org_id: expectedOrganizationId, exp: now + 3600 }),
    refresh_token: token({
      exp: now + 7200,
      nonce: randomBytes(6).toString("hex"),
    }),
    wallet: wallet(),
  };
}

function actionLog(id, name, objectId, account) {
  const when = new Date().toISOString();
  return {
    id,
    name,
    params: { id: objectId },
    message_hash: `0x${id}`,
    account,
    controller: account,
    hash: `0x${createHash("sha256").update(id).digest("hex").slice(0, 40)}`,
    affected_objects: [
      {
        id: objectId,
        template_id: objects.get(objectId)?.template_id,
        prev_state_hash: "0xprev",
        next_state_hash: "0xnext",
        prev_integrity_hash: "0xprev",
        integrity_hash: "0xnext",
        state_change_id: `${id}-change`,
        change_type: "update",
      },
    ],
    status: "completed",
    base_fee: "0",
    base_fee_wei: "0",
    dynamic_fee: "0",
    dynamic_fee_wei: "0",
    token_price: "1",
    total_fee: "0 DUAL",
    total_fee_wei: "0",
    nonce: 1,
    auth: { type: "personal_sign", signature: "0xfake" },
    version: 2,
    when_created: when,
    when_modified: when,
  };
}

function mergeCustom(target, patch) {
  const result = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    result[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? mergeCustom(
            result[key] && typeof result[key] === "object" ? result[key] : {},
            value,
          )
        : value;
  }
  return result;
}

// ------------------------------------------------------------------ helpers

function respond(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 256 * 1024) request.destroy();
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(undefined);
      }
    });
  });
}

const authorized = (request) =>
  /^Bearer\s+\S+/.test(request.headers.authorization ?? "");

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

async function forwardProgramme(request, response, url) {
  try {
    const upstream = await fetch(
      `${programmeDualUrl}${url.pathname}${url.search}`,
      {
        headers: { Accept: "application/json" },
      },
    );
    response.writeHead(upstream.status, {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json",
    });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    respond(response, 502, { message: "Programme fake Dual unreachable" });
  }
}

async function handleProgramme(request, response, url) {
  const method = request.method;
  const path = url.pathname;

  // Test hooks for the product-face suite. Local fake only.
  if (method === "POST" && path === "/__test__/reset") {
    objects = seedProgramme();
    actionLogs = [];
    return respond(response, 200, { ok: true });
  }
  if (method === "POST" && path === "/__test__/issuer-transfer") {
    const body = await readBody(request);
    const object = objects.get(body?.object_id);
    if (!object) return respond(response, 404, { message: "Not found" });
    object.owner = body.to;
    object.custom = mergeCustom(object.custom, {
      state: body.state,
      ...(body.lifecycle_target
        ? { lifecycle: { target_state: body.lifecycle_target } }
        : {}),
    });
    object.when_modified = new Date().toISOString();
    const id = `action-${randomBytes(6).toString("hex")}`;
    actionLogs.unshift(
      actionLog(id, "transfer", object.id, PROGRAMME.issuerAddress),
    );
    return respond(response, 200, { action_id: id, object });
  }
  if (method === "GET" && path.startsWith("/__test__/objects/")) {
    const object = objects.get(path.slice("/__test__/objects/".length));
    return object
      ? respond(response, 200, object)
      : respond(response, 404, { message: "Not found" });
  }

  if (method === "POST" && path === "/auth/login") {
    const body = await readBody(request);
    if (body?.organization_id !== expectedOrganizationId) {
      return respond(response, 422, { message: "Unexpected organization" });
    }
    if (
      body.email !== PROGRAMME.email ||
      body.password !== PROGRAMME.password
    ) {
      return respond(response, 401, { message: "Invalid credentials" });
    }
    return respond(response, 200, login());
  }
  if (method === "POST" && path === "/auth/logout") {
    return respond(response, 200, {});
  }
  if (method === "POST" && path === "/auth/refresh-token") {
    const { access_token, refresh_token } = login();
    return respond(response, 200, { access_token, refresh_token });
  }
  if (method === "GET" && path === "/wallets/me") {
    if (!authorized(request)) return respond(response, 401, {});
    return respond(response, 200, wallet());
  }

  const objectMatch =
    /^\/(public\/)?objects\/([0-9a-f]{24})(\/attributes)?$/.exec(path);
  if (method === "GET" && objectMatch) {
    const [, isPublic, objectId, attributes] = objectMatch;
    const object = objects.get(objectId);
    if (!object) return undefined;
    if (programmeDualUrl && isProgrammeTemplate(object.template_id)) {
      return forwardProgramme(request, response, url);
    }
    if (!isPublic && !authorized(request)) return respond(response, 401, {});
    if (attributes) {
      return respond(response, 200, {
        attributes: [
          {
            id: `attribute-${objectId}`,
            object_id: objectId,
            key: "care.last_clean",
            value: "2026-09-20",
            content_type: "text",
            public: false,
            value_hash: "0xhash",
            action_id: "action-attribute",
            object_nonce: 1,
            when_created: "2026-09-20T00:00:00.000Z",
            when_modified: "2026-09-20T00:00:00.000Z",
          },
        ],
      });
    }
    return respond(response, 200, object);
  }

  if (method === "GET" && path === "/objects" && authorized(request)) {
    const templateId = url.searchParams.get("template_id");
    const owner = url.searchParams.get("owner")?.toLowerCase();
    const id = url.searchParams.get("id");
    if (programmeDualUrl && templateId && isProgrammeTemplate(templateId)) {
      return forwardProgramme(request, response, url);
    }
    const list = [...objects.values()].filter(
      (object) =>
        (!templateId || object.template_id === templateId) &&
        (!owner || object.owner.toLowerCase() === owner) &&
        (!id || object.id === id),
    );
    if (!list.length && id) return undefined;
    return respond(response, 200, {
      objects: list,
      actions: [...new Set(list.map((object) => object.template_id))].map(
        (template) => ({
          template_id: template,
          actions: ["update", "transfer"],
        }),
      ),
    });
  }

  if (method === "GET" && path === "/ebus/action-logs" && authorized(request)) {
    const objectId = url.searchParams.get("object_id");
    return respond(response, 200, {
      action_logs: actionLogs.filter(
        (log) =>
          !objectId || log.affected_objects.some((o) => o.id === objectId),
      ),
    });
  }

  if (method === "POST" && path === "/ebus/execute" && authorized(request)) {
    const body = await readBody(request);
    const update = body?.action?.update;
    const object = update && objects.get(update.id);
    if (!object || object.owner !== PROGRAMME.walletAddress) {
      return respond(response, 403, { message: "Not the holder" });
    }
    // The holder signs a standard update of their own unit's custom data.
    object.custom = mergeCustom(object.custom, update.data?.custom ?? {});
    object.when_modified = new Date().toISOString();
    const id = `action-${randomBytes(6).toString("hex")}`;
    actionLogs.unshift(
      actionLog(id, "update", object.id, PROGRAMME.walletAddress),
    );
    return respond(response, 200, { action_id: id, steps: [] });
  }
  return undefined;
}

const server = createServer(async (request, response) => {
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
    const body = await readBody(request);
    if (!body) return respond(response, 400, { message: "Invalid JSON" });
    if (body.organization_id !== expectedOrganizationId) {
      return respond(response, 422, {
        message: `Unexpected organization ID: ${body.organization_id}`,
      });
    }
    return respond(response, 200, {});
  }

  const handled = await handleProgramme(request, response, url);
  if (handled !== undefined || response.writableEnded) return;
  return respond(response, 404, { message: "Not found" });
});

server.listen(port, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close());
}
