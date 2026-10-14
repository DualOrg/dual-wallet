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
// The mock API's second fictional account (e2e/mock-api.mjs SECOND_ACCOUNT).
const SECOND_EMAIL = "face-e2e-b@example.com";
const SECOND_PASSWORD = "another correct horse battery";
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

test("on a phone the host is one slim row and the frame takes the remaining height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/products/morrow-home/products");
  await expect(page).toHaveURL("/products/morrow-home/products");
  const list = face(page).locator(".pf-products");
  await expect(list.getByText("MH-ARC-0101")).toBeVisible();

  const identity = page.locator(".product-face-identity");
  const frame = page.locator("iframe.product-face-frame");
  const measure = async () => {
    const chrome = (await page.locator(".mobile-topbar").boundingBox())!;
    const row = (await identity.boundingBox())!;
    const box = (await frame.boundingBox())!;
    const viewport = page.viewportSize()!;
    return {
      chromeBottom: chrome.y + chrome.height,
      rowHeight: row.height,
      frameTop: box.y,
      belowChrome: box.y - (chrome.y + chrome.height),
      frameBottomGap: viewport.height - (box.y + box.height),
      overflowX: await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    };
  };

  const phone = await measure();
  test.info().annotations.push({
    type: "measured 390x844",
    description: JSON.stringify(phone),
  });
  // The frame starts within the first ~120px below the wallet bar (one slim
  // identity row) and runs to the bottom of the viewport.
  expect(phone.belowChrome).toBeLessThanOrEqual(120);
  expect(phone.rowHeight).toBeLessThanOrEqual(60);
  expect(Math.abs(phone.frameBottomGap)).toBeLessThanOrEqual(1);
  expect(phone.overflowX).toBe(0);

  // The application identity stays visible; the publisher is one tap away.
  await expect(
    page.getByRole("heading", { level: 1, name: "Morrow Home Arc Care" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to products" }),
  ).toBeVisible();
  const publisher = page.getByText("Published by dual-studio");
  const about = page.getByRole("button", {
    name: "About Morrow Home Arc Care",
  });
  await expect(publisher).toBeHidden();
  await about.click();
  await expect(about).toHaveAttribute("aria-expanded", "true");
  await expect(publisher).toBeVisible();
  await about.press("Escape");
  await expect(publisher).toBeHidden();

  await page.setViewportSize({ width: 320, height: 640 });
  const narrow = await measure();
  test.info().annotations.push({
    type: "measured 320x640",
    description: JSON.stringify(narrow),
  });
  expect(narrow.overflowX).toBe(0);
  expect(narrow.rowHeight).toBeLessThanOrEqual(60);
  expect(narrow.belowChrome).toBeLessThanOrEqual(120);
  await expect(
    page.getByRole("heading", { level: 1, name: "Morrow Home Arc Care" }),
  ).toBeVisible();

  // Deep task URLs and Back/Forward still work in the compact host.
  await page.setViewportSize({ width: 390, height: 844 });
  await list
    .locator("li", { hasText: "MH-ARC-0101" })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(page).toHaveURL(`/products/morrow-home/products/${OWNED_A}`);
  await page.goBack();
  await expect(page).toHaveURL("/products/morrow-home/products");
  await page.goForward();
  await expect(page).toHaveURL(`/products/morrow-home/products/${OWNED_A}`);
  await expect(face(page).locator(".pf-facts").first()).toContainText(
    "MH-ARC-0101",
  );
  expect((await measure()).overflowX).toBe(0);
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
  // The race this test is about is at the reserve: without a barrier the
  // first tab could reserve, execute and settle the unit before the second
  // tab's request is checked (it is then refused settle_not_required before
  // any reserve, which proves nothing about the reserve). The fake runtime
  // holds every reserve ANSWER until both reserve requests have arrived (the
  // first arrival still wins atomically), so neither tab can execute before
  // both requests reached the reserve. A request that never arrives is
  // released after 6 s and shows as released: "deadline".
  await post(`${FIXTURE}/__test__/mode`, { reserveBarrier: 2 });
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
  const { reserve, reserveBarrier } = await stats();
  // Both requests reached the reserve while the winner's answer was held.
  expect(reserveBarrier).toEqual({ arrivals: 2, released: "all_arrived" });
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

// ---------------------------------------------------------------------------
// contract r14 faceEnabledHandover: a face-enabled handover link opens the
// wallet face on the register task, through sign-in, with no grant pasting.
// The labelled fake runtime serves the handover page, /handover and
// /handover/redeem; the host hands the one-time ticket to the face in its
// initialize context, recorded here from the host page's MessagePort.

const HANDOVER_LINK = `${FIXTURE}/face/handover/studio.morrow-home#access=MH-HANDOVER-A`;
const HANDOVER_COOKIE = "dual_face_handover";

async function recordInitializeContexts(page: Page) {
  await page.addInitScript(() => {
    const original = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (
      this: MessagePort,
      message: unknown,
      ...rest: unknown[]
    ) {
      const data = message as {
        type?: string;
        context?: { handover?: unknown };
      };
      if (data?.type === "dual.face.initialize") {
        const record = window as unknown as { __faceHandovers?: unknown[] };
        (record.__faceHandovers ||= []).push(data.context?.handover ?? null);
      }
      return (original as (...args: unknown[]) => void).call(
        this,
        message,
        ...rest,
      );
    } as typeof MessagePort.prototype.postMessage;
  });
}

const handedOver = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __faceHandovers?: unknown[] }).__faceHandovers ??
      [],
  );

async function handoverCookie(page: Page) {
  return (await page.context().cookies("http://demo.localhost:3000")).find(
    (cookie) => cookie.name === HANDOVER_COOKIE,
  );
}

/** Redeems a ticket from inside the face frame, as the face does (r14 step 5). */
async function redeemFromFace(page: Page, ticket: string) {
  const frame = page
    .frames()
    .find((candidate) => candidate.url().startsWith(FIXTURE));
  if (!frame) throw new Error("face frame not found");
  return frame.evaluate(async (value) => {
    const response = await fetch("/api/product-face/v1/handover/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: value }),
    });
    return { status: response.status, body: await response.json() };
  }, ticket);
}

test("a face-enabled handover link opens the register task through sign-in and hands the ticket to the face once", async ({
  page,
}) => {
  await recordInitializeContexts(page);
  await page.goto(HANDOVER_LINK);
  // Signed out: through sign-in, returning to the register task. No ticket
  // in any URL.
  await expect(page).toHaveURL(
    `/login?next=${encodeURIComponent("/products/morrow-home/register")}`,
  );
  expect(page.url()).not.toContain("ticket");
  const cookie = await handoverCookie(page);
  expect(cookie).toMatchObject({
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    domain: "demo.localhost",
  });
  expect(cookie!.value.length + cookie!.name.length).toBeLessThan(4096);
  expect(cookie!.expires * 1000 - Date.now()).toBeLessThanOrEqual(600_000);

  // The script navigation commits before the sign-in form has hydrated;
  // input typed earlier would be reset by hydration.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email address").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // The face (contract r14 client) redeems the handed-over ticket itself, once,
  // and goes straight to choosing the unit its evidence covers.
  await expect(
    face(page).getByRole("heading", { name: "Choose the product" }),
  ).toBeVisible();
  await expect(page).toHaveURL("/products/morrow-home/register/choose");
  await expect(face(page).getByText("MH-ARC-0001")).toBeVisible();

  // The host handed exactly one ticket to the face, and the cookie is gone.
  const handovers = (await handedOver(page)) as Array<{
    ticket: string;
  } | null>;
  expect(handovers).toHaveLength(1);
  const ticket = handovers[0]!.ticket;
  expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(await handoverCookie(page)).toBeUndefined();

  // It was redeemed once at the runtime; a second redemption is refused.
  expect((await redeemFromFace(page, ticket)).body).toMatchObject({
    reason: "face_handover_ticket_used",
  });

  // A reload hands nothing over again (the face falls back to the paste form).
  await page.reload();
  await expect(
    face(page).getByRole("button", { name: "Check link" }),
  ).toBeVisible();
  expect(await handedOver(page)).toEqual([null]);
  expect((await stats()).handover).toEqual({
    issued: 1,
    redeemed: 1,
    refused: 1,
  });

  // The handover entry is not in the history.
  await page.goBack();
  expect(page.url()).not.toContain("/handover");
});

test("a signed-in arrival goes straight to the register task", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    face(page).getByRole("heading", { name: "Arc Care" }),
  ).toBeVisible();
  await recordInitializeContexts(page);
  await page.goto(HANDOVER_LINK);
  // The face redeems the ticket itself and opens the unit choice.
  await expect(
    face(page).getByRole("heading", { name: "Choose the product" }),
  ).toBeVisible();
  await expect(page).toHaveURL("/products/morrow-home/register/choose");
  const handovers = (await handedOver(page)) as Array<{
    ticket: string;
  } | null>;
  expect(handovers).toHaveLength(1);
  expect(handovers[0]?.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(await handoverCookie(page)).toBeUndefined();
});

test("a wrong slug refuses, strips the fragment and stores nothing", async ({
  page,
}) => {
  await page.goto(`/products/unknown-brand/handover#ticket=${"z".repeat(43)}`);
  await expect(
    page.getByText("This registration link can't be opened in this wallet."),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(await handoverCookie(page)).toBeUndefined();
  // A malformed ticket for a real programme is refused the same way.
  await page.goto("/products/morrow-home/handover#ticket=short");
  await expect(
    page.getByText(
      "This registration link is incomplete. Open it again from the message you received.",
    ),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(await handoverCookie(page)).toBeUndefined();
});

test("signing out clears a pending handover", async ({ page }) => {
  await signIn(page, "/inventory");
  await expect(page).toHaveURL("/inventory");
  // A pending handover, as the entry stores it.
  const stored = await page.evaluate(async (ticket) => {
    const response = await fetch("/api/faces/morrow-home/handover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket }),
    });
    return response.status;
  }, "p".repeat(43));
  expect(stored).toBe(200);
  expect(await handoverCookie(page)).toBeDefined();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await handoverCookie(page)).toBeUndefined();
});

// contract r14 account isolation, enforced by the server: a pending ticket is
// sealed with the session that may take it, so the client's best-effort
// account-change deletion is never what keeps it from another account.

/** Stores a pending handover from the page, as the handover entry does. */
const storeHandover = (page: Page, ticket: string) =>
  page.evaluate(async (value) => {
    const response = await fetch("/api/faces/morrow-home/handover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: value }),
    });
    return response.status;
  }, ticket);

/** Signs in as the second account through the wallet's own sign-in route. */
const signInAsSecond = (page: Page) =>
  page.evaluate(
    async ([email, password]) => {
      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      return response.status;
    },
    [SECOND_EMAIL, SECOND_PASSWORD],
  );

test("an account switch never hands A's pending ticket to B, even when the client's deletion is lost", async ({
  page,
  context,
}) => {
  await signIn(page, "/inventory");
  await expect(page).toHaveURL("/inventory");
  // The client's account-change deletion never reaches the server.
  await context.route("**/api/session/face-handover", (route) => route.abort());
  expect(await storeHandover(page, "a".repeat(43))).toBe(200);
  const boundToA = await handoverCookie(page);
  expect(boundToA).toBeDefined();
  // B signs in in the same browser: the sign-in response clears A's ticket.
  expect(await signInAsSecond(page)).toBe(200);
  expect(await handoverCookie(page)).toBeUndefined();
  // Even if A's sealed cookie came back, B's context read refuses and clears it.
  await context.addCookies([boundToA!]);
  await recordInitializeContexts(page);
  await page.goto("/products/morrow-home/register");
  await expect(
    face(page).getByRole("button", { name: "Check link" }),
  ).toBeVisible();
  expect(await handedOver(page)).toEqual([null]);
  expect(await handoverCookie(page)).toBeUndefined();
  expect(
    (await stats()).handover,
    "nothing was issued or redeemed",
  ).toMatchObject({ redeemed: 0 });
});

test("two tabs: B signing in in one tab leaves A's pending ticket to nobody", async ({
  page,
  context,
}) => {
  await signIn(page, "/inventory");
  await expect(page).toHaveURL("/inventory");
  expect(await storeHandover(page, "b".repeat(43))).toBe(200);
  // A second tab of the same browser signs in as B.
  const other = await context.newPage();
  await other.goto("/inventory");
  expect(await signInAsSecond(other)).toBe(200);
  // The first tab now opens the register task: nothing is handed over.
  await recordInitializeContexts(page);
  await page.goto("/products/morrow-home/register");
  await expect(
    face(page).getByRole("button", { name: "Check link" }),
  ).toBeVisible();
  expect(await handedOver(page)).toEqual([null]);
  expect(await handoverCookie(page)).toBeUndefined();
  await other.close();
});

test("anonymous arrival, A signs in, then B signs in before any context read: B is denied and the cookie cleared", async ({
  page,
  context,
}) => {
  // The client's account-change deletion never reaches the server.
  await context.route("**/api/session/face-handover", (route) => route.abort());
  const contextReads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/faces/morrow-home/context")) {
      contextReads.push(request.url());
    }
  });
  // Signed out: the handover entry stores an anonymous ticket and sends the
  // visitor to sign in.
  await page.goto(HANDOVER_LINK);
  await expect(page).toHaveURL(
    `/login?next=${encodeURIComponent("/products/morrow-home/register")}`,
  );
  expect(await handoverCookie(page)).toBeDefined();
  // A signs in, then B signs in, back to back from the page: no navigation and
  // no context read happens in between.
  const statuses = await page.evaluate(
    async (accounts) => {
      const results: number[] = [];
      for (const [email, password] of accounts) {
        const response = await fetch("/api/session/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        results.push(response.status);
      }
      return results;
    },
    [
      [EMAIL, PASSWORD],
      [SECOND_EMAIL, SECOND_PASSWORD],
    ],
  );
  expect(statuses).toEqual([200, 200]);
  expect(contextReads).toEqual([]);
  // B's sign-in response cleared A's (now bound) ticket.
  expect(await handoverCookie(page)).toBeUndefined();
  await recordInitializeContexts(page);
  await page.goto("/products/morrow-home/register");
  await expect(
    face(page).getByRole("button", { name: "Check link" }),
  ).toBeVisible();
  expect(await handedOver(page)).toEqual([null]);
  expect(await handoverCookie(page)).toBeUndefined();
  expect((await stats()).handover).toMatchObject({ issued: 1, redeemed: 0 });
});

// ------------------------------------------------------------------ G8
// contract r16 protectedTransfer through the actual wallet: the holder (A)
// creates a one-time link in the face; the recipient (B) opens it signed out,
// is taken through sign-in to the face's accept task and accepts in their own
// wallet; A's wallet then signs both reviewed steps natively, naming B's
// wallet, and executes each only on its own won reservation.

const SECOND_WALLET = "0x00000000000000000000000000000000000000b2";

async function actionLogs(objectId: string) {
  const { action_logs: logs } = (await (
    await fetch(`${MOCK_API}/__test__/action-logs?object_id=${objectId}`)
  ).json()) as { action_logs: Array<{ name: string; account: string }> };
  return logs;
}

/** A's face on the transfer task of OWNED_B, with a fresh transfer link. */
async function offerFromA(page: Page) {
  await signIn(page, `/products/morrow-home/products/${OWNED_B}/transfer`);
  await expect(page).toHaveURL(
    `/products/morrow-home/products/${OWNED_B}/transfer`,
  );
  await face(page).getByRole("button", { name: "Transfer to someone" }).click();
  const create = page.getByRole("dialog", { name: "Confirm this request" });
  await expect(
    create.getByText("Create a one-time transfer link for this product"),
  ).toBeVisible();
  await create.getByRole("button", { name: "Confirm" }).click();
  const link = face(page).locator("#pf-transfer-link");
  await expect(link).toBeVisible();
  const value = await link.inputValue();
  expect(value).toMatch(
    /^http:\/\/localhost:4101\/face\/accept\/studio\.morrow-home#offer=[A-Za-z0-9_-]{43}$/,
  );
  return value;
}

test("G8: A transfers to B through a one-time link; B accepts through sign-in; A's wallet signs both steps naming B, once each", async ({
  page,
  browser,
}) => {
  const link = await offerFromA(page);

  // B opens the link signed out: the runtime page, the wallet entry, sign-in.
  const recipient = await browser.newContext();
  const pageB = await recipient.newPage();
  await pageB.goto(link);
  await expect(pageB).toHaveURL(
    `/login?next=${encodeURIComponent("/products/morrow-home/accept")}`,
  );
  expect(pageB.url()).not.toContain("offer=");
  expect(pageB.url()).not.toContain("accept=");
  await pageB.waitForLoadState("networkidle");
  await pageB.getByLabel("Email address").fill(SECOND_EMAIL);
  await pageB.getByLabel("Password", { exact: true }).fill(SECOND_PASSWORD);
  await pageB.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(pageB).toHaveURL("/products/morrow-home/accept");
  // The face redeemed the wallet's acceptance ticket and previews the unit.
  await expect(face(pageB).getByText("MH-ARC-0102")).toBeVisible();
  await face(pageB)
    .getByRole("button", { name: "Accept into this wallet" })
    .click();
  const acceptDialog = pageB.getByRole("dialog", {
    name: "Accept this product into your wallet?",
  });
  // Proposed r19: B's own confirmation names the product B's wallet read
  // itself (the runtime's transfer.acceptance.read, then Dual's public
  // projection): its name, serial and model, and B's own wallet. Nothing
  // about the previous owner (A): not A's address, in full or shortened.
  // The name, and the programme's title field with the same text.
  await expect(acceptDialog.getByText("Morrow Arc grinder")).toHaveCount(2);
  await expect(acceptDialog.getByText("MH-ARC-0102")).toBeVisible();
  await expect(acceptDialog.getByText("ARC-G1")).toBeVisible();
  await expect(acceptDialog.getByText("0x00....0b2")).toBeVisible();
  const acceptText = ((await acceptDialog.textContent()) ?? "").toLowerCase();
  expect(acceptText).not.toContain(WALLET.toLowerCase());
  expect(acceptText).not.toContain("0x12....678");
  expect(acceptText).not.toContain("warranty for");
  await acceptDialog.getByRole("button", { name: "Accept" }).click();
  await expect(
    face(pageB).getByText(
      "Accepted. Waiting for the sender to confirm the transfer on their wallet.",
    ),
  ).toBeVisible();
  expect((await stats()).transfer).toMatchObject({
    acceptIssued: 1,
    acceptRedeemed: 1,
    acceptanceRead: 1,
    acceptUnitRefused: 0,
    accepted: 1,
  });

  // A signs step 1 natively: the product, that ownership moves, B's wallet.
  await face(page).getByRole("button", { name: "Refresh" }).click();
  await face(page)
    .getByRole("button", { name: "Confirm transfer on your wallet" })
    .click();
  const step1 = page.getByRole("dialog", {
    name: "Start transferring this product?",
  });
  await expect(step1.getByText("Morrow Arc grinder")).toBeVisible();
  await expect(step1.getByText("0x00....0b2")).toBeVisible();
  await step1.getByRole("button", { name: "Sign transfer request" }).click();
  await face(page)
    .getByRole("button", { name: "Confirm step 2 on your wallet" })
    .click();
  const step2 = page.getByRole("dialog", {
    name: "Move ownership of this product?",
  });
  await expect(step2.getByText("0x00....0b2")).toBeVisible();
  await step2.getByRole("button", { name: "Sign and move ownership" }).click();
  await expect(
    face(page).getByText(
      "Transferred. The product now belongs to the recipient's wallet.",
      { exact: false },
    ),
  ).toBeVisible();

  // Exactly one holder-signed update and one transfer; B owns it now.
  expect((await object(OWNED_B)).owner).toBe(SECOND_WALLET);
  const signed = (await actionLogs(OWNED_B)).filter(
    (log) => log.account.toLowerCase() === WALLET.toLowerCase(),
  );
  expect(signed.map((log) => log.name).sort()).toEqual(["transfer", "update"]);
  expect((await stats()).transfer).toMatchObject({
    won: 2,
    committed: 2,
    already_claimed: 0,
    refused: 0,
  });

  // B follows the progress to the end.
  await face(pageB).getByRole("button", { name: "Check progress" }).click();
  await expect(
    face(pageB).getByRole("button", { name: "Open the product" }),
  ).toBeVisible();
  await recipient.close();
});

test("G8 (proposed r19): a face naming another unit than the acceptance's is refused by B's wallet; nothing is confirmed, minted or accepted", async ({
  page,
  browser,
}) => {
  const link = await offerFromA(page);
  // The face's preview names another unit (a tampered or stale preview), so
  // the face asks B's wallet to accept that unit.
  await post(`${FIXTURE}/__test__/mode`, { offerReadUnit: OWNED_A });

  const recipient = await browser.newContext();
  const pageB = await recipient.newPage();
  await pageB.goto(link);
  await expect(pageB).toHaveURL(
    `/login?next=${encodeURIComponent("/products/morrow-home/accept")}`,
  );
  await pageB.waitForLoadState("networkidle");
  await pageB.getByLabel("Email address").fill(SECOND_EMAIL);
  await pageB.getByLabel("Password", { exact: true }).fill(SECOND_PASSWORD);
  await pageB.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(pageB).toHaveURL("/products/morrow-home/accept");
  await face(pageB)
    .getByRole("button", { name: "Accept into this wallet" })
    .click();
  // B's wallet read the acceptance's own unit (OWNED_B) and refuses the face's
  // other unit before any confirmation or assertion.
  await expect(
    face(pageB).getByText(
      "Your wallet accepts only the transfer it opened from the sender's link. Open that link again. Nothing was changed.",
    ),
  ).toBeVisible();
  await expect(
    pageB.getByRole("dialog", {
      name: "Accept this product into your wallet?",
    }),
  ).toHaveCount(0);
  const stat = await stats();
  expect(stat.transfer).toMatchObject({
    acceptIssued: 1,
    acceptRedeemed: 1,
    acceptanceRead: 1,
    accepted: 0,
    acceptUnitRefused: 0,
  });
  expect(stat.assertions["transfer.accept"]).toBeUndefined();
  expect(stat.offers.at(-1)).toMatchObject({ state: "offered" });
  expect((await object(OWNED_B)).owner).toBe(WALLET);
  await recipient.close();
});

test("G8 cancel race: a cancel from another tab wins while A's wallet confirmation is open; nothing is signed or executed", async ({
  page,
  context,
}) => {
  await offerFromA(page);
  expect(
    await post(`${FIXTURE}/__test__/accept-offer`, {
      object_id: OWNED_B,
      recipient: SECOND_WALLET,
    }),
  ).toMatchObject({ ok: true });
  await face(page).getByRole("button", { name: "Refresh" }).click();
  await face(page)
    .getByRole("button", { name: "Confirm transfer on your wallet" })
    .click();
  const step1 = page.getByRole("dialog", {
    name: "Start transferring this product?",
  });
  await expect(step1.getByText("0x00....0b2")).toBeVisible();

  // Meanwhile a second tab of the same wallet cancels the transfer.
  const other = await context.newPage();
  await other.goto(`/products/morrow-home/products/${OWNED_B}/transfer`);
  await face(other).getByRole("button", { name: "Cancel transfer" }).click();
  await other
    .getByRole("dialog", { name: "Confirm this request" })
    .getByRole("button", { name: "Confirm" })
    .click();
  await expect(
    face(other).getByText("The transfer is cancelled.", { exact: false }),
  ).toBeVisible();

  // The first tab's confirmation now meets the cancelled offer.
  await step1.getByRole("button", { name: "Sign transfer request" }).click();
  await expect(
    face(page).getByText(
      "This transfer was cancelled or expired before your wallet signed it. Nothing was sent.",
    ),
  ).toBeVisible();
  expect(
    (await actionLogs(OWNED_B)).filter(
      (log) => log.account.toLowerCase() === WALLET.toLowerCase(),
    ),
  ).toEqual([]);
  expect((await object(OWNED_B)).owner).toBe(WALLET);
  expect((await stats()).transfer).toMatchObject({ won: 0, refused: 1 });
  await other.close();
});

test("G8 cancel race inside the reserve window: the cancel wins the runtime's offer decision; the wallet executes nothing", async ({
  page,
}) => {
  await offerFromA(page);
  await post(`${FIXTURE}/__test__/accept-offer`, {
    object_id: OWNED_B,
    recipient: SECOND_WALLET,
  });
  await post(`${FIXTURE}/__test__/mode`, {
    cancelInsideNextTransferReserve: true,
  });
  await face(page).getByRole("button", { name: "Refresh" }).click();
  await face(page)
    .getByRole("button", { name: "Confirm transfer on your wallet" })
    .click();
  await page
    .getByRole("dialog", { name: "Start transferring this product?" })
    .getByRole("button", { name: "Sign transfer request" })
    .click();
  await expect(
    face(page).getByText(
      "This transfer was cancelled or expired before your wallet signed it. Nothing was sent.",
    ),
  ).toBeVisible();
  const stat = await stats();
  expect(stat.transfer).toMatchObject({ won: 0, refused: 1, cancelled: 1 });
  expect(stat.offers.at(-1)).toMatchObject({
    state: "cancelled",
    submitted: false,
  });
  expect(
    (await actionLogs(OWNED_B)).filter(
      (log) => log.account.toLowerCase() === WALLET.toLowerCase(),
    ),
  ).toEqual([]);
});
