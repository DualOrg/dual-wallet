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
