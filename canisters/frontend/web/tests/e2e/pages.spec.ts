import { expect, test, type Page } from "@playwright/test";

const SITE = "https://axelkod.eu";

// Fails the test on any console error, which includes CSP violations.
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const cases = [
  { path: "/", lang: "sv", canonical: "/", alt: { sv: "/", en: "/en/" } },
  { path: "/en/", lang: "en", canonical: "/en/", alt: { sv: "/", en: "/en/" } },
  { path: "/integritet", lang: "sv", canonical: "/integritet", alt: { sv: "/integritet", en: "/en/privacy" } },
  { path: "/en/privacy", lang: "en", canonical: "/en/privacy", alt: { sv: "/integritet", en: "/en/privacy" } },
];

for (const c of cases) {
  test(`${c.path}: lang, canonical, hreflang, no console/CSP errors`, async ({ page }) => {
    const errors = collectErrors(page);
    const res = await page.goto(c.path);
    expect(res?.status()).toBe(200);
    expect(res?.headers()["content-security-policy"]).toContain("script-src 'self' 'sha256-");
    expect(res?.headers()["content-security-policy"]).not.toContain("unsafe-inline");
    await expect(page.locator("html")).toHaveAttribute("lang", c.lang);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", SITE + c.canonical);
    await expect(page.locator('link[hreflang="sv"]')).toHaveAttribute("href", SITE + c.alt.sv);
    await expect(page.locator('link[hreflang="en"]')).toHaveAttribute("href", SITE + c.alt.en);
    await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute("href", SITE + c.alt.sv);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${SITE}/og-image.png`);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
}

test("home has Organization JSON-LD", async ({ page }) => {
  await page.goto("/");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld["@type"]).toBe("Organization");
});

test("hydrates: language switch navigates client-side", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
  await page.getByRole("link", { name: "In English" }).first().click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator("h1")).toHaveText("Code. Security. Supply.");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  // Same document: React Router handled the click, so hydration worked.
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
  expect(errors).toEqual([]);
});

test("contact button scrolls to the contact section", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Kontakta oss" }).click();
  await expect(page).toHaveURL(/#kontakt$/);
  await expect(page.locator("#kontakt h2")).toBeInViewport();
});

test("unknown path returns 404 page", async ({ page }) => {
  const res = await page.goto("/finns-inte");
  expect(res?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("Sidan hittades inte");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});

// Fetched through the browser: Node's resolver doesn't know *.localhost.
test("sitemap and robots", async ({ page }) => {
  const sitemap = await (await page.goto("/sitemap.xml"))!.text();
  for (const p of ["/", "/en/", "/integritet", "/en/privacy"]) expect(sitemap).toContain(`<loc>${SITE}${p}</loc>`);
  expect(await (await page.goto("/robots.txt"))!.text()).toContain(`Sitemap: ${SITE}/sitemap.xml`);
});

test("no third-party requests", async ({ page }) => {
  const hosts = new Set<string>();
  page.on("request", (r) => hosts.add(new URL(r.url()).host));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // The page itself plus the local gateway's API endpoint (icp-api.io on mainnet).
  expect([...hosts].sort()).toEqual(["localhost:8000", "web.local.localhost:8000"]);
});
