// Inköp and Bank end to end (A5 acceptance): upload a supplier invoice → book it in the
// workbench beside the decrypted file → import a bank CSV (duplicates skipped) → accept
// the amount match → the invoice is paid. Axe on every Inköp and Bank page.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Role, Treatment } from "../../app/bindings/accounting";
import { ensureOwnerAndYear, grant, ok, owner } from "../support/accounting";
import { signInWithLocalII } from "../support/local";

test.describe.configure({ mode: "serial", timeout: 240_000 });

const run = Date.now() % 100000;
const supplier = `E2E Leverantör ${run}`;
const today = new Date().toLocaleDateString("sv-SE");

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  ok(await owner.saveSupplier(null, { name: supplier, country: "SE", treatment: Treatment.domestic, defaultAccount: 6212n, active: true }));
});

test("upload → book beside the file → bank CSV → match → paid", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInWithLocalII(page, context);
  const revoke = await grant((await page.getByTestId("principal").textContent())!.trim(), Role.owner);
  try {
    // Inbox: the uploaded file becomes a card.
    await page.goto("/admin/accounting/purchases");
    const file = `faktura-${run}.pdf`;
    await page.locator("input[type=file][multiple]").setInputFiles({ name: file, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% e2e ${run}\n`) });
    await expect(page.getByText(`${file} är uppladdad.`)).toBeVisible({ timeout: 60_000 });
    await axe(page);
    await page.getByRole("link", { name: `Bokför ${file}` }).click();

    // Workbench: the decrypted file beside the form; the supplier sets the account.
    await expect(page.locator(`iframe[title="${file}"]`)).toHaveAttribute("src", /^blob:/, { timeout: 60_000 });
    await page.getByLabel("Leverantör", { exact: true }).selectOption({ label: supplier });
    await expect(page.getByLabel("Konto rad 1")).toHaveValue(/^6212/);
    await page.getByLabel("Fakturanummer").fill(`E${run}`);
    await page.getByLabel("Vad gäller köpet").fill("Bredband");
    await page.getByLabel("Belopp exkl. moms rad 1").fill("987,65");
    await expect(page.getByLabel("Moms rad 1", { exact: true })).toHaveValue("246,91");
    await axe(page);
    await page.getByRole("button", { name: "Kontrollera" }).click();
    const sheet = page.getByRole("dialog", { name: "Bokför underlag" });
    await expect(sheet.getByText("2440")).toBeVisible();
    await expect(sheet.getByText("2641")).toBeVisible();
    await sheet.getByRole("button", { name: "Bokför" }).click();
    await expect(page.getByText("Underlaget är bokfört.").first()).toBeVisible();

    // Bank CSV: import, then the same file again (all duplicates).
    const csv = `Datum;Belopp;Text\n${today};-1 234,56;E2E BETALNING ${run}\n`;
    for (const expected of ["1 transaktioner importerade, 0 dubbletter hoppades över.", "0 transaktioner importerade, 1 dubbletter hoppades över."]) {
      await page.goto("/admin/accounting/bank/import");
      await page.getByLabel("CSV-fil från banken").setInputFiles({ name: "konto.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
      await expect(page.getByText("1 rader läses in.")).toBeVisible();
      await axe(page);
      await page.getByRole("button", { name: "Nästa" }).click();
      await expect(page.getByRole("cell", { name: `E2E BETALNING ${run}` })).toBeVisible();
      await page.getByRole("button", { name: "Importera" }).click();
      await expect(page.getByText(expected)).toBeVisible();
    }

    // Matching: the amount suggestion pays the supplier invoice.
    await page.getByRole("link", { name: "Gå till matchning" }).click();
    await page.getByRole("button", { name: new RegExp(`E2E BETALNING ${run}`) }).click();
    const suggestion = page.getByRole("listitem").filter({ hasText: `${supplier}, E${run}` });
    await expect(suggestion.getByText("Belopp och datum stämmer")).toBeVisible();
    await axe(page);
    await suggestion.getByRole("button", { name: "Godkänn" }).click();
    await expect(page.getByText("Transaktionen är matchad.")).toBeVisible();

    await page.goto("/admin/accounting/purchases/invoices");
    await expect(page.getByRole("row").filter({ hasText: supplier }).getByText("Betald")).toBeVisible();

    for (const path of ["/admin/accounting/purchases/invoices", "/admin/accounting/purchases/receipts", "/admin/accounting/purchases/suppliers",
      "/admin/accounting/bank", "/admin/accounting/bank/rules", "/admin/accounting/bank/tax", "/admin/accounting/bank/tax/import"]) {
      await page.goto(path);
      await expect(page.getByRole("status").filter({ hasText: "Laddar" })).toHaveCount(0);
      await axe(page);
    }
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  } finally {
    await revoke();
  }
});
