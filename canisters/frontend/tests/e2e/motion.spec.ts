import { expect, test } from "@playwright/test";

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing is hidden and nothing animates", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).not.toHaveClass(/\banim\b/);
    const hidden = await page.locator("[data-reveal]").evaluateAll((els) =>
      els.filter((e) => getComputedStyle(e).opacity !== "1").length,
    );
    expect(hidden).toBe(0);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(running).toBe(0);
  });
});

test("scroll reveals end fully visible", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveClass(/anim-ready/);
  const tile = page.locator("#branscher [data-reveal]").first();
  await tile.scrollIntoViewIfNeeded();
  await expect.poll(() => tile.evaluate((e) => getComputedStyle(e).opacity), { timeout: 5_000 }).toBe("1");
});

test("mobile menu opens, closes with Escape and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const button = page.getByRole("button", { name: "Meny" });
  await button.click();
  const menu = page.locator("#mobile-menu");
  await expect(menu.getByRole("link", { name: "Säkerhet" })).toBeVisible();
  await expect(menu.getByRole("link").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Meny" })).toBeFocused();
});
