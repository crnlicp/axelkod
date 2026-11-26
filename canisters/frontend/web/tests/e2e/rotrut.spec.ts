// ROT/RUT end to end (A8): a RUT invoice made in the editor (buyer encrypted in the
// browser with pii-v1), the deduction from the canister's preview, the invoice PDF with
// the buyer, payment, a case, a claim with its buyers decrypted and the XML file. Axe on
// every ROT/RUT page. The claim and case are removed at the end to keep local data tidy.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Lang, PaymentMethod, Role, Variant_person_company } from "../../app/bindings/accounting";
import { ensureOwnerAndYear, grant, ok, owner } from "../support/accounting";
import { signInWithLocalII } from "../support/local";
import { pdfText } from "../support/pdf-text";

test.describe.configure({ mode: "serial", timeout: 240_000 });

const run = Date.now() % 100000;
const customer = `Hushåll ${run}`;
const today = new Date().toISOString().slice(0, 10);

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  const s = ok(await owner.getSettings()).settings;
  if (!s.modules.rotRut) ok(await owner.setSettings({ ...s, modules: { ...s.modules, rotRut: true } }));
  ok(await owner.saveCustomer(null, {
    kind: Variant_person_company.person, name: customer, address: { street: "Vägen 2", postalCode: "111 22", city: "Stockholm", country: "SE" },
    termsDays: 30n, language: Lang.sv, reminderFeeAgreed: false, active: true,
  }));
});

test("RUT invoice → PDF with buyer → payment → case → claim → XML", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInWithLocalII(page, context);
  const revoke = await grant((await page.getByTestId("principal").textContent())!.trim(), Role.owner);
  try {
    await page.goto("/admin/accounting/sales/new?kind=invoice");
    await page.getByLabel("Kund", { exact: true }).selectOption({ label: customer });
    await page.getByLabel("Beskrivning rad 1").fill("Datorhjälp i hemmet");
    await page.getByLabel("Antal rad 1").fill("2");
    await page.getByLabel("À-pris rad 1").fill("1 000");
    await page.getByLabel("Fakturan har ROT- eller RUT-avdrag").check();
    await page.getByLabel("ROT/RUT, rad 1").selectOption("labour");
    await page.getByLabel("Typ av arbete, rad 1").selectOption("IT_TJANSTER");
    await page.getByLabel("Namn, köpare 1").fill("Anna Andersson");
    await page.getByLabel("Personnummer, köpare 1").fill("19820225-2386");
    await page.getByRole("button", { name: "Kontrollera" }).click();
    // 2 000 kr + 25 % = 2 500 kr labour → RUT 50 % = 1 250 kr; the customer pays 1 250 kr.
    const totals = page.getByRole("complementary");
    await expect(totals.getByText("Avdrag (RUT)")).toBeVisible({ timeout: 60_000 });
    await expect(totals.getByText(/1\s250,00 SEK/)).toBeVisible();
    await axe(page);
    await page.getByRole("button", { name: "Utfärda faktura" }).click();
    const sheet = page.getByRole("dialog", { name: "Utfärda faktura" });
    await expect(sheet.getByText("1513")).toBeVisible();
    await sheet.getByRole("button", { name: "Utfärda faktura" }).click();

    await expect(page.getByRole("heading", { name: /^Faktura \d+$/ })).toBeVisible();
    const number = (await page.getByRole("heading", { name: /^Faktura \d+$/ }).textContent())!.replace("Faktura ", "");
    const id = BigInt(page.url().split("/docs/")[1].split("?")[0]);
    await expect(page.getByText("Kunden betalar")).toBeVisible();
    await axe(page);
    const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Ladda ner PDF" }).first().click()]);
    const pdf = pdfText(readFileSync((await d.path())!)).join("\n");
    expect(pdf).toContain("Skattereduktion för rutarbete");
    expect(pdf).toContain("Anna Andersson, 198202252386");

    ok(await owner.registerPayment({ salesDocId: id, date: today, amount: 125_000n, interest: 0n, fees: 0n, method: PaymentMethod.swish }));
    await page.goto(`/admin/accounting/rot-rut?invoice=${id}`);
    const dlg = page.getByRole("dialog", { name: "Nytt ärende" });
    await dlg.getByLabel("Arbetade timmar, It-tjänster").fill("2");
    await axe(page);
    await dlg.getByRole("button", { name: "Skapa ärende" }).click();
    await expect(page.getByText("Ärendet är skapat.").first()).toBeVisible({ timeout: 60_000 });
    await axe(page);

    await page.goto("/admin/accounting/rot-rut/claims");
    await page.getByLabel("Namn på begäran (högst 16 tecken)").fill(`E2E ${run}`);
    await page.getByLabel(new RegExp(`Faktura ${number} `)).check();
    await axe(page);
    await page.getByRole("button", { name: "Skapa begäran" }).click();
    await expect(page.getByText("Begäran är skapad.").first()).toBeVisible({ timeout: 60_000 });
    await axe(page);
    await page.getByRole("button", { name: /Köpare & fastighet/ }).click();
    await page.getByRole("button", { name: "Visa köpare och bostad" }).click();
    await expect(page.getByText(/Anna Andersson, 198202252386/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Köparna är kontrollerade/)).toBeVisible();
    await axe(page);
    await page.getByRole("button", { name: /Skapa fil/ }).click();
    const [x] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Ladda ner XML-fil" }).click()]);
    const xml = readFileSync((await x.path())!, "utf8");
    expect(xml).toContain("<p:Kopare>198202252386</p:Kopare>");
    expect(xml).toContain("<p:BegartBelopp>1250</p:BegartBelopp>");

    await page.goto("/admin/accounting/rot-rut/settings");
    await expect(page.getByRole("status").filter({ hasText: "Laddar" })).toHaveCount(0);
    await axe(page);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  } finally {
    // Leave no open claim or case behind (also after a failed run).
    for (const c of ok(await owner.listHusClaims()).filter((c) => c.name.startsWith("E2E ") && !c.submittedDate)) ok(await owner.deleteHusClaim(c.id));
    for (const c of ok(await owner.listHusCases()).filter((c) => c.status === "draft")) ok(await owner.cancelHusCase(c.id));
    await revoke();
  }
});
