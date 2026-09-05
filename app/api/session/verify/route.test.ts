/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { DEFAULT_ORGANIZATION_ID } from "@/api/tenant";

const verifyWallet = jest.fn();
const getWallet = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  ...jest.requireActual("@/api/web-sdk-client"),
  getWalletsApi: () => ({ verifyWallet, getWallet }),
}));

const currentWallet = jest.fn();
const writeSession = jest.fn();
jest.mock("@/api/server-session", () => ({
  currentWallet: (...args: unknown[]) => currentWallet(...args),
  writeSession: (...args: unknown[]) => writeSession(...args),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost:3001/api/session/verify", {
      method: "POST",
      headers: {
        origin: "http://localhost:3001",
        host: "localhost:3001",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );

const SESSION_STATE = { accessToken: "live-access" };

const walletRecord = (activated: boolean) => ({
  id: "wallet-id",
  email: "session@example.com",
  activated,
  emailVerified: activated,
  account: { controller: {}, smartAccount: {} },
  whenCreated: new Date(),
  whenModified: new Date(),
});

beforeEach(() => {
  verifyWallet.mockReset().mockResolvedValue(undefined);
  getWallet.mockReset().mockResolvedValue(walletRecord(true));
  currentWallet.mockReset();
  writeSession.mockReset();
});

// The link in the mail opens wherever the person reads mail, which is usually
// not the browser holding a session. It carries its own address instead.
it("verifies from a link without reading a session", async () => {
  const response = await post({
    code: "abc123",
    email: "user@example.com",
    organization_id: "6a882d5aa27843f3c0f6fdf8",
  });

  expect(response.status).toBe(200);
  expect(currentWallet).not.toHaveBeenCalled();
  expect(verifyWallet).toHaveBeenCalledWith(
    {
      verifyIn: {
        code: "abc123",
        email: "user@example.com",
        organizationId: "6a882d5aa27843f3c0f6fdf8",
      },
    },
    { cache: "no-store" },
  );
});

// One hostname serves several organizations, so the host cannot say which
// account a link belongs to — only the link can.
it("prefers the link's organization over the host's", async () => {
  await post({
    code: "abc123",
    email: "user@example.com",
    organization_id: "6a882d5aa27843f3c0f6fdf8",
  });

  const sent = verifyWallet.mock.calls[0][0].verifyIn;
  expect(sent.organizationId).toBe("6a882d5aa27843f3c0f6fdf8");
  expect(sent.organizationId).not.toBe(DEFAULT_ORGANIZATION_ID);
});

// Typing the code is the other path. The address comes from the API rather
// than the request, so it cannot be pointed at somebody else's account.
it("takes the address from the session when the body carries none", async () => {
  currentWallet.mockResolvedValue({
    status: "active",
    wallet: { email: "session@example.com" },
    state: {},
  });

  const response = await post({ code: "abc123" });

  expect(response.status).toBe(200);
  expect(verifyWallet.mock.calls[0][0].verifyIn).toMatchObject({
    code: "abc123",
    email: "session@example.com",
    organizationId: DEFAULT_ORGANIZATION_ID,
  });
});

it("asks a signed-out caller with no link to sign in", async () => {
  currentWallet.mockResolvedValue({ status: "expired" });

  const response = await post({ code: "abc123" });

  expect(response.status).toBe(401);
  expect(verifyWallet).not.toHaveBeenCalled();
});

it("refuses a request with no code", async () => {
  const response = await post({ email: "user@example.com" });

  expect(response.status).toBe(400);
  expect(verifyWallet).not.toHaveBeenCalled();
});

// A renewal only survives on a response that carries it, and currentWallet may
// have renewed just now. The second read used to go through the session again
// and present the refresh token the first read had already spent.
describe("the renewed session", () => {
  beforeEach(() => {
    currentWallet.mockResolvedValue({
      status: "active",
      wallet: { email: "session@example.com" },
      state: SESSION_STATE,
    });
  });

  it("reads the session once and reports the verified wallet", async () => {
    const response = await post({ code: "abc123" });

    expect(currentWallet).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      wallet: { activated: true, emailVerified: true },
    });
  });

  it("rides back out on the response", async () => {
    const response = await post({ code: "abc123" });

    expect(writeSession).toHaveBeenCalledWith(response, SESSION_STATE);
  });

  // Losing it here left the browser holding a spent refresh token, and the next
  // request signed the wallet out over a mistyped code.
  it("survives a refused code", async () => {
    verifyWallet.mockRejectedValue(new Error("invalid code"));

    const response = await post({ code: "abc123" });

    expect(response.status).not.toBe(200);
    expect(writeSession).toHaveBeenCalledWith(response, SESSION_STATE);
  });
});
