// A deploy reproduces Publish: presync bakes the backend's SEO settings into the
// prerendered pages. Runs `icp deploy frontend` (local), so it takes a while.
import { expect, test } from "@playwright/test";
import { apiAdmin, root } from "../support/local";
import { execFileSync } from "node:child_process";

test("presync bakes the backend's SEO settings at deploy", async ({ page }) => {
  test.setTimeout(300_000);
  const api = await apiAdmin();
  const original = await api.actor.getSeoSettings();
  if (original.__kind__ !== "ok") throw new Error(original.err.__kind__);
  const marker = `Bake ${Date.now()}`;
  const deploy = () => execFileSync("icp", ["deploy", "frontend", "--identity", "anonymous"], { cwd: root, stdio: "pipe", timeout: 240_000 });
  try {
    const set = await api.actor.setSeoSettings({ ...original.ok.settings, en: { ...original.ok.settings.en, title: marker, indexable: false } });
    expect(set.__kind__).toBe("ok");
    deploy();
    await page.goto("/en/");
    await expect(page).toHaveTitle(marker);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    const sitemap = await (await page.goto("/sitemap.xml"))!.text();
    expect(sitemap).not.toContain("<loc>https://axelkod.eu/en/</loc>"); // noindex pages leave the sitemap
  } finally {
    await api.actor.setSeoSettings(original.ok.settings);
    deploy();
    api.revoke();
  }
});
