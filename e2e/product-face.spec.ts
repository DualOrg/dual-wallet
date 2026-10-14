import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Cross-origin product-face suite. Runs the actual wallet against the local
// fake api-v3 (127.0.0.1:4010) and the pinned emitted Studio artifact with a
// labelled fake runtime (localhost:4101). See playwright.product-face.config.ts.

// Contract r6 changed programme.registration.authorize to carry record_id and
// the face's request_hash. A pinned face emitted before r6 still sends the old
// payload, which the wallet now refuses; registration specs need an r6 face.
function pinnedFaceRevision() {
  const root = path.join(__dirname, "fixtures", "product-face");
  for (const app of readdirSync(root)) {
    for (const version of readdirSync(path.join(root, app))) {
      for (const hash of readdirSync(path.join(root, app, version))) {
        const manifest = JSON.parse(
          readFileSync(
            path.join(root, app, version, hash, "manifest.json"),
            "utf8",
          ),
        );
        return Number(manifest.contractRevision ?? 0);
      }
    }
  }
  return 0;
}
const REGISTRATION_READY = pinnedFaceRevision() >= 6;
const NEEDS_R6_FACE =
  "the pinned Studio face predates contract r6 (authorize without record_id/request_hash); re-emit it";

const MOCK_API = "http://127.0.0.1:4010";
const FIXTURE = "http://localhost:4101";
const EMAIL = "face-e2e@example.com";
const PASSWORD = "correct horse battery staple";
const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const UNIT_A = "6a00000000000000000000a1";
const OWNED_A = "6a00000000000000000000c3";
const OWNED_B = "6a00000000000000000000d4";

async function post(url: string, body: unknown = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function object(id: string) {
  return (await fetch(`${MOCK_API}/__test__/objects/${id}`)).json();
}

async function stats() {
  return (await fetch(`${FIXTURE}/__test__/stats`)).json();
}

async function signIn(page: Page, path = "/products/morrow-home") {
  await page.goto(path);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Email address").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

const face = (page: Page) =>
  page.frameLocator('iframe[title="Morrow Home Arc Care product application"]');

async function startRegistration(page: Page, grant = "MH-HANDOVER-A") {
  await face(page).getByRole("button", { name: "Register a product" }).click();
  await face(page).getByLabel("Handover link").fill(grant);
  await face(page).getByRole("button", { name: "Check link" }).click();
  await face(page)
    .getByRole("button", { name: "Register this ARC-G1" })
    .first()
    .click();
  return page.getByRole("dialog", {
    name: "Register this product to your wallet?",
  });
}

test.beforeEach(async () => {
  await post(`${MOCK_API}/__test__/reset`);
  await post(`${FIXTURE}/__test__/reset`);
});

test("registers the exact unit only after the wallet's canonical readback", async ({
  page,
}) => {
  test.skip(!REGISTRATION_READY, NEEDS_R6_FACE);
  await signIn(page);
  await expect(page).toHaveURL(/\/products\/morrow-home$/);
  await expect(
    page.getByRole("heading", { name: "Morrow Home Arc Care" }),
  ).toBeVisible();
  await expect(page.getByText("Published by dual-studio")).toBeVisible();

  const dialog = await startRegistration(page);
  await expect(dialog).toBeVisible();
  // Host facts, not face text: the canonical serial and the user's own wallet.
  await expect(dialog.getByText("MH-ARC-0001")).toBeVisible();
  await expect(dialog.getByText("0x12....678")).toBeVisible();
  await expect(
    dialog.getByText("Requested by dual-studio for Morrow Home Arc Care"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Register product" }).click();

  await expect(
    face(page).locator('[data-registration-status="registered"]'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/products\/morrow-home\/register\/result\//);
  expect((await object(UNIT_A)).owner).toBe(WALLET);
  expect((await stats()).assertions["registration.submit"]).toBe(1);
});

test("cancelling the wallet confirmation submits nothing", async ({ page }) => {
  test.skip(!REGISTRATION_READY, NEEDS_R6_FACE);
  await signIn(page);
  const dialog = await startRegistration(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(face(page).getByRole("alert")).toContainText(
    "Nothing was registered. You can choose a product again.",
  );
  expect((await object(UNIT_A)).owner).not.toBe(WALLET);
  expect((await stats()).assertions["registration.submit"]).toBeUndefined();
});

test("a reload mid-operation reconciles to outcome_unknown without a second mint", async ({
  page,
}) => {
  test.skip(!REGISTRATION_READY, NEEDS_R6_FACE);
  await post(`${FIXTURE}/__test__/mode`, { holdRegistrations: true });
  await signIn(page);
  const dialog = await startRegistration(page);
  await dialog.getByRole("button", { name: "Register product" }).click();
  await expect(page).toHaveURL(/\/register\/result\/reg-/);
  await expect.poll(async () => (await stats()).registrations).toBe(1);

  await page.reload();
  await expect(
    face(page).locator('[data-registration-status="outcome_unknown"]'),
  ).toBeVisible();
  const after = await stats();
  expect(after.assertions["registration.submit"]).toBe(1);
  expect(after.registrations).toBe(1);
  expect((await object(UNIT_A)).owner).not.toBe(WALLET);
});

test("Transfer pending is not registered until the holder settles it", async ({
  page,
}) => {
  test.skip(!REGISTRATION_READY, NEEDS_R6_FACE);
  await post(`${FIXTURE}/__test__/mode`, { transferState: "Transfer pending" });
  await signIn(page);
  const dialog = await startRegistration(page);
  await dialog.getByRole("button", { name: "Register product" }).click();

  const pending = face(page).locator(
    '[data-registration-status="ownership_moved_state_pending"]',
  );
  await expect(pending).toBeVisible();
  expect((await object(UNIT_A)).custom.state).toBe("Transfer pending");

  // G6: the host reads the proposal itself and shows the decoded change.
  await face(page)
    .getByRole("button", { name: "Confirm on your wallet" })
    .click();
  const settle = page.getByRole("dialog", {
    name: "Confirm your product registration",
  });
  await expect(settle.getByRole("table")).toContainText("Transfer pending");
  await expect(settle.getByRole("table")).toContainText(
    "Authenticity verified",
  );
  await settle.getByRole("button", { name: "Sign and confirm" }).click();

  await expect(
    face(page).locator('[data-registration-status="registered"]'),
  ).toBeVisible();
  expect((await object(UNIT_A)).custom.state).toBe("Authenticity verified");
});

test("forged messages from outside the bound channel are ignored", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    face(page).getByRole("heading", { name: "Arc Care" }),
  ).toBeVisible();
  const bffCalls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/faces/")) {
      bffCalls.push(request.url());
    }
  });
  const frame = page
    .frames()
    .find((candidate) =>
      candidate.url().startsWith("http://localhost:4101/face/"),
    );
  await frame!.evaluate(() => {
    window.parent.postMessage(
      {
        type: "dual.face.request",
        protocol: "dual.face.bridge",
        version: 1,
        request_id: "forged-1",
        operation: "programme.registration.authorize",
        payload: {
          object_id: "6a00000000000000000000b2",
          operation_id: "forged-op-0001",
        },
      },
      "*",
    );
  });
  await page.evaluate(() =>
    window.postMessage(
      {
        type: "dual.face.request",
        protocol: "dual.face.bridge",
        version: 1,
        request_id: "forged-2",
        operation: "programme.runtime.authorize",
        payload: {},
      },
      "*",
    ),
  );
  await page.waitForTimeout(1_000);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(bffCalls).toEqual([]);
});

test("signing out tears down the face", async ({ page }) => {
  await signIn(page);
  await expect(
    face(page).getByRole("heading", { name: "Arc Care" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.goto("/products/morrow-home");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("a task link survives sign-in and Back/Forward between two products", async ({
  page,
}) => {
  await signIn(page, "/products/morrow-home/products");
  await expect(page).toHaveURL("/products/morrow-home/products");
  const list = face(page).locator(".pf-products");
  await expect(list.getByText("MH-ARC-0101")).toBeVisible();
  await expect(list.getByText("MH-ARC-0102")).toBeVisible();
  // The second brand's kettle is never part of this programme.
  await expect(list.getByText("TW-K-0001")).toHaveCount(0);

  await list
    .locator("li", { hasText: "MH-ARC-0101" })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(page).toHaveURL(`/products/morrow-home/products/${OWNED_A}`);
  await expect(face(page).locator(".pf-facts").first()).toContainText(
    "MH-ARC-0101",
  );

  await face(page).getByLabel("Product", { exact: true }).selectOption(OWNED_B);
  await expect(page).toHaveURL(`/products/morrow-home/products/${OWNED_B}`);
  await expect(face(page).locator(".pf-facts").first()).toContainText(
    "MH-ARC-0102",
  );

  await page.goBack();
  await expect(page).toHaveURL(`/products/morrow-home/products/${OWNED_A}`);
  await expect(face(page).locator(".pf-facts").first()).toContainText(
    "MH-ARC-0101",
  );

  await page.reload();
  await expect(face(page).locator(".pf-facts").first()).toContainText(
    "MH-ARC-0101",
  );
});

// ---------------------------------------------------------------------------
// Contract r8/r11 durable reservation and per-launch journals, in a real
// browser. The fake api-v3 records every holder action; the labelled fake
// runtime implements registration.settle.reserve (dispatch won/already_claimed
// atomically), settle.status and pending.read.

async function holderUpdates(objectId: string) {
  const { action_logs: logs } = (await (
    await fetch(`${MOCK_API}/__test__/action-logs?object_id=${objectId}`)
  ).json()) as { action_logs: Array<{ name: string; account: string }> };
  return logs.filter(
    (log) => log.name === "update" && log.account.toLowerCase() === WALLET,
  ).length;
}

/** Registers unit A into Transfer pending (ownership moved, state not yet). */
async function registerPending(page: Page) {
  await post(`${FIXTURE}/__test__/mode`, { transferState: "Transfer pending" });
  await signIn(page);
  const dialog = await startRegistration(page);
  await dialog.getByRole("button", { name: "Register product" }).click();
  await expect(
    face(page).locator(
      '[data-registration-status="ownership_moved_state_pending"]',
    ),
  ).toBeVisible();
}

const settleDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Confirm your product registration" });

test("every cookie stays within browser limits and is stored: a 35-leaf proposal and two concurrent launches", async ({
  page,
  context,
}) => {
  test.skip(!REGISTRATION_READY, NEEDS_R6_FACE);
  await registerPending(page);
  // A second launch of the same face, concurrently, in another tab.
  const second = await context.newPage();
  await second.goto(`/products/morrow-home/products/${OWNED_A}`);
  await expect(face(second).locator(".pf-facts").first()).toContainText(
    "MH-ARC-0101",
  );
  await face(page)
    .getByRole("button", { name: "Confirm on your wallet" })
    .click();
  await expect(settleDialog(page)).toBeVisible();
  expect((await stats()).proposalLeaves).toEqual([35]);

  const check = async () => {
    const cookies = await context.cookies();
    for (const cookie of cookies) {
      expect(
        cookie.name.length + cookie.value.length,
        cookie.name,
      ).toBeLessThanOrEqual(4096);
    }
    const launches = cookies.filter((cookie) =>
      cookie.name.startsWith("dual_face_launch_"),
    );
    // Both launches' journals were actually stored, side by side.
    expect(launches).toHaveLength(2);
    expect(cookies.some((cookie) => cookie.name === "smarttoken_viewer")).toBe(
      true,
    );
    return launches.map((cookie) => cookie.name.length + cookie.value.length);
  };
  const beforeSettle = await check();
  await settleDialog(page)
    .getByRole("button", { name: "Sign and confirm" })
    .click();
  await expect(
    face(page).locator('[data-registration-status="registered"]'),
  ).toBeVisible();
  const afterSettle = await check();
  test.info().annotations.push({
    type: "cookie sizes (name+value bytes)",
    description: JSON.stringify({ beforeSettle, afterSettle }),
  });
  expect(await holderUpdates(UNIT_A)).toBe(1);
});

test("two tabs, the same original operation and the SAME settle operation, concurrently: exactly one holder execution", async ({
  page,
  context,
}) => {
  test.skip(!REGISTRATION_READY, NEEDS_R6_FACE);
  await registerPending(page);
  // From here every face frame draws the same "random" ids, so both tabs
  // resume the same original registration with the same settle operation id.
  await context.addInitScript(() => {
    if (location.origin !== "http://localhost:4101") return;
    let seed = 0x2f6b9e1;
    crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T) => {
      const bytes = new Uint8Array(array!.buffer);
      for (let index = 0; index < bytes.length; index += 1) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        bytes[index] = seed & 0xff;
      }
      return array;
    }) as Crypto["getRandomValues"];
  });
  const tabs = [await context.newPage(), await context.newPage()];
  for (const tab of tabs) {
    await tab.goto(`/products/morrow-home/products/${UNIT_A}`);
    await face(tab)
      .getByRole("button", { name: "Finish registration" })
      .click();
    await expect(settleDialog(tab)).toBeVisible();
  }
  await Promise.all(
    tabs.map((tab) =>
      settleDialog(tab)
        .getByRole("button", { name: "Sign and confirm" })
        .click(),
    ),
  );
  await expect
    .poll(async () => {
      const { reserve } = await stats();
      return reserve.won + reserve.already_claimed + reserve.already_reserved;
    })
    .toBe(2);
  const { reserve } = await stats();
  // The same settle operation id: one won, the other already_claimed.
  expect(reserve).toMatchObject({
    won: 1,
    already_claimed: 1,
    already_reserved: 0,
  });
  await expect.poll(() => holderUpdates(UNIT_A)).toBe(1);
  // The tab that did not win executed nothing and reconciles read-only.
  for (const tab of tabs) {
    await expect(
      face(tab).locator(
        '[data-registration-status="registered"], [data-registration-status="outcome_unknown"]',
      ),
    ).toBeVisible();
  }
  expect(await holderUpdates(UNIT_A)).toBe(1);
  expect((await object(UNIT_A)).custom.state).toBe("Authenticity verified");
});

test("a lost reserve response executes nothing; the status stays unknown and is never reclaimed", async ({
  page,
}) => {
  test.skip(!REGISTRATION_READY, NEEDS_R6_FACE);
  await registerPending(page);
  await post(`${FIXTURE}/__test__/mode`, { loseReserveResponses: 1 });
  await face(page)
    .getByRole("button", { name: "Confirm on your wallet" })
    .click();
  await settleDialog(page)
    .getByRole("button", { name: "Sign and confirm" })
    .click();
  await expect(
    face(page).locator('[data-registration-status="outcome_unknown"]'),
  ).toBeVisible();
  await face(page).getByRole("button", { name: "Check status" }).click();
  await expect(
    face(page).locator('[data-registration-status="outcome_unknown"]'),
  ).toBeVisible();
  const { reserve } = await stats();
  expect(reserve).toMatchObject({ won: 0, lost: 1, already_claimed: 0 });
  expect(await holderUpdates(UNIT_A)).toBe(0);
  expect((await object(UNIT_A)).custom.state).toBe("Transfer pending");
});

test("a lost response after execute reconciles read-only, with no re-execution", async ({
  page,
}) => {
  test.skip(!REGISTRATION_READY, NEEDS_R6_FACE);
  await registerPending(page);
  await post(`${MOCK_API}/__test__/mode`, { loseExecuteResponses: 1 });
  await face(page)
    .getByRole("button", { name: "Confirm on your wallet" })
    .click();
  await settleDialog(page)
    .getByRole("button", { name: "Sign and confirm" })
    .click();
  await expect(
    face(page).locator('[data-registration-status="outcome_unknown"]'),
  ).toBeVisible();
  // The action ran; only its answer was lost.
  expect(await holderUpdates(UNIT_A)).toBe(1);
  // registration.settle.status finds it in the fake Dual's action logs.
  await face(page).getByRole("button", { name: "Check status" }).click();
  await expect(
    face(page).locator('[data-registration-status="registered"]'),
  ).toBeVisible();
  const after = await stats();
  expect(after.reserve).toMatchObject({ won: 1, already_claimed: 0, lost: 0 });
  expect(after.assertions["registration.settle.reserve"]).toBe(1);
  expect(after.assertions["registration.settle.status"]).toBe(1);
  expect(await holderUpdates(UNIT_A)).toBe(1);
});

test("a fresh sign-in recovers the original operation's status read-only and never executes", async ({
  page,
}) => {
  test.skip(!REGISTRATION_READY, NEEDS_R6_FACE);
  await registerPending(page);
  // The reserve answer is lost: the runtime holds the claim, nobody executes.
  await post(`${FIXTURE}/__test__/mode`, { loseReserveResponses: 1 });
  await face(page)
    .getByRole("button", { name: "Confirm on your wallet" })
    .click();
  await settleDialog(page)
    .getByRole("button", { name: "Sign and confirm" })
    .click();
  await expect(
    face(page).locator('[data-registration-status="outcome_unknown"]'),
  ).toBeVisible();

  // A fresh sign-in has no journal: the face finds the ORIGINAL registration
  // through registration.pending.read and checks it through settle.status.
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, `/products/morrow-home/products/${UNIT_A}`);
  await expect(
    face(page).getByText(
      "We are checking your registration. Please do not start it again.",
    ),
  ).toBeVisible();
  await face(page)
    .getByRole("button", { name: "Check registration status" })
    .click();
  await expect(
    face(page).locator('[data-registration-status="outcome_unknown"]'),
  ).toBeVisible();
  const after = await stats();
  // Read-only: no new reservation, nothing executed, the outcome stays unknown.
  expect(after.reserve).toMatchObject({ won: 0, lost: 1, already_claimed: 0 });
  expect(after.assertions["registration.settle.reserve"]).toBe(1);
  expect(after.assertions["registration.pending.read"]).toBeGreaterThanOrEqual(
    1,
  );
  expect(after.assertions["registration.settle.status"]).toBeGreaterThanOrEqual(
    1,
  );
  expect(await holderUpdates(UNIT_A)).toBe(0);
  expect((await object(UNIT_A)).custom.state).toBe("Transfer pending");
});
