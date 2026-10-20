# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> Ghostdrop placeholder pages and security headers
- Location: tests/e2e/smoke.spec.ts:3:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Ghostdrop' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'Ghostdrop' }) with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Ghostdrop' })

```

```yaml
- main:
  - img "Next.js logo"
  - heading "To get started, edit the page.tsx file." [level=1]:
    - text: To get started, edit the
    - code: page.tsx
    - text: file.
  - paragraph:
    - text: Looking for a starting point or more instructions? Head over to
    - link "Templates":
      - /url: https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app
    - text: or the
    - link "Learning":
      - /url: https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app
    - text: center.
  - link "Vercel logomark Deploy Now":
    - /url: https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app
    - img "Vercel logomark"
    - text: Deploy Now
  - link "Documentation":
    - /url: https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | test("Ghostdrop placeholder pages and security headers", async ({
  4  |   page,
  5  |   request,
  6  | }) => {
  7  |   const home = await request.get("/");
  8  |   expect(home.status()).toBe(200);
  9  | 
  10 |   const headers = home.headers();
  11 |   expect(headers["content-security-policy"]).toContain("nonce-");
  12 |   expect(headers["referrer-policy"]).toBe("no-referrer");
  13 |   expect(headers["x-content-type-options"]).toBe("nosniff");
  14 | 
  15 |   await page.goto("/");
  16 |   await expect(
  17 |     page.getByRole("heading", { name: "Ghostdrop" }),
> 18 |   ).toBeVisible();
     |     ^ Error: expect(locator).toBeVisible() failed
  19 | 
  20 |   const reveal = await request.get("/d/test123");
  21 |   expect(reveal.status()).toBe(200);
  22 |   expect(reveal.headers()["cache-control"]).toContain("no-store");
  23 | 
  24 |   await page.goto("/d/test123");
  25 |   await expect(
  26 |     page.getByRole("heading", { name: "Reveal drop" }),
  27 |   ).toBeVisible();
  28 | 
  29 |   await expect(
  30 |     page.getByRole("button", { name: "Reveal" }),
  31 |   ).toBeDisabled();
  32 | });
  33 | 
```