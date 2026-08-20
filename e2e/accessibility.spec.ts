import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockViewerApi, smartObject } from "./support";

test.beforeEach(async ({ page }) => {
  await mockViewerApi(page, { authenticated: true });
});

const routes = [
  ["inventory", "/inventory"],
  ["activity", "/activity"],
  ["settings", "/settings"],
  ["object detail", `/inventory/${smartObject.id}`],
] as const;

// The supported matrix is every route in both themes.
for (const theme of ["light", "dark"] as const) {
  for (const [name, path] of routes) {
    test(`${name} has no accessibility violations in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(
        theme === "dark" ? /dark/ : /^(?!.*dark).*$/,
      );

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

test("the skip link is the first stop and jumps to the main content", async ({
  page,
}) => {
  await page.goto("/inventory");
  await page.keyboard.press("Tab");

  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
});

test("the mobile navigation reports its state and closes on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/inventory");

  const toggle = page.getByRole("button", { name: "Open navigation" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();

  const opened = page.getByRole("button", { name: "Close navigation" });
  await expect(opened).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("no page scrolls sideways at 320 CSS pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });

  for (const [, path] of [...routes, ["login", "/login"] as const]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows, `${path} overflows at 320px`).toBe(false);
  }
});

test("every interactive target is at least 44 by 44 pixels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const undersized = await page.evaluate(() => {
    const inlineLink = (element: Element) =>
      element.matches("a") &&
      !element.matches(".button, .nav-link, .icon-button");
    return [...document.querySelectorAll("button, a[href], select")]
      .filter((element) => !inlineLink(element))
      .map((element) => ({
        label: element.textContent?.trim().slice(0, 30) ?? "",
        classes: element.className,
        ...element.getBoundingClientRect().toJSON(),
      }))
      .filter((box) => box.width > 0 && (box.width < 44 || box.height < 44));
  });

  expect(undersized).toEqual([]);
});
