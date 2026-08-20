import { expect, test, type Locator } from "@playwright/test";
import {
  mockExternalBridgeDisplay,
  mockViewerApi,
  smartObject,
  viewerWallet,
} from "./support";

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

test("account chip opens a compact user profile", async ({ page }) => {
  await page.goto("/inventory");

  const trigger = page.getByRole("button", { name: "Open user profile" });
  await expect(trigger.getByText("0x12....678", { exact: true })).toBeVisible();
  await trigger.click();

  const profile = page.locator("#user-profile-popover");
  await expect(profile).toBeVisible();
  await expect(
    profile.getByText(viewerWallet.nickname!, { exact: true }),
  ).toBeVisible();
  await expect(
    profile.getByText(viewerWallet.email!, { exact: true }),
  ).toBeVisible();
  await expect(profile.getByText("0x12....678", { exact: true })).toBeVisible();
  await expect(
    profile.getByRole("link", { name: "Manage profile" }),
  ).toHaveAttribute("href", "/settings");

  await page.keyboard.press("Escape");
  await expect(profile).toHaveCount(0);
  await expect(trigger).toBeFocused();
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
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await page.getByRole("button", { name: "Show details" }).click();
  const details = page.getByRole("dialog");
  await expect(details.getByText("founder", { exact: false })).toBeVisible();
  await expect(details.getByText("0xstatehash", { exact: true })).toBeVisible();
  await details.getByRole("button", { name: "Close pass details" }).click();

  const actionsButton = page.getByRole("button", {
    name: "Show object actions",
  });
  const actionsButtonBox = await actionsButton.boundingBox();
  expect(actionsButtonBox).not.toBeNull();
  expect(Math.abs(actionsButtonBox!.y - moreButtonBox!.y)).toBeLessThanOrEqual(
    1,
  );
  expect(actionsButtonBox!.x + actionsButtonBox!.width).toBeLessThanOrEqual(
    moreButtonBox!.x,
  );

  await actionsButton.click();
  await expect(
    page.getByRole("group", { name: "Available actions" }),
  ).toBeVisible();
});

test("switching action moves the parameters, not the modal", async ({
  page,
}) => {
  await page.goto(`/inventory/${smartObject.id}`);
  await page.getByRole("button", { name: "Show object actions" }).click();

  const dialog = page.getByRole("dialog");
  const tabs = dialog.getByRole("group", { name: "Available actions" });
  const submit = dialog.getByRole("button", { name: /^Run / });

  // "Pick up" takes no parameters, "Transfer" takes one: the tallest thing that
  // may change between them is the parameter area, never the dialog itself.
  const before = {
    dialog: (await dialog.boundingBox())!,
    tabs: await tabs.boundingBox(),
    submitY: (await submit.boundingBox())!.y,
  };
  await expect(dialog.getByLabel(/Destination/)).toBeHidden();

  await dialog.getByRole("button", { name: "Transfer" }).click();
  await expect(dialog.getByLabel(/Destination/)).toBeVisible();

  const after = (await dialog.boundingBox())!;
  expect(after.y).toBe(before.dialog.y);
  expect(await tabs.boundingBox()).toEqual(before.tabs);
  // Only the bottom edge follows the parameters, taking the submit row with it.
  expect(after.height).toBeGreaterThan(before.dialog.height);
  expect((await submit.boundingBox())!.y).toBeGreaterThan(before.submitY);
});

test("detail modals fit and scroll inside a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto(`/inventory/${smartObject.id}`);

  await page.getByRole("button", { name: "More pass options" }).click();
  await page.getByRole("button", { name: "Show details" }).click();

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
  await page.getByRole("button", { name: /Mint membership/ }).click();

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
  const actionsIndicator = page.locator(".object-card-action-indicator");
  await expect(inventory).toHaveClass(/is-grid/);
  await expect(actionsIndicator).toBeVisible();

  await page.getByRole("button", { name: "List" }).click();
  await expect(inventory).toHaveClass(/is-list/);
  await expect(actionsIndicator).toBeVisible();

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

test("an authenticated external face reads attributes and requests a Viewer-owned action", async ({
  page,
}) => {
  await mockExternalBridgeDisplay(page);
  await page.goto(`/inventory/${smartObject.id}`);

  const face = page.frameLocator('iframe[title="Sample Membership"]');
  await expect(face.getByText("Bridge ready", { exact: true })).toBeVisible();
  await expect(face.getByText("Sample Membership (detail)")).toBeVisible();

  await face.getByRole("button", { name: "Read attributes" }).click();
  await expect(face.getByText('"key":"service.status"')).toBeVisible();
  await expect(face.getByText('"value":"active"')).toBeVisible();

  await face.getByRole("button", { name: "Request update action" }).click();
  const actionDialog = page.getByRole("dialog");
  await expect(actionDialog).toBeVisible();
  await expect(
    actionDialog.getByText(
      "The displayed application requested this action. Review every field before you authorize it.",
    ),
  ).toBeVisible();
  await expect(actionDialog.getByLabel("Custom data (JSON)")).toHaveValue(
    '{"bridge_test":true}',
  );

  const executeRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/backend/ebus/execute",
  );
  await actionDialog.getByRole("button", { name: "Run Update" }).click();
  const actionBody = (await executeRequest).postDataJSON();
  expect(actionBody.action.update).toMatchObject({
    id: smartObject.id,
    data: { custom: { bridge_test: true } },
  });
  await expect(face.getByText('"status":"completed"')).toBeVisible();
  await expect(face.getByText('"action_id":"action-e2e-2"')).toBeVisible();

  await face.getByRole("button", { name: "Request update action" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close pass details" })
    .click();
  await expect(face.getByText("user_cancelled:")).toBeVisible();
});

test("activity shows the wallet action timeline", async ({ page }) => {
  await page.goto("/activity");

  await expect(
    page.getByRole("heading", { name: "Activity", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Mint membership", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".activity-item .status", { hasText: "Completed" }),
  ).toBeVisible();
  await expect(page.getByText("0.003 DUAL", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Mint membership/ }).click();
  const details = page.getByRole("dialog");
  await expect(details).toBeVisible();
  await expect(
    details.getByText("0xmessagehash", { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByText("state-change-e2e-1", { exact: true }),
  ).toBeVisible();
  await expect(details.getByText("V2 · Kernel", { exact: true })).toHaveCount(
    2,
  );
  await expect(details.getByText("Account", { exact: true })).toBeVisible();
  await expect(details.getByText("Controller", { exact: true })).toBeVisible();
  await expect(
    details.getByText(viewerWallet.account.address, { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByText(viewerWallet.controller.address, { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByText("personal_sign", { exact: true }),
  ).toBeVisible();
  await expect(details.getByText("0xsignature", { exact: true })).toHaveCount(
    0,
  );
  await details.getByRole("button", { name: "Close activity details" }).click();
  await expect(details).toHaveCount(0);

  const pagination = page.getByRole("navigation", { name: "Activity pages" });
  await expect(
    pagination.getByRole("button", { name: "Previous page" }),
  ).toBeDisabled();
  await pagination.getByRole("button", { name: "Next page" }).click();
  await expect(
    page.getByText("Transfer membership", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Mint membership", { exact: true })).toHaveCount(
    0,
  );
  await pagination.getByRole("button", { name: "Previous page" }).click();
  await expect(
    page.getByText("Mint membership", { exact: true }),
  ).toBeVisible();

  await page.getByLabel("Status").selectOption("failed");
  await expect(
    page.getByText("No activity yet", { exact: true }),
  ).toBeVisible();
  await expect(pagination).toBeVisible();
  await expect(
    pagination.getByRole("button", { name: "Previous page" }),
  ).toBeDisabled();
  await expect(
    pagination.getByRole("button", { name: "Next page" }),
  ).toBeDisabled();
});

test("settings update the profile", async ({ page }) => {
  await page.goto("/settings");

  await page.getByLabel("Display name").fill("Ada Updated");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Your profile has been updated.")).toBeVisible();
  await expect(
    page.getByText("0x12345678…ef12345678", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Smart-account address")).toBeVisible();
  await expect(page.getByText("Controller address")).toBeVisible();
  await expect(page.getByTitle(viewerWallet.controller.address)).toBeVisible();
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
