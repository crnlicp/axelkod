import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = ["/", "/en/", "/integritet", "/en/privacy", "/does-not-exist"];

// Dark is the default; light is chosen with the toggle (stored in localStorage).
for (const theme of ["dark", "light"] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ context }) => {
      if (theme === "light") await context.addInitScript(() => localStorage.setItem("axelkod:theme", "light"));
    });

    for (const path of pages) {
      test(`${path}: no WCAG 2.1 AA violations, one h1`, async ({ page }) => {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("h1")).toHaveCount(1);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 120)).join(" | ")}`)).toEqual([]);
      });
    }
  });
}

test("keyboard: skip link first, visible focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const active = page.locator(":focus");
  await expect(active).toHaveAttribute("href", "#main");
  await expect(active).toBeVisible();
  expect(await active.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
});

test("theme toggle switches and remembers the theme", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Byt till ljust tema" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Byt till mörkt tema" })).toBeVisible();
});
