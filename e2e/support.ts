import type { Page, Route } from "@playwright/test";
import type { ViewerWallet } from "@/app/_domain/wallet";

export const viewerWallet: ViewerWallet = {
  id: "wallet-e2e-1",
  nickname: "Ada Viewer",
  email: "ada@example.com",
  phoneNumber: "+41790000000",
  language: "en",
  fqdn: "demo.localhost",
  activated: true,
  emailVerified: true,
  disabled: false,
  account: {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    type: "SMART_WALLET",
  },
  controller: {
    address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    type: "SECP256K1",
    custody: "self-custodial",
    publicKey: "0xcontrollerpublickey",
  },
  smartAccount: {
    chainId: 1,
    factory: "0xfactory",
    implementation: "0ximplementation",
    index: 0,
    validator: "0xvalidator",
    validatorType: "ECDSA",
    version: "0.3.1",
  },
  hasPasskey: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  modifiedAt: "2026-02-01T00:00:00.000Z",
};

export const smartObject = {
  id: "507f1f77bcf86cd799439011",
  org_id: "demo",
  metadata: {
    name: "Sample Membership",
    description: "A verified membership object used by the Viewer E2E suite.",
    category: "Membership",
    edition: 7,
  },
  owner: viewerWallet.account.address,
  template_id: "507f1f77bcf86cd799439012",
  nonce: 1,
  version: 3,
  state_hash: "0xstatehash",
  content_hash: "0xcontenthash",
  integrity_hash: "0xintegrityhash",
  prev_integrity_hash: "0xprevintegrityhash",
  custom: { tier: "founder" },
  system: { transferable: true },
  when_created: "2026-01-10T10:00:00.000Z",
  when_modified: "2026-02-12T12:30:00.000Z",
};

export const actionLog = {
  id: "action-log-e2e-1",
  name: "mint",
  alias: "Mint membership",
  params: { id: smartObject.id },
  message_hash: "0xmessagehash",
  account: viewerWallet.account.address,
  controller: viewerWallet.controller.address,
  hash: "0xabcdefabcdefabcdefabcdefabcdefabcdef",
  affected_objects: [
    {
      id: smartObject.id,
      template_id: smartObject.template_id,
      prev_state_hash: "0xprevstate",
      next_state_hash: "0xnextstate",
      prev_integrity_hash: "0xprevintegrity",
      integrity_hash: "0xnextintegrity",
      state_change_id: "state-change-e2e-1",
      change_type: "create",
    },
  ],
  status: "completed",
  base_fee: "0.001",
  base_fee_wei: "1000",
  dynamic_fee: "0.002",
  dynamic_fee_wei: "2000",
  token_price: "1",
  total_fee: "0.003 DUAL",
  total_fee_wei: "3000",
  nonce: 1,
  auth: { type: "personal_sign", signature: "0xsignature" },
  version: 2,
  when_created: "2026-02-15T09:30:00.000Z",
  when_modified: "2026-02-15T09:31:00.000Z",
};

export const secondActionLog = {
  ...actionLog,
  id: "action-log-e2e-2",
  name: "transfer",
  alias: "Transfer membership",
  params: { id: smartObject.id, to: "0xrecipient" },
  message_hash: "0xsecondmessagehash",
  hash: "0x9876543210abcdef9876543210abcdef",
  when_created: "2026-02-14T09:30:00.000Z",
  when_modified: "2026-02-14T09:31:00.000Z",
};

const bridgeAttributes = [
  {
    id: "attribute-e2e-1",
    object_id: smartObject.id,
    key: "service.status",
    value: "active",
    category: "service",
    content_type: "text",
    public: true,
    value_hash: "attribute-value-hash",
    action_id: "attribute-action-id",
    object_nonce: 2,
    when_created: "2026-02-01T00:00:00.000Z",
    when_modified: "2026-02-12T12:30:00.000Z",
  },
];

function objectDisplay(variant: "card" | "detail") {
  return {
    face_id: "507f1f77bcf86cd799439013",
    variant,
    media_type: "text/html",
    href: `/public/objects/${smartObject.id}/display/${variant}`,
    revision: `face-e2e-${variant}`,
    interactive: false,
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function setSessionCookie(page: Page) {
  await page.context().addCookies([
    {
      name: "smarttoken_viewer",
      value: "e2e-session",
      domain: "demo.localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
}

export async function mockBackend(page: Page) {
  await page.route("**/api/public/objects/*/display/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<div>Rendered face: ${smartObject.metadata.name}</div>`,
    }),
  );
  await page.route("**/api/backend/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "GET" && path === "/api/backend/objects") {
      const variant =
        url.searchParams.get("display_variant") === "detail"
          ? "detail"
          : "card";
      return json(route, {
        items: [{ object: smartObject, display: objectDisplay(variant) }],
        objects: [smartObject],
        actions: [
          {
            template_id: smartObject.template_id,
            actions: ["pickup", "transfer"],
          },
        ],
      });
    }
    if (
      request.method() === "GET" &&
      path === `/api/backend/objects/${smartObject.id}`
    ) {
      return json(route, smartObject);
    }
    if (
      request.method() === "GET" &&
      path === `/api/backend/objects/${smartObject.id}/attributes`
    ) {
      return json(route, { attributes: bridgeAttributes });
    }
    if (
      request.method() === "GET" &&
      path === "/api/backend/ebus/action-logs"
    ) {
      if (url.searchParams.get("status") === "failed") {
        return json(route, { action_logs: [] });
      }
      return url.searchParams.get("next") === "activity-page-2"
        ? json(route, { action_logs: [secondActionLog] })
        : json(route, {
            action_logs: [actionLog],
            next: "activity-page-2",
          });
    }
    if (request.method() === "POST" && path === "/api/backend/ebus/prepare") {
      return json(route, { nonce: 2, challenge: "AQIDBA" });
    }
    if (request.method() === "POST" && path === "/api/backend/ebus/execute") {
      return json(route, { action_id: "action-e2e-2", steps: [] });
    }
    if (
      ["PATCH", "DELETE"].includes(request.method()) &&
      path === "/api/backend/wallets/me"
    ) {
      return json(route, {});
    }

    return json(
      route,
      { message: `Unexpected mocked API route: ${path}` },
      500,
    );
  });
}

export async function mockExternalBridgeDisplay(page: Page) {
  await page.route("**/api/backend/objects?**", (route) =>
    json(route, {
      items: [
        {
          object: smartObject,
          display: {
            face_id: "external-face-e2e",
            variant: "detail",
            media_type: "text/html",
            href: "http://localhost:4100/bridge/test-host/",
            aspect_ratio: "4/3",
            revision: "external-face-e2e-v1",
            interactive: true,
          },
        },
      ],
      objects: [smartObject],
      actions: [
        {
          template_id: smartObject.template_id,
          actions: ["update"],
        },
      ],
    }),
  );
}

export async function mockViewerApi(
  page: Page,
  { authenticated = false }: { authenticated?: boolean } = {},
) {
  let signedIn = authenticated;
  let wallet = { ...viewerWallet };
  let authenticationMethod = "email";

  if (authenticated) await setSessionCookie(page);
  await mockBackend(page);

  const authenticate = async (
    activated = true,
    method = "email",
    emailVerified = activated,
  ) => {
    signedIn = true;
    authenticationMethod = method;
    wallet = { ...viewerWallet, activated, emailVerified };
    await setSessionCookie(page);
    return wallet;
  };

  await page.route("**/api/session", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return signedIn
      ? json(route, { authenticated: true, authenticationMethod, wallet })
      : json(route, { authenticated: false }, 401);
  });

  await page.route("**/api/session/login", async (route) => {
    const nextWallet = await authenticate();
    return json(route, { authenticated: true, wallet: nextWallet });
  });

  await page.route("**/api/session/register", async (route) => {
    const nextWallet = await authenticate(false);
    return json(route, {
      authenticated: true,
      needsVerification: true,
      wallet: nextWallet,
    });
  });

  await page.route("**/api/session/verify", async (route) => {
    wallet = { ...wallet, activated: true, emailVerified: true };
    return json(route, { ok: true, wallet });
  });
  await page.route("**/api/session/verification-code", (route) =>
    json(route, { ok: true }),
  );

  await page.route("**/api/session/forgot-password", (route) =>
    json(route, { ok: true }),
  );
  await page.route("**/api/session/reset-password", (route) =>
    json(route, { ok: true }),
  );

  await page.route("**/api/session/eoa/challenge", (route) =>
    json(route, {
      challenge: "e2e-wallet-challenge",
      expiresAt: "2026-08-02T12:00:00.000Z",
    }),
  );
  await page.route("**/api/session/eoa/connect", async (route) => {
    const nextWallet = await authenticate(true, "eoa");
    return json(route, { authenticated: true, wallet: nextWallet });
  });

  await page.route("**/api/session/passkey/login/options", (route) =>
    json(route, {
      challenge: "AQIDBA",
      rpId: "demo.localhost",
      userVerification: "required",
      timeout: 60_000,
    }),
  );
  await page.route("**/api/session/passkey/login/verify", async (route) => {
    const nextWallet = await authenticate(true, "passkey");
    return json(route, { authenticated: true, wallet: nextWallet });
  });
  await page.route("**/api/session/passkey/register/options", (route) =>
    json(route, {
      challenge: "AQIDBA",
      rp: { id: "demo.localhost", name: "Dual Viewer" },
      user: {
        id: "BQYHCA",
        name: "demo.localhost",
        displayName: "Dual Viewer",
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "required",
      },
      timeout: 60_000,
    }),
  );
  await page.route("**/api/session/passkey/register/verify", async (route) => {
    const nextWallet = await authenticate(true, "passkey");
    return json(route, { authenticated: true, wallet: nextWallet });
  });

  await page.route("**/api/session/logout", async (route) => {
    signedIn = false;
    await page.context().clearCookies();
    return json(route, { ok: true });
  });
}

export async function installEoaProvider(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request: async ({ method }: { method: string }) => {
          if (method === "eth_requestAccounts") {
            return ["0x1234567890abcdef1234567890abcdef12345678"];
          }
          if (method === "personal_sign") return "0xe2e-signature";
          throw new Error(`Unexpected Ethereum method: ${method}`);
        },
      },
    });
  });
}

export async function installPasskeyProvider(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: class PublicKeyCredential {},
    });
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        create: async () => ({
          id: "credential-e2e-registered",
          rawId: Uint8Array.from([1, 2, 3, 4]).buffer,
          type: "public-key",
          response: {
            clientDataJSON: Uint8Array.from([5, 6, 7]).buffer,
            attestationObject: Uint8Array.from([8, 9, 10]).buffer,
            getTransports: () => ["internal"],
          },
        }),
        get: async () => ({
          id: "credential-e2e-1",
          rawId: Uint8Array.from([1, 2, 3, 4]).buffer,
          type: "public-key",
          response: {
            clientDataJSON: Uint8Array.from([5, 6, 7]).buffer,
            authenticatorData: Uint8Array.from([8, 9, 10]).buffer,
            signature: Uint8Array.from([
              0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02,
            ]).buffer,
            userHandle: null,
          },
        }),
      },
    });
  });
}
