// Bokslut in the browser (A9b): the checklist with the bank reconciliation, the K2 statements
// and PDF, the SRU files (once year-end is posted), the opening balances page; axe on each.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Role } from "../../app/bindings/accounting";
import { ensureOwnerAndYear, grant, ok, owner } from "../support/accounting";
import { signInWithLocalII } from "../support/local";

test.describe.configure({ timeout: 180_000 });

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  if (!ok(await owner.getCompany())) {
    ok(await owner.setCompany({
      legalName: "Test AB", orgNr: "556036-0793", vatNr: "SE556036079301", registeredOffice: "Göteborg", street: "Gatan 1",
      postalCode: "411 01", city: "Göteborg", country: "SE", email: "a@example.se", fSkatt: true,
    }));
  }
});

test("checklist, statements, SRU files and opening balances", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInWithLocalII(page, context);
  const revoke = await grant((await page.getByTestId("principal").textContent())!.trim(), Role.owner);
  try {
    await page.goto("/admin/accounting/year-end");
    await expect(page.getByRole("heading", { level: 1, name: "Bokslut" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Bokslut" }).first().getByRole("link", { name: "Checklista" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Inkomstdeklaration 2 (digitalt)")).toBeVisible();

    // Bank: enter the ledger balance from the statement; the step reports a match.
    await page.getByRole("button", { name: /Stäm av bankkontot/ }).click();
    const ledger = (await page.getByText(/^Bokfört saldo:/).textContent())!.replace(/^Bokfört saldo:\s*/, "").replace(/\s*kr$/, "");
    await page.getByLabel("Saldo enligt bankens kontoutdrag på årets sista dag").fill(ledger);
    await page.getByRole("button", { name: "Spara saldo" }).click();
    await expect(page.getByText("Saldona stämmer.")).toBeVisible();

    await page.getByRole("button", { name: /Skatt och bokslutsdispositioner/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Skatt och bokslutsdispositioner" })).toBeVisible();
    await axe(page);

    await page.getByRole("link", { name: "Rapporter och deklaration" }).click();
    await expect(page.getByRole("table", { name: "Resultaträkning" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Balansräkning" })).toContainText("Summa tillgångar");
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Resultat- och balansräkning (PDF)" }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/^resultat-och-balansrakning-\d{4}\.pdf$/);
    if (await page.getByRole("button", { name: "BLANKETTER.SRU" }).isVisible()) {
      const [info] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "INFO.SRU" }).click()]);
      expect(info.suggestedFilename()).toBe("INFO.SRU");
      const [forms] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "BLANKETTER.SRU" }).click()]);
      expect(forms.suggestedFilename()).toBe("BLANKETTER.SRU");
      const text = await new Promise<string>((resolve) => forms.createReadStream().then((s) => { let b = ""; s.on("data", (c) => (b += c.toString("latin1"))); s.on("end", () => resolve(b)); }));
      expect(text).toMatch(/^#BLANKETT INK2-\d{4}P4\n/);
      expect(text.trimEnd().endsWith("#FIL_SLUT")).toBe(true);
    }
    await axe(page);

    await page.getByRole("link", { name: "Ingående balanser" }).click();
    await expect(page.getByText(/Ingående balans per balanskonto/)).toBeVisible();
    await axe(page);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  } finally {
    await revoke();
  }
});
