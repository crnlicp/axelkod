import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { NewsArea, NewsStatus, type NewsInput } from "../../app/bindings/backend";
import { apiAdmin, signInAsAdmin } from "../support/local";

const ns = (ms: number) => BigInt(ms) * 1_000_000n;

async function publish(page: Page) {
  await page.goto("/admin/seo");
  await page.getByRole("button", { name: "Publicera", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publicerat." })).toBeVisible({ timeout: 60_000 });
}

test("published news: landing cards, list pages, article pages, removal", async ({ page, context }) => {
  test.setTimeout(240_000);
  const api = await apiAdmin();
  const tag = `e${Date.now()}`;
  const now = Date.now();
  const mk = (i: number, extra: Partial<NewsInput> = {}): NewsInput => ({
    slug: `${tag}-${i}`,
    status: NewsStatus.published,
    publishedAt: ns(now - i * 3_600_000),
    area: NewsArea.software,
    sv: { title: `Svensk nyhet ${i} ${tag}`, excerpt: `Ingress ${i}.`, body: `## Rubrik ${i}\n\nText med **fet** stil.`, coverAlt: "" },
    en: { title: `English news ${i} ${tag}`, excerpt: `Lead ${i}.`, body: `## Heading ${i}\n\nSome text.`, coverAlt: "" },
    ...extra,
  });
  const ids: bigint[] = [];
  const session = await signInAsAdmin(page, context);
  try {
    for (const input of [
      mk(1), mk(2), mk(3), mk(4, { en: undefined }), // 4: Swedish only
      mk(5, { status: NewsStatus.draft }), mk(6, { publishedAt: ns(now + 86_400_000) }), // draft, future
    ]) {
      const r = await api.actor.createNews(input);
      if (r.__kind__ !== "ok") throw new Error(r.err.__kind__);
      ids.push(r.ok.id);
    }
    await publish(page);

    const site = await context.newPage();
    const errors: string[] = [];
    // Resource 404s are expected below (unknown/draft article URLs).
    site.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));

    // Landing: the three newest (these are the newest on the canister by date).
    await site.goto("/");
    const cards = site.locator('[data-region="news-cards-sv"] h3');
    await expect(cards).toHaveText([`Svensk nyhet 1 ${tag}`, `Svensk nyhet 2 ${tag}`, `Svensk nyhet 3 ${tag}`].map((t) => t.toUpperCase() === t ? t : t), { ignoreCase: true });

    // Lists: drafts and future articles never appear; English skips Swedish-only.
    await site.goto("/nyheter");
    const sv = site.locator('[data-region="news-list-sv"]');
    await expect(sv).toContainText(`Svensk nyhet 4 ${tag}`);
    await expect(sv).not.toContainText(`Svensk nyhet 5 ${tag}`);
    await expect(sv).not.toContainText(`Svensk nyhet 6 ${tag}`);
    await expect(site).toHaveTitle("Nyheter – Axelkod AB");
    let axe = await new AxeBuilder({ page: site }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    await site.goto("/en/news");
    await expect(site.locator('[data-region="news-list-en"]')).toContainText(`English news 1 ${tag}`);
    await expect(site.locator('[data-region="news-list-en"]')).not.toContainText(`news 4 ${tag}`);

    // Article page: content, SEO, headers; language switch to the English version.
    await site.goto("/nyheter");
    await site.getByRole("link", { name: new RegExp(`Svensk nyhet 2 ${tag}`) }).click();
    await expect(site).toHaveURL(new RegExp(`/nyheter/${tag}-2$`));
    await expect(site.locator("h1")).toHaveText(`Svensk nyhet 2 ${tag}`);
    await expect(site.locator(".prose-ax h2")).toHaveText("Rubrik 2");
    await expect(site.locator(".prose-ax strong")).toHaveText("fet");
    await expect(site).toHaveTitle(`Svensk nyhet 2 ${tag} – Axelkod AB`);
    await expect(site.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://axelkod.eu/nyheter/${tag}-2`);
    await expect(site.locator('link[hreflang="en"]')).toHaveAttribute("href", `https://axelkod.eu/en/news/${tag}-2`);
    const ld = JSON.parse((await site.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
    expect(ld["@type"]).toBe("NewsArticle");
    const res = await site.goto(`/nyheter/${tag}-2`);
    expect(res?.headers()["content-security-policy"]).toContain("script-src 'self' 'sha256-");
    await site.waitForLoadState("networkidle");
    axe = await new AxeBuilder({ page: site }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    await site.getByRole("link", { name: "EN – In English" }).click();
    await expect(site).toHaveURL(new RegExp(`/en/news/${tag}-2$`));
    await expect(site.locator("h1")).toHaveText(`English news 2 ${tag}`);

    // Swedish-only article: no English version, the switch goes to the English list.
    await site.goto(`/nyheter/${tag}-4`);
    await expect(site.locator('link[hreflang="en"]')).toHaveCount(0);
    await expect(site.getByRole("link", { name: "EN – In English" })).toHaveAttribute("href", "/en/news");
    expect((await site.goto(`/en/news/${tag}-4`))?.status()).toBe(404);
    expect((await site.goto(`/nyheter/${tag}-5`))?.status()).toBe(404); // draft never baked
    await expect(site.locator("h1")).toHaveText("Sidan hittades inte"); // not a blank page

    const sitemap = await (await site.goto("/sitemap.xml"))!.text();
    expect(sitemap).toContain(`/nyheter/${tag}-1</loc>`);
    expect(sitemap).not.toContain(`${tag}-5`);
    expect(errors).toEqual([]);

    // Removal: after the next Publish the old URL serves a noindex "not found" page.
    await api.actor.deleteNews(ids[1]);
    await publish(page);
    const gone = await site.goto(`/nyheter/${tag}-2`);
    expect(gone?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(site.locator("h1")).toHaveText("Sidan hittades inte");
  } finally {
    for (const id of ids) await api.actor.deleteNews(id);
    await publish(page).catch(() => undefined);
    session.revoke();
    api.revoke();
  }
});
