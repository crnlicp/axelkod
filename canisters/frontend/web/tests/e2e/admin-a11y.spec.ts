import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "../support/local";

test("admin pages have no WCAG 2.1 AA violations", async ({ page, context }) => {
  test.setTimeout(90_000);
  const session = await signInAsAdmin(page, context);
  try {
    for (const [path, heading] of [["/admin", "Översikt"], ["/admin/inbox", "Inkorg"], ["/admin/contact", "Kontaktuppgifter"], ["/admin/seo", "SEO"], ["/admin/settings", "Inställningar"], ["/admin/news", "Nyheter"], ["/admin/news/new", "Ny nyhet"]]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(axe.violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    }
  } finally {
    session.revoke();
  }
});
