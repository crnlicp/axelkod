import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("home has no WCAG 2.1 AA violations (incl. contrast)", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });

    test("one h1 and visible keyboard focus", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("h1")).toHaveCount(1);
      await page.keyboard.press("Tab");
      const outline = await page.evaluate(
        () => getComputedStyle(document.activeElement as Element).outlineStyle,
      );
      expect(outline).toBe("solid");
    });
  });
}
