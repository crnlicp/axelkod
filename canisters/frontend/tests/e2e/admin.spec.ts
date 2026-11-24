import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("admin shell: sign-in view, noindex, no console/CSP errors, accessible", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(200);
  expect(res?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.getByRole("button", { name: "Logga in med Internet Identity" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  expect(errors).toEqual([]);
});

test("/admin/* is served by the admin shell; unknown admin paths render the 404 view", async ({ page }) => {
  const res = await page.goto("/admin/anything");
  expect(res?.status()).toBe(200); // _redirects rewrite to admin.html
  await expect(page.getByRole("heading", { name: "Sidan hittades inte" })).toBeVisible();
});

test("sign-in uses id.ai by default, the local test II only when opted in", async ({ page, context }) => {
  await page.goto("/admin");
  // Asserted on the request: id.ai itself may be unreachable from the test machine.
  const [request, idai] = await Promise.all([
    context.waitForEvent("request", (r) => r.url().startsWith("https://id.ai/")),
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Logga in med Internet Identity" }).click(),
  ]);
  expect(new URL(request.url()).pathname).toBe("/authorize");
  await idai.close();

  await page.evaluate(() => localStorage.setItem("axelkod:ii", "local"));
  await page.reload();
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Logga in med Internet Identity" }).click(),
  ]);
  await expect(popup).toHaveURL("http://id.ai.localhost:8000/authorize");
  await expect(popup.getByText("to continue to frontend.local.localhost")).toBeVisible();
});

test("public pages never load admin or auth code", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(scripts.filter((s) => /layout-|inbox-|auth/.test(s))).toEqual([]);
});
