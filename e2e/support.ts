import type { Page, Route } from "@playwright/test";

export const viewerWallet = {
  id: "wallet-e2e-1",
  nickname: "Ada Viewer",
  email: "ada@example.com",
  phoneNumber: "+41790000000",
  language: "en",
  fqdn: "demo.localhost",
  activated: true,
  disabled: false,
  address: "0x1234567890abcdef1234567890abcdef12345678",
  accountType: "smartwallet",
  custody: "self-custodial",
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
  owner: viewerWallet.address,
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
  signer: viewerWallet.address,
  signature: "0xsignature",
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
  version: 1,
  when_created: "2026-02-15T09:30:00.000Z",
  when_modified: "2026-02-15T09:31:00.000Z",
};

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
  await page.route("**/api/backend/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === "GET" && path === "/api/backend/objects") {
      return json(route, { objects: [smartObject] });
    }
    if (
      request.method() === "GET" &&
      path === `/api/backend/objects/${smartObject.id}`
    ) {
      return json(route, smartObject);
    }
    if (
      request.method() === "GET" &&
      path === "/api/backend/ebus/action-logs"
    ) {
      return json(route, { action_logs: [actionLog] });
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

export async function mockViewerApi(
  page: Page,
  { authenticated = false }: { authenticated?: boolean } = {},
) {
  let signedIn = authenticated;
  let wallet = { ...viewerWallet };

  if (authenticated) await setSessionCookie(page);
  await mockBackend(page);

  const authenticate = async (activated = true) => {
    signedIn = true;
    wallet = { ...viewerWallet, activated };
    await setSessionCookie(page);
    return wallet;
  };

  await page.route("**/api/session", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return signedIn
      ? json(route, { authenticated: true, wallet })
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
    wallet = { ...wallet, activated: true };
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
    const nextWallet = await authenticate();
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
    const nextWallet = await authenticate();
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
        get: async () => ({
          id: "credential-e2e-1",
          rawId: Uint8Array.from([1, 2, 3, 4]).buffer,
          type: "public-key",
          response: {
            clientDataJSON: Uint8Array.from([5, 6, 7]).buffer,
            authenticatorData: Uint8Array.from([8, 9, 10]).buffer,
            signature: Uint8Array.from([11, 12, 13]).buffer,
            userHandle: null,
          },
        }),
      },
    });
  });
}
