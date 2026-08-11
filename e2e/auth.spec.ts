import { expect, test } from "@playwright/test";
import {
  installEoaProvider,
  installPasskeyProvider,
  mockViewerApi,
} from "./support";

test("email login opens the wallet inventory", async ({ page }) => {
  await mockViewerApi(page);
  await page.goto("/login");

  await page.getByLabel("Email address").fill("ada@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/inventory$/);
  await expect(
    page.getByRole("heading", { name: "Inventory", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Sample Membership", { exact: true }),
  ).toBeVisible();
});

test("email registration continues through verification", async ({ page }) => {
  await mockViewerApi(page);
  await page.goto("/register");

  await page.getByLabel("Display name").fill("Ada Viewer");
  await page.getByLabel("Email address").fill("ada@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("correct-horse-battery-staple");
  await page
    .getByLabel("Confirm password")
    .fill("correct-horse-battery-staple");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();

  await expect(page).toHaveURL(/\/verify$/);
  await page.getByRole("button", { name: "Send a new code" }).click();
  await expect(
    page.getByText("A new verification code is on its way."),
  ).toBeVisible();
  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: "Verify account" }).click();

  await expect(page).toHaveURL(/\/inventory$/);
});

test("EOA challenge signing opens the wallet", async ({ page }) => {
  await installEoaProvider(page);
  await mockViewerApi(page);
  await page.goto("/login");

  await page.getByRole("tab", { name: "Wallet" }).click();
  await page.getByRole("button", { name: "Connect and sign" }).click();

  await expect(page).toHaveURL(/\/inventory$/);
  await expect(
    page.getByText("Sample Membership", { exact: true }),
  ).toBeVisible();
});

test("passkey assertion opens the wallet", async ({ page }) => {
  await installPasskeyProvider(page);
  await mockViewerApi(page);
  await page.goto("/login");

  await page.getByRole("tab", { name: "Passkey" }).click();
  await page.getByRole("button", { name: "Sign in with passkey" }).click();

  await expect(page).toHaveURL(/\/inventory$/);
  await expect(
    page.getByText("Sample Membership", { exact: true }),
  ).toBeVisible();
});

test("password recovery and reset complete without account disclosure", async ({
  page,
}) => {
  await mockViewerApi(page);
  await page.goto("/forgot-password");

  await page.getByLabel("Email address").fill("ada@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox" }),
  ).toBeVisible();

  await page.goto("/reset-password?token=e2e-reset-token");
  await page
    .getByLabel("New password", { exact: true })
    .fill("new-correct-horse-battery-staple");
  await page
    .getByLabel("Confirm new password")
    .fill("new-correct-horse-battery-staple");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(
    page.getByRole("heading", { name: "Password updated" }),
  ).toBeVisible();
});
