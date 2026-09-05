jest.mock("@/app/_utils/client-api", () => {
  const actual = jest.requireActual("@/app/_utils/client-api");
  return { ...actual, requestJson: jest.fn() };
});

import { emailLogin, emailRegister } from "@/app/_services/auth.client";
import { ClientApiError, requestJson } from "@/app/_utils/client-api";

const mockRequestJson = jest.mocked(requestJson);

beforeEach(() => mockRequestJson.mockReset());

test("email login sends the remember choice without changing the password", async () => {
  mockRequestJson.mockResolvedValue({ authenticated: true });

  await emailLogin("ada@example.com", "  exact password  ", true);

  expect(mockRequestJson).toHaveBeenCalledWith("/api/session/login", {
    method: "POST",
    body: JSON.stringify({
      email: "ada@example.com",
      password: "  exact password  ",
      remember: true,
    }),
  });
});

test("duplicate registration becomes a useful auth error", async () => {
  mockRequestJson.mockRejectedValue(
    new ClientApiError("user exists", 409, "request-1"),
  );

  await expect(
    emailRegister("ada@example.com", "password", "Ada Viewer"),
  ).rejects.toMatchObject({ code: "account_exists" });
});
