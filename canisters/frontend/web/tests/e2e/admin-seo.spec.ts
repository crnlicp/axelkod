import { expect, test, type Page } from "@playwright/test";
import { apiAdmin, signInAsAdmin } from "../support/local";

async function publish(page: Page) {
  await page.getByRole("button", { name: "Publicera", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publicerat." })).toBeVisible({ timeout: 30_000 });
}

test("admin edits SEO, publishes, and the public pages carry the new head", async ({ page, context }) => {
  test.setTimeout(150_000);
  const api = await apiAdmin();
  const original = await api.actor.getSeoSettings();
  if (original.__kind__ !== "ok") throw new Error(original.err.__kind__);
  const marker = `SEO-test ${Date.now()}`;
  const session = await signInAsAdmin(page, context);
  try {
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "SEO" }).click();
    await expect(page).toHaveURL(/\/admin\/seo$/);

    // Counter and Google preview follow the input.
    await page.getByLabel("Titel", { exact: true }).fill(`${marker} – Axelkod`);
    await expect(page.getByText(new RegExp(`^${marker.length + 10} / ~60 tecken$`))).toBeVisible();
    await expect(page.getByTestId("google-preview")).toContainText(marker);

    // Canister-side validation.
    await page.getByLabel("Kanonisk bas-URL").fill("http://insecure.example");
    await page.getByRole("button", { name: "Spara", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Ogiltigt värde: Svenska: kanonisk bas-URL" })).toBeVisible();
    await page.getByLabel("Kanonisk bas-URL").fill("https://axelkod.eu");

    // OG image upload to /uploads/ (kept across deploys by _preserve).
    await page.locator("#seo-ogfile").setInputFiles("public/og-image.png");
    await expect(page.getByRole("status").filter({ hasText: "Bilden är uppladdad" })).toBeVisible({ timeout: 30_000 });
    const ogUrl = await page.getByLabel("OG-bild (URL, 1200×630)").inputValue();
    expect(ogUrl).toMatch(/^https:\/\/axelkod\.eu\/uploads\/og-\d+\.png$/);

    await page.getByRole("button", { name: "Spara", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat." })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("har ändrats sedan senaste publiceringen");

    await publish(page);
    await expect(page.getByTestId("published-at")).not.toHaveText("aldrig");
    await expect(page.getByRole("note")).toHaveCount(0);

    // The live page: new head, same security headers, no hydration/CSP errors.
    const site = await context.newPage();
    const errors: string[] = [];
    site.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const res = await site.goto("/");
    await expect(site).toHaveTitle(`${marker} – Axelkod`);
    await expect(site.locator('meta[property="og:image"]')).toHaveAttribute("content", ogUrl);
    expect(res?.headers()["content-security-policy"]).toContain("script-src 'self' 'sha256-");
    expect(res?.headers()["x-frame-options"]).toBe("DENY");
    await site.waitForLoadState("networkidle");
    await expect(site).toHaveTitle(`${marker} – Axelkod`); // still there after hydration
    expect(errors).toEqual([]);
    const ogRes = await site.goto(new URL(ogUrl).pathname);
    expect(ogRes?.status()).toBe(200);
    expect(ogRes?.headers()["content-type"]).toBe("image/png");
    const sitemap = await (await site.goto("/sitemap.xml"))!.text();
    expect(sitemap).toContain(`<lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>`);
    // English page untouched by the Swedish title.
    await site.goto("/en/");
    await expect(site).not.toHaveTitle(new RegExp(marker));
  } finally {
    await api.actor.setSeoSettings(original.ok.settings);
    await page.goto("/admin/seo");
    await publish(page);
    session.revoke();
    api.revoke();
  }
});
