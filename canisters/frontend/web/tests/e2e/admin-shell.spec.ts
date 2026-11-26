// The admin shell for a user with both workspaces: the website Översikt as landing page and
// the inbox on its own route, one active workspace in the switch, the logo linking to the
// workspace overview, the current tab marked, the New menu replacing (not appending to) the
// URL, required fields marked by Utfärda, the search box focused, the Dokumentation page,
// no browser translation, and no empty space below the Ekonomi overview.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Role } from "../../app/bindings/accounting";
import { ensureOwnerAndYear, grant } from "../support/accounting";
import { icp, signInWithLocalII } from "../support/local";

test.describe.configure({ timeout: 180_000 });

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.beforeAll(async () => { await ensureOwnerAndYear(); });

test("shell: overview, switch, logo, tabs, New menu, required fields, search, guide", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInWithLocalII(page, context);
  const principal = (await page.getByTestId("principal").textContent())!.trim();
  icp("canister", "call", "site", "addAdmin", `(principal "${principal}")`);
  const revoke = await grant(principal, Role.owner);
  try {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Översikt" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("translate", "no");
    await page.getByRole("link", { name: /^Inkorg/ }).click();
    await expect(page).toHaveURL(/\/admin\/inbox$/);
    await expect(page.getByRole("heading", { level: 1, name: "Inkorg" })).toBeVisible();

    // Ekonomi: only that workspace is current; the logo leads to its overview.
    const sw = page.getByRole("navigation", { name: "Arbetsyta" });
    await sw.getByRole("link", { name: "Ekonomi" }).click();
    await expect(sw.getByRole("link", { name: "Ekonomi" })).toHaveAttribute("aria-current", "page");
    await expect(sw.getByRole("link", { name: "Webbplats" })).not.toHaveAttribute("aria-current", /.+/);
    await page.goto("/admin/accounting/vat");
    await page.locator("aside").getByRole("link", { name: /Översikt$/ }).first().click();
    await expect(page).toHaveURL(/\/admin\/accounting(\?|$)/);
    // The hidden chart table must not make the page taller than the shell.
    await page.waitForLoadState("networkidle");
    const extra = await page.evaluate(() => document.documentElement.scrollHeight - document.querySelector("#main")!.parentElement!.getBoundingClientRect().height);
    expect(extra).toBeLessThan(2);

    // The section landing marks its tab; so do detail pages.
    await page.goto("/admin/accounting/sales");
    await expect(page.getByRole("navigation", { name: "Försäljning" }).getByRole("link", { name: "Fakturor" })).toHaveAttribute("aria-current", "page");
    await page.goto("/admin/accounting/settings");
    await expect(page.locator('a[aria-current="page"]').filter({ hasText: "Företag" })).toHaveCount(1);

    // New → Offert, then New → Faktura: a new editor and a clean URL each time.
    const newMenu = page.locator("summary").filter({ hasText: "Ny" });
    await newMenu.click();
    await page.getByRole("link", { name: "Offert", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ny offert" })).toBeVisible();
    await newMenu.click();
    await page.getByRole("link", { name: "Faktura", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ny faktura" })).toBeVisible();
    expect(new URL(page.url()).searchParams.getAll("kind")).toEqual(["invoice"]);

    // Utfärda on an empty invoice marks the required fields and says what is missing.
    await page.getByRole("button", { name: "Utfärda faktura" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Fyll i de markerade fälten" })).toBeVisible();
    await expect(page.getByLabel("Kund", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Kund", { exact: true })).toBeFocused();

    // Ctrl K opens the search with the cursor in the box.
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("searchbox")).toBeFocused();
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "Dokumentation" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Dokumentation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Arbetsflödet" })).toBeVisible();
    await axe(page);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  } finally {
    await revoke();
    icp("canister", "call", "site", "removeAdmin", `(principal "${principal}")`);
  }
});
