// Ekonomi end to end: sign in as an accounting-only owner, run the setup wizard,
// post a voucher, check the PDF header and the audit hash, correct it, and check
// the read-only auditor view. axe runs on every page.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Role } from "../../app/bindings/accounting";
import { ensureOwnerAndYear, grant } from "../support/accounting";
import { signInWithLocalII } from "../support/local";
import { pdfText } from "../support/pdf-text";

test.describe.configure({ mode: "serial", timeout: 180_000 });

const company = {
  legalName: `E2E Bolag ${Date.now() % 100000} AB`, orgNr: "556036-0793", street: "Testgatan 1", postalCode: "411 01",
  city: "Göteborg", registeredOffice: "Göteborg", email: "ekonomi@example.se",
};

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function signInWithRole(page: Page, context: import("@playwright/test").BrowserContext, role: Role) {
  await signInWithLocalII(page, context);
  const principal = (await page.getByTestId("principal").textContent())!.trim();
  const revoke = await grant(principal, role);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/accounting/);
  return revoke;
}

test.beforeAll(async () => { await ensureOwnerAndYear(); });

test("owner: setup wizard, post, PDF header, hash, correction", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const revoke = await signInWithRole(page, context, Role.owner);
  try {
    // An accounting-only user lands in Ekonomi and never sees the website workspace.
    await expect(page.getByRole("heading", { name: "Översikt" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Arbetsyta" })).toHaveCount(0);
    await axe(page);

    // Setup wizard: company step.
    await page.goto("/admin/accounting/setup");
    await expect(page.getByRole("heading", { name: "Inställning av Ekonomi" })).toBeVisible();
    await axe(page);
    for (const [label, v] of [["Företagsnamn", company.legalName], ["Organisationsnummer", company.orgNr], ["Gatuadress", company.street],
      ["Postnummer", company.postalCode], ["Ort", company.city], ["Säte", company.registeredOffice], ["Fakturamejl", company.email]] as const)
      await page.getByLabel(label, { exact: true }).fill(v);
    await expect(page.getByLabel("Momsregistreringsnummer")).toHaveValue("SE556036079301");
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByText("Företagsuppgifterna är sparade.")).toBeVisible();
    // The fiscal year exists already (created in beforeAll), so the step shows it.
    await expect(page.getByRole("heading", { name: "Räkenskapsår", level: 2 })).toBeVisible();

    // Post a voucher through the editor.
    await page.goto("/admin/accounting/ledger/new");
    await page.getByLabel("Text", { exact: true }).fill("E2E försäljning");
    await page.getByRole("combobox", { name: "Konto rad 1" }).fill("1930");
    await page.keyboard.press("Enter");
    await page.getByLabel("Debet rad 1").fill("1 250,00");
    await page.getByRole("combobox", { name: "Konto rad 2" }).fill("3001");
    await page.keyboard.press("Enter");
    await page.getByLabel("Kredit rad 2").fill("1250");
    await expect(page.getByText("Balanserar")).toBeVisible();
    await axe(page);
    await page.getByRole("button", { name: "Bokför", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Bokför verifikation" });
    await expect(sheet.getByText("Kan inte ändras i efterhand")).toBeVisible();
    await sheet.getByRole("button", { name: "Bokför verifikation" }).click();

    await expect(page.getByRole("heading", { name: /^Verifikation A-\d+$/ })).toBeVisible();
    const ref = (await page.getByRole("heading", { name: /^Verifikation A-\d+$/ }).textContent())!.replace("Verifikation ", "");
    await expect(page.getByText("Stämmer med behandlingshistoriken")).toBeVisible();
    await expect(page.getByText("Bokförd – kan inte ändras")).toBeVisible();
    await axe(page);

    // PDF: the shared header comes from the company settings.
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Ladda ner PDF" }).click()]);
    const text = pdfText(readFileSync((await download.path())!)).join("\n");
    expect(text).toContain(company.legalName);
    expect(text).toContain("Org.nr 556036-0793 · Momsreg.nr SE556036079301 · Säte Göteborg");
    expect(text).toContain(`Verifikation ${ref}`);
    expect(text).toContain("Godkänd för F-skatt");

    // A received document: encrypted in the browser (vetKey docs-v1), stored in the vault,
    // linked to the voucher, then fetched and decrypted with its hash checked.
    await page.getByText("Koppla underlag").click();
    await page.locator("input[type=file][multiple]").setInputFiles({ name: "kvitto.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% e2e kvitto\n") });
    await expect(page.getByText("Underlaget är kopplat.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("listitem").filter({ hasText: "kvitto.pdf" }).first()).toBeVisible();
    // Shown only after decryption and the plaintext hash check passed.
    await page.getByRole("button", { name: "Öppna" }).click();
    const preview = page.getByRole("dialog", { name: "kvitto.pdf" });
    await expect(preview.locator("iframe")).toHaveAttribute("src", /^blob:/);
    await preview.getByRole("button", { name: "Stäng" }).click();

    // Correction: a reversing voucher in series C that links back.
    await page.getByRole("button", { name: "Rätta" }).click();
    const fix = page.getByRole("dialog", { name: "Rätta verifikation" });
    await fix.getByRole("button", { name: "Bokför rättelse" }).click();
    await expect(page.getByText(/^Rättelse C-\d+ bokförd\.$/).first()).toBeVisible();
    await expect(page.getByText("Rättad", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rätta" })).toHaveCount(0);

    // Lists and reports render and pass axe.
    for (const path of ["/admin/accounting/ledger", "/admin/accounting/ledger/journal", "/admin/accounting/ledger/general",
      "/admin/accounting/ledger/accounts/1930", "/admin/accounting/ledger/trial-balance", "/admin/accounting/settings/accounting", "/admin/accounting/settings/users"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "Laddar" })).toHaveCount(0);
      await axe(page);
    }
    await page.goto("/admin/accounting/ledger");
    await expect(page.getByRole("cell", { name: ref, exact: true }).or(page.getByText(ref, { exact: true })).first()).toBeVisible();
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  } finally { await revoke(); }
});

test("auditor: read-only banner, no create or correct actions", async ({ page, context }) => {
  const revoke = await signInWithRole(page, context, Role.auditor);
  try {
    await expect(page.getByText("Läsläge: du kan se allt men inte ändra något.")).toBeVisible();
    await expect(page.locator("summary", { hasText: "Ny" })).toHaveCount(0);
    await page.goto("/admin/accounting/ledger");
    await expect(page.getByRole("link", { name: "Ny verifikation" })).toHaveCount(0);
    await page.getByRole("row").nth(1).click();
    await expect(page.getByRole("heading", { name: /^Verifikation / })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rätta" })).toHaveCount(0);
    await expect(page.getByText("Koppla underlag")).toHaveCount(0);
    await axe(page);
  } finally { await revoke(); }
});
