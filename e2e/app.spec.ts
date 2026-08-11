import { expect, test } from "@playwright/test";
import { mockViewerApi, smartObject } from "./support";

test.beforeEach(async ({ page }) => {
  await mockViewerApi(page, { authenticated: true });
});

test("inventory opens a complete object detail", async ({ page }) => {
  await page.goto("/inventory");

  await expect(
    page.getByText("Sample Membership", { exact: true }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Open Sample Membership" }).click();

  await expect(page).toHaveURL(new RegExp(`/inventory/${smartObject.id}$`));
  await expect(
    page.getByRole("heading", { name: "Sample Membership", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("founder", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(
    page
      .frameLocator('iframe[title="Sample Membership"]')
      .getByText("Rendered face: Sample Membership"),
  ).toBeVisible();
});

test("a public object link opens without a Viewer session", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto(`/objects/${smartObject.id}`);

  await expect(
    page.getByRole("heading", { name: "Sample Membership", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Public smart object")).toBeVisible();
  await expect(
    page
      .frameLocator('iframe[title="Sample Membership"]')
      .getByText("Rendered face: Sample Membership"),
  ).toBeVisible();
  await expect(page.getByText("founder", { exact: false })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/objects/${smartObject.id}$`));
});

test("a short public link redirects to the canonical preview", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto(`/o/${smartObject.id}`);

  await expect(page).toHaveURL(new RegExp(`/objects/${smartObject.id}$`));
  await expect(
    page.getByRole("heading", { name: "Sample Membership", level: 1 }),
  ).toBeVisible();
});

test("an unavailable public object shows a safe not-found state", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/objects/missing-object");

  await expect(
    page.getByRole("heading", {
      name: "This object is not available",
      level: 2,
    }),
  ).toBeVisible();
});

test("activity shows the wallet action timeline", async ({ page }) => {
  await page.goto("/activity");

  await expect(
    page.getByRole("heading", { name: "Activity", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Mint membership", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();
  await expect(page.getByText("0.003 DUAL", { exact: true })).toBeVisible();
});

test("settings update the profile", async ({ page }) => {
  await page.goto("/settings");

  await page.getByLabel("Display name").fill("Ada Updated");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Your profile has been updated.")).toBeVisible();
  await expect(
    page.getByText("0x12345678…ef12345678", { exact: true }),
  ).toBeVisible();
});

test("account deletion requires explicit confirmation", async ({ page }) => {
  await page.goto("/settings");

  const deleteButton = page.getByRole("button", {
    name: "Permanently delete account",
  });
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();

  await expect(page).toHaveURL(/\/login$/);
});

test("sign out clears the user session", async ({ page }) => {
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
