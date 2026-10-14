/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const registerWallet = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  getWalletsApi: () => ({ registerWallet }),
}));

const establishWalletSession = jest.fn();
jest.mock("@/api/session-establish", () => ({
  establishWalletSession: (...args: unknown[]) =>
    establishWalletSession(...args),
}));

jest.mock("@/app/_adapters/wallet", () => ({
  toViewerWallet: (wallet: unknown) => wallet,
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost:3001/api/session/register", {
      method: "POST",
      headers: {
        origin: "http://localhost:3001",
        host: "localhost:3001",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  registerWallet.mockReset().mockResolvedValue({
    accessToken: "access",
    refreshToken: "refresh",
    wallet: { id: "wallet-1", emailVerified: false },
  });
  establishWalletSession.mockReset().mockReturnValue(true);
});

test("registration preserves an exact password and accepts a display name", async () => {
  const password = "  password  ";
  const response = await post({
    email: "ada@example.com",
    nickname: "Ada Viewer, Jr.",
    password,
  });

  expect(response.status).toBe(200);
  expect(registerWallet.mock.calls[0][0].walletCreate).toMatchObject({
    email: "ada@example.com",
    nickname: "Ada Viewer, Jr.",
    password,
  });
  // The request goes along: a pending face handover is settled against the
  // account that just registered (api/session-establish.ts).
  expect(establishWalletSession).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    "email",
    true,
  );
  await expect(response.json()).resolves.toMatchObject({
    needsVerification: true,
  });
});

test.each(["🙂".repeat(7), "🙂".repeat(19), "a".repeat(73)])(
  "registration rejects passwords outside the shared policy",
  async (password) => {
    const response = await post({ email: "ada@example.com", password });

    expect(response.status).toBe(400);
    expect(registerWallet).not.toHaveBeenCalled();
  },
);
