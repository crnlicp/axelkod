// Tillgångar & lager in the browser (A9a): a new asset with the half-PBB hint, its schedule
// and PDF, the depreciation preview, the stock pages and the count sheet; axe on each page.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Role } from "../../app/bindings/accounting";
import { ensureOwnerAndYear, grant, ok, owner } from "../support/accounting";
import { signInWithLocalII } from "../support/local";

test.describe.configure({ timeout: 180_000 });
const run = Date.now() % 100000;

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  const s = ok(await owner.getSettings()).settings;
  if (!s.modules.inventory) ok(await owner.setSettings({ ...s, modules: { ...s.modules, inventory: true } }));
});

test("asset register, schedule, depreciation preview, stock and count sheet", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInWithLocalII(page, context);
  const revoke = await grant((await page.getByTestId("principal").textContent())!.trim(), Role.owner);
  const name = `Svetsaggregat ${run}`;
  try {
    await page.goto("/admin/accounting/assets");
    await expect(page.getByRole("heading", { level: 1, name: "Tillgångar & lager" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Tillgångar & lager" }).getByRole("link", { name: "Tillgångar" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Ny tillgång" }).click();
    const dlg = page.getByRole("dialog", { name: "Ny tillgång" });
    await dlg.getByLabel("Benämning").fill(name);
    await dlg.getByLabel("Anskaffningsvärde (kr)").fill("20 000");
    // 20 000 kr is below half a prisbasbelopp (29 600 kr): the K2 10.5 hint shows.
    await expect(dlg.getByRole("note")).toContainText("29 600");
    await dlg.getByLabel("Anskaffningsvärde (kr)").fill("36 000");
    await expect(dlg.getByRole("note")).toHaveCount(0);
    await dlg.getByLabel("Anskaffad").fill("2026-02-10");
    await dlg.getByLabel("Tagen i bruk").fill("2026-03-01");
    await axe(page);
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByText("Tillgången är sparad.").first()).toBeVisible();

    // 36 000 kr over 60 months from March: 10 × 600 kr = 6 000 kr in 2026.
    await page.getByRole("row", { name: new RegExp(name) }).click();
    const det = page.getByRole("dialog", { name });
    await expect(det.getByRole("row", { name: /2026-01 – 2026-12/ })).toContainText("6 000,00");
    const [pdf] = await Promise.all([page.waitForEvent("download"), det.getByRole("button", { name: "Ladda ner PDF" }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/^avskrivningsplan-/);
    await axe(page);
    await det.getByRole("button", { name: "Ta bort" }).click();
    await expect(page.getByText("Tillgången är borttagen.").first()).toBeVisible();

    await page.getByLabel("Period", { exact: true }).fill("2026-12");
    await page.getByRole("button", { name: "Visa underlag" }).click();
    await expect(page.getByText(/Summa|Inget att skriva av/).first()).toBeVisible();

    await page.getByRole("link", { name: "Lager", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Lagerartiklar" })).toBeVisible();
    await axe(page);
    await page.getByRole("button", { name: "Ny lagerartikel" }).click();
    const it = page.getByRole("dialog", { name: "Ny lagerartikel" });
    await it.getByLabel("Artikelnr").fill(`E2E-${run}`);
    await it.getByLabel("Namn").fill("Filter");
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByRole("row", { name: new RegExp(`E2E-${run}`) })).toBeVisible();

    await page.getByRole("link", { name: "Inventering", exact: true }).click();
    await expect(page.getByRole("table", { name: "Inventeringslista" })).toBeVisible();
    const [sheet] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Inventeringslista (PDF)" }).click()]);
    expect(sheet.suggestedFilename()).toMatch(/^inventeringslista-/);
    await axe(page);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  } finally {
    await revoke();
  }
});
