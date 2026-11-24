// A deploy reproduces Publish: presync bakes the backend's SEO settings into the
// prerendered pages. Runs `icp deploy frontend` (local), so it takes a while.
import { expect, test } from "@playwright/test";
import { NewsStatus } from "../../app/bindings/backend";
import { apiAdmin, root } from "../support/local";
import { execFileSync } from "node:child_process";

test("presync bakes the backend's SEO settings at deploy", async ({ page }) => {
  test.setTimeout(300_000);
  const api = await apiAdmin();
  const original = await api.actor.getSeoSettings();
  if (original.__kind__ !== "ok") throw new Error(original.err.__kind__);
  const marker = `Bake ${Date.now()}`;
  const slug = `bake-${Date.now()}`;
  let newsId: bigint | null = null;
  const deploy = () => execFileSync("icp", ["deploy", "frontend", "--identity", "anonymous"], { cwd: root, stdio: "pipe", timeout: 240_000 });
  try {
    const set = await api.actor.setSeoSettings({ ...original.ok.settings, en: { ...original.ok.settings.en, title: marker, indexable: false } });
    expect(set.__kind__).toBe("ok");
    const n = await api.actor.createNews({
      slug, status: NewsStatus.published, publishedAt: BigInt(Date.now() - 60_000) * 1_000_000n,
      sv: { title: `Bakad ${slug}`, excerpt: "Ingress.", body: "Text.", coverAlt: "" },
    });
    if (n.__kind__ !== "ok") throw new Error(n.err.__kind__);
    newsId = n.ok.id;
    deploy();
    // The article is a real .html file from the deploy: clean URL, CSP from the template.
    const art = await page.goto(`/nyheter/${slug}`);
    expect(art?.status()).toBe(200);
    expect(art?.headers()["content-security-policy"]).toContain("script-src 'self' 'sha256-");
    await expect(page).toHaveTitle(`Bakad ${slug} – Axelkod AB`);
    await expect(page.locator("h1")).toHaveText(`Bakad ${slug}`);
    await page.goto("/");
    await expect(page.locator('[data-region="news-cards-sv"]')).toContainText(`Bakad ${slug}`);
    await page.goto("/en/");
    await expect(page).toHaveTitle(marker);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    const sitemap = await (await page.goto("/sitemap.xml"))!.text();
    expect(sitemap).not.toContain("<loc>https://axelkod.eu/en/</loc>"); // noindex pages leave the sitemap
  } finally {
    if (newsId !== null) await api.actor.deleteNews(newsId);
    await api.actor.setSeoSettings(original.ok.settings);
    deploy();
    api.revoke();
  }
});
