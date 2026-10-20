import { expect, test } from "@playwright/test";

test("Ghostdrop placeholder pages and security headers", async ({
  page,
  request,
}) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);

  const headers = home.headers();
  expect(headers["content-security-policy"]).toContain("nonce-");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-content-type-options"]).toBe("nosniff");

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ghostdrop" }),
  ).toBeVisible();

  const reveal = await request.get("/d/test123");
  expect(reveal.status()).toBe(200);
  expect(reveal.headers()["cache-control"]).toContain("no-store");

  await page.goto("/d/test123");
  await expect(
    page.getByRole("heading", { name: "Reveal drop" }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Reveal" }),
  ).toBeDisabled();
});
