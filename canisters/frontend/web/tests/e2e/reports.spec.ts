// Rapporter & export and Säkerhetskopia in the browser (A9c): SIE4 download, the checked
// behandlingshistorik, the systemdokumentation PDF, a backup with the passphrase rules, the
// check of that backup (restore refused: not empty), SIE4 import into the opening balances,
// and the new overview tiles; axe on each page.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Role } from "../../app/bindings/accounting";
import { encode437 } from "../../app/admin/accounting/sie4";
import { ensureOwnerAndYear, grant, ok, owner } from "../support/accounting";
import { signInWithLocalII } from "../support/local";

test.describe.configure({ timeout: 300_000 });

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

const text = (d: { createReadStream(): Promise<NodeJS.ReadableStream> }, enc: BufferEncoding = "latin1") =>
  d.createReadStream().then((s) => new Promise<Buffer>((resolve) => { const b: Buffer[] = []; s.on("data", (c: Buffer) => b.push(c)); s.on("end", () => resolve(Buffer.concat(b))); })).then((b) => b.toString(enc));

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  if (!ok(await owner.getCompany())) {
    ok(await owner.setCompany({
      legalName: "Test AB", orgNr: "556036-0793", vatNr: "SE556036079301", registeredOffice: "Göteborg", street: "Gatan 1",
      postalCode: "411 01", city: "Göteborg", country: "SE", email: "a@example.se", fSkatt: true,
    }));
  }
});

test("reports, backup and SIE4 import", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInWithLocalII(page, context);
  const revoke = await grant((await page.getByTestId("principal").textContent())!.trim(), Role.owner);
  try {
    await page.goto("/admin/accounting/reports");
    await expect(page.getByRole("heading", { level: 1, name: "Rapporter & export" })).toBeVisible();
    const [sie] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Ladda ner SIE4" }).click()]);
    expect(sie.suggestedFilename()).toMatch(/^5560360793_\d{4}\.se$/);
    const body = await text(sie);
    expect(body.startsWith("#FLAGGA 0\n#PROGRAM")).toBe(true);
    expect(body).toContain("#SIETYP 4");

    await page.getByRole("button", { name: "Visa behandlingshistorik" }).click();
    await expect(page.getByText(/^Kedjan är hel \(\d+ poster\)\.$/)).toBeVisible();
    await expect(page.getByRole("table", { name: "Behandlingshistorik" })).toBeVisible();
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Ladda ner systemdokumentation" }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/^systemdokumentation-.*\.pdf$/);
    await axe(page);

    // Backup: a weak passphrase keeps the button off; a strong one gives a .axbak file.
    await page.getByRole("link", { name: "Till säkerhetskopior" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Ta säkerhetskopia" })).toBeVisible();
    const pass = "Gröna-ängar-2026-vid-havet";
    await page.getByLabel("Lösenfras", { exact: true }).first().fill("kort");
    await page.getByLabel("Upprepa lösenfrasen").fill("kort");
    await expect(page.getByRole("button", { name: "Ta säkerhetskopia" })).toBeDisabled();
    await page.getByLabel("Lösenfras", { exact: true }).first().fill(pass);
    await page.getByLabel("Upprepa lösenfrasen").fill(pass);
    await axe(page);
    const [bk] = await Promise.all([page.waitForEvent("download", { timeout: 240_000 }), page.getByRole("button", { name: "Ta säkerhetskopia" }).click()]);
    expect(bk.suggestedFilename()).toMatch(/^axelkod-ekonomi-5560360793-\d{4}-\d{2}-\d{2}\.axbak$/);
    await expect(page.getByText(/^Säkerhetskopian .* är nedladdad\.$/)).toBeVisible();
    const file = await bk.path();

    // Check it: wrong passphrase first, then the right one; restore is refused here (not empty).
    await page.getByLabel("Säkerhetskopia (.axbak)").setInputFiles(file!);
    await page.getByLabel("Lösenfras", { exact: true }).nth(1).fill("fel lösenfras");
    await page.getByRole("button", { name: "Kontrollera" }).click();
    await expect(page.getByText("Fel lösenfras eller skadad fil.")).toBeVisible();
    await page.getByLabel("Lösenfras", { exact: true }).nth(1).fill(pass);
    await page.getByRole("button", { name: "Kontrollera" }).click();
    await expect(page.getByText(/^Kopian är hel: skapad \d{4}-\d{2}-\d{2} för /)).toBeVisible();
    await expect(page.getByRole("button", { name: "Återställ hit" })).toBeDisabled();
    await expect(page.getByText(/Den här installationen innehåller redan bokföring/)).toBeVisible();
    await axe(page);

    // SIE4 import: closing balances of the year before fill the opening-balance rows (not saved).
    await page.goto("/admin/accounting/year-end/opening");
    const input = page.getByLabel("Hämta från SIE4-fil");
    if (await input.isVisible()) {
      const y = new Date().getUTCFullYear() - 1;
      const sieText = `#FLAGGA 0\n#SIETYP 4\n#FNAMN "Förra systemet AB"\n#RAR 0 ${y}0101 ${y}1231\n#KONTO 1930 "Företagskonto"\n#UB 0 1930 1500.00\n#UB 0 2081 -1000.00\n#UB 0 2099 -500.00\n`;
      await input.setInputFiles({ name: "forra.se", mimeType: "text/plain", buffer: Buffer.from(encode437(sieText)) });
      await expect(page.getByText(/^3 rader hämtade från Förra systemet AB/)).toBeVisible();
      await expect(page.getByText(/Summa \(ska vara 0\):/)).toBeVisible();
    }
    await axe(page);

    await page.goto("/admin/accounting");
    await expect(page.getByText("Kundfordringar (1510)")).toBeVisible();
    await expect(page.getByText("Leverantörsskulder (2440)")).toBeVisible();
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  } finally {
    await revoke();
  }
});
