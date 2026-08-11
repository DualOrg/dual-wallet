import { expect, test, type Locator } from "@playwright/test";
import { mockViewerApi, smartObject } from "./support";

async function expectModalWithinViewport(
  dialog: Locator,
  viewportHeight: number,
) {
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewportHeight + 1);
}

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
  await expect(
    page
      .frameLocator('iframe[title="Sample Membership"]')
      .getByText("Rendered face: Sample Membership"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Object details" }),
  ).toHaveCount(0);
  await expect(page.locator(".wallet-pass-stage button")).toHaveCount(0);
  const moreButtonBox = await page
    .getByRole("button", { name: "More pass options" })
    .boundingBox();
  const passBox = await page.locator(".wallet-pass-stage").boundingBox();
  expect(moreButtonBox).not.toBeNull();
  expect(passBox).not.toBeNull();
  expect(moreButtonBox!.y + moreButtonBox!.height).toBeLessThan(passBox!.y);

  await page.getByRole("button", { name: "More pass options" }).click();
  await expect(page.getByRole("menuitem", { name: "Share" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Show details" }).click();
  const details = page.getByRole("dialog");
  await expect(details.getByText("founder", { exact: false })).toBeVisible();
  await expect(details.getByText("0xstatehash", { exact: true })).toBeVisible();
  await details.getByRole("button", { name: "Close pass details" }).click();

  const actionsButton = page.getByRole("button", {
    name: "Show object actions",
  });
  const actionsButtonBox = await actionsButton.boundingBox();
  expect(actionsButtonBox).not.toBeNull();
  expect(actionsButtonBox!.y).toBeGreaterThan(passBox!.y + passBox!.height);
  expect(
    Math.abs(
      actionsButtonBox!.x +
        actionsButtonBox!.width -
        (moreButtonBox!.x + moreButtonBox!.width),
    ),
  ).toBeLessThanOrEqual(1);

  await actionsButton.click();
  await expect(
    page.getByRole("heading", { name: "Available actions", level: 2 }),
  ).toBeVisible();
});

test("detail modals fit and scroll inside a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto(`/inventory/${smartObject.id}`);

  await page.getByRole("button", { name: "More pass options" }).click();
  await page.getByRole("menuitem", { name: "Show details" }).click();

  const objectDialog = page.getByRole("dialog");
  await expect(objectDialog).toBeVisible();
  await expect(
    objectDialog.getByRole("button", { name: "Close pass details" }),
  ).toBeInViewport();
  await expectModalWithinViewport(objectDialog, 664);
  await objectDialog.locator(".object-pass-modal-body").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    objectDialog.getByRole("button", { name: "Close pass details" }),
  ).toBeInViewport();

  await objectDialog
    .getByRole("button", { name: "Close pass details" })
    .click();
  await page.goto("/activity");
  await page
    .getByRole("button", { name: "Open details for Mint membership" })
    .click();

  const activityDialog = page.getByRole("dialog");
  await expect(activityDialog).toBeVisible();
  await expectModalWithinViewport(activityDialog, 664);
  await expect(
    activityDialog.getByRole("button", { name: "Close activity details" }),
  ).toBeInViewport();
});

test("inventory switches between grid and list views", async ({ page }) => {
  await page.goto("/inventory");
  await page.evaluate(() => localStorage.removeItem("viewer-inventory-view"));
  await page.reload();
  await expect(
    page.getByText("Sample Membership", { exact: true }),
  ).toBeVisible();

  const inventory = page.locator(".inventory-grid");
  await expect(inventory).toHaveClass(/is-grid/);

  await page.getByRole("button", { name: "List" }).click();
  await expect(inventory).toHaveClass(/is-list/);

  await page.reload();
  await expect(page.locator(".inventory-grid")).toHaveClass(/is-list/);

  await page.getByRole("button", { name: "Grid" }).click();
  await expect(page.locator(".inventory-grid")).toHaveClass(/is-grid/);
});

test("inventory executes an action returned by the object template", async ({
  page,
}) => {
  await page.goto(`/inventory/${smartObject.id}`);

  await page.getByRole("button", { name: "Show object actions" }).click();
  await page.getByRole("button", { name: "Run Pick up" }).click();

  await expect(
    page.getByText("Action submitted. ID: action-e2e-2"),
  ).toBeVisible();
});

test("a public object link opens without a Viewer session", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.removeItem("viewer-theme"));
  await page.goto(`/objects/${smartObject.id}`);

  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(
    page.getByRole("heading", { name: "Sample Membership", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Public smart object")).toHaveCount(0);
  await expect(
    page
      .frameLocator('iframe[title="Sample Membership"]')
      .getByText("Rendered face: Sample Membership"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show object actions" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "More pass options" }).click();
  await expect(page.getByRole("menuitem", { name: "Share" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Show details" }).click();
  const details = page.getByRole("dialog");
  await expect(details.getByText("founder", { exact: false })).toBeVisible();
  await expect(details.getByText("0xstatehash", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/objects/${smartObject.id}$`));

  await details.getByRole("button", { name: "Close pass details" }).click();
  await page.getByRole("button", { name: "Change color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
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

  await page
    .getByRole("button", { name: "Open details for Mint membership" })
    .click();
  const details = page.getByRole("dialog");
  await expect(details).toBeVisible();
  await expect(
    details.getByText("0xmessagehash", { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByText("state-change-e2e-1", { exact: true }),
  ).toBeVisible();
  await expect(details.getByText("0xsignature", { exact: true })).toHaveCount(
    0,
  );
  await details.getByRole("button", { name: "Close activity details" }).click();
  await expect(details).toHaveCount(0);
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
