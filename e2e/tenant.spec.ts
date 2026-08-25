import { expect, test } from "@playwright/test";
import { mockViewerApi } from "./support";

test("protected routes redirect an anonymous visitor", async ({ page }) => {
  await mockViewerApi(page);
  await page.goto("/inventory");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("subdomain and bare hosts resolve to the wildcard organization", async ({
  request,
}) => {
  for (const origin of [
    "http://localhost:3000",
    "http://demo.localhost:3000",
  ]) {
    const response = await request.post(
      `${origin}/api/session/forgot-password`,
      {
        headers: { Origin: origin },
        data: { email: "nobody@example.com" },
      },
    );

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  }

  const customHost = "customer.example.com";
  const customDomainResponse = await request.post(
    "http://localhost:3000/api/session/forgot-password",
    {
      headers: {
        Origin: `https://${customHost}`,
        "X-Forwarded-Host": customHost,
      },
      data: { email: "nobody@example.com" },
    },
  );

  expect(customDomainResponse.status()).toBe(200);
  await expect(customDomainResponse.json()).resolves.toEqual({ ok: true });
});

test("an entry link keeps its organization in the address bar", async ({
  page,
}) => {
  const organizationId = "5f2b1c4e8a9d0b3c7e6f1a24";
  await mockViewerApi(page);
  await page.goto(`/${organizationId}/login`);

  await expect(page).toHaveURL(new RegExp(`/${organizationId}/login$`));
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();

  const cookies = await page.context().cookies();
  expect(
    cookies.find((cookie) => cookie.name === "smarttoken_viewer_org")?.value,
  ).toBe(organizationId);

  // The BFF is outside the proxy matcher and is called with no prefix, so this
  // proves the cookie is what carries the organization the rest of the way.
  // The mock API answers 200 for the host default and 422 for any other.
  const recovery = await page.request.post("/api/session/forgot-password", {
    headers: { Origin: "http://demo.localhost:3000" },
    data: { email: "nobody@example.com" },
  });
  expect(recovery.status()).toBe(422);
});

test("the organization survives a click between unauthorized pages", async ({
  page,
}) => {
  const organizationId = "5f2b1c4e8a9d0b3c7e6f1a24";
  await mockViewerApi(page);
  // The support mock answers this route itself; the point here is which
  // organization the real BFF sends upstream.
  await page.unroute("**/api/session/forgot-password");
  await page.goto(`/${organizationId}/login`);

  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${organizationId}/forgot-password$`),
  );

  const posted = page.waitForResponse((response) =>
    response.url().includes("/api/session/forgot-password"),
  );
  await page.getByLabel("Email address").fill("nobody@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();

  // The mock API answers 200 only for the host default organization.
  expect((await posted).status()).toBe(422);
});
