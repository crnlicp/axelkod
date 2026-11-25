// Försäljning end to end (A4 acceptance): issue an invoice → the PDF header comes from
// the settings → change the settings → the old invoice still renders its snapshot with
// the identical hash. Payment, e-invoice and axe on every sales page.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Role } from "../../app/bindings/accounting";
import { ensureOwnerAndYear, grant, ok, owner } from "../support/accounting";
import { signInWithLocalII } from "../support/local";
import { pdfText } from "../support/pdf-text";

test.describe.configure({ mode: "serial", timeout: 240_000 });

const run = Date.now() % 100000;
const before = `Säljare Före ${run} AB`;
const after = `Säljare Efter ${run} AB`;
const company = (legalName: string) => ({
  legalName, orgNr: "556036-0793", vatNr: "SE556036079301", registeredOffice: "Göteborg", street: "Gatan 1", postalCode: "411 01",
  city: "Göteborg", country: "SE", email: "faktura@example.se", fSkatt: true, bankgiro: "5050-1055",
});

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function downloadPdf(page: Page) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Ladda ner PDF" }).first().click()]);
  return pdfText(readFileSync((await d.path())!)).join("\n");
}

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  ok(await owner.setCompany(company(before)));
});

test("issue → PDF from snapshot; settings change keeps the old invoice and its hash", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInWithLocalII(page, context);
  const revoke = await grant((await page.getByTestId("principal").textContent())!.trim(), Role.owner);
  try {
    // Customer through the dialog.
    await page.goto("/admin/accounting/sales/customers");
    await page.getByRole("button", { name: "Ny kund" }).click();
    const dlg = page.getByRole("dialog", { name: "Ny kund" });
    const customer = `E2E Kund ${run} AB`;
    await dlg.getByLabel("Namn").fill(customer);
    await dlg.getByLabel("Organisationsnummer").fill("556036-0793");
    await dlg.getByLabel("Gatuadress").fill("Kundvägen 3");
    await dlg.getByLabel("Postnummer").fill("111 22");
    await dlg.getByLabel("Ort").fill("Stockholm");
    await axe(page);
    await dlg.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByText("Kunden är sparad.")).toBeVisible();

    // Invoice: customer first, one line, the canister's preview, then issue.
    await page.goto("/admin/accounting/sales/new?kind=invoice");
    await page.getByLabel("Kund", { exact: true }).selectOption({ label: customer });
    await page.getByLabel("Beskrivning rad 1").fill("Konsulttimmar");
    await page.getByLabel("Antal rad 1").fill("2,5");
    await page.getByLabel("À-pris rad 1").fill("1 200");
    await page.getByRole("button", { name: "Kontrollera" }).click();
    await expect(page.getByText("3 750,00 SEK".replace(" ", " "))).toBeVisible(); // 2,5 × 1 200 + 25 %
    await axe(page);
    await page.getByRole("button", { name: "Utfärda faktura" }).click();
    const sheet = page.getByRole("dialog", { name: "Utfärda faktura" });
    await expect(sheet.getByText("1510")).toBeVisible();
    await sheet.getByRole("button", { name: "Utfärda faktura" }).click();

    await expect(page.getByRole("heading", { name: /^Faktura \d+$/ })).toBeVisible();
    const number = (await page.getByRole("heading", { name: /^Faktura \d+$/ }).textContent())!.replace("Faktura ", "");
    const hash = (await page.locator("code").first().textContent())!.trim();
    await axe(page);
    const first = await downloadPdf(page);
    expect(first).toContain(before);
    expect(first).toContain(`Faktura ${number} · Genererad`);
    expect(first).toContain(`Hash ${hash}`);
    expect(first).toContain("Konsulttimmar");
    expect(first).toContain("Bankgiro 5050-1055 · OCR");

    // New company details: the issued invoice keeps its own snapshot and hash.
    ok(await owner.setCompany(company(after)));
    await page.reload();
    await expect(page.getByText("Innehållet stämmer med originalet")).toBeVisible();
    const second = await downloadPdf(page);
    expect(second).toContain(before);
    expect(second).not.toContain(after);
    expect(second).toContain(`Hash ${hash}`);

    // E-invoice.
    const [xml] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Ladda ner e-faktura (Peppol)" }).click()]);
    expect(readFileSync((await xml.path())!, "utf8")).toContain("urn:fdc:peppol.eu:2017:poacc:billing:3.0");

    // Payment in full.
    await page.getByRole("button", { name: "Registrera betalning" }).click();
    const pay = page.getByRole("dialog", { name: "Registrera betalning" });
    await axe(page);
    await pay.getByRole("button", { name: "Bokför betalning" }).click();
    await expect(page.getByText("Betalningen är bokförd.")).toBeVisible();
    await expect(page.getByText("Betald", { exact: true })).toBeVisible();

    for (const path of ["/admin/accounting/sales/invoices", "/admin/accounting/sales/quotes", "/admin/accounting/sales/payments",
      "/admin/accounting/sales/reminders", "/admin/accounting/sales/customers", "/admin/accounting/sales/items"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Försäljning", level: 1 })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "Laddar" })).toHaveCount(0);
      await axe(page);
    }
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  } finally {
    await revoke();
    ok(await owner.setCompany(company(before)));
  }
});
