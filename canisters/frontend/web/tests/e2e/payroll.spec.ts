// Lön end to end (A7): an employee saved through the dialog (personnummer encrypted in
// the browser with pii-v1, shown again on "Visa"), a pay run calculated by the canister,
// the review and the payslip PDF. Axe on every Lön page.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Role } from "../../app/bindings/accounting";
import { parseTaxTables } from "../../app/admin/accounting/payroll";
import { ensureOwnerAndYear, grant, ok, owner } from "../support/accounting";
import { signInWithLocalII } from "../support/local";

test.describe.configure({ mode: "serial", timeout: 240_000 });

const run = Date.now() % 100000;
const name = `E2E Anställd ${run}`;

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  const text = readFileSync(new URL("../fixtures/agi/allmanna-tabeller-manad-2026.txt", import.meta.url), "utf8");
  ok(await owner.importTaxTable(2026n, 33n, parseTaxTables(text).get(33)!, new Uint8Array(32).fill(1)));
});

test("employee with encrypted personnummer → pay run → review → payslip", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInWithLocalII(page, context);
  const revoke = await grant((await page.getByTestId("principal").textContent())!.trim(), Role.owner);
  try {
    await page.goto("/admin/accounting/payroll/employees");
    await expect(page.getByRole("status").filter({ hasText: "Laddar" })).toHaveCount(0);
    await axe(page);
    await page.getByRole("button", { name: "Ny anställd" }).click();
    const dialog = page.getByRole("dialog", { name: "Ny anställd" });
    await dialog.getByLabel("Namn", { exact: true }).fill(name);
    await dialog.getByLabel("Personnummer").fill("19820225-2386");
    await dialog.getByRole("textbox", { name: "Lön" }).fill("32 000");
    await expect(dialog.getByText("Kolumn 1")).toBeVisible();
    await axe(page);
    await dialog.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByText("Den anställda är sparad.")).toBeVisible({ timeout: 60_000 });
    const row = page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: `Visa ${name}` }).click();
    await expect(row.getByText("198202252386")).toBeVisible({ timeout: 60_000 });

    // A run on the 25th: the canister calculates tax from table 33 and the fees.
    await page.goto("/admin/accounting/payroll");
    await axe(page);
    await page.getByRole("button", { name: "Ny lönekörning" }).click();
    await expect(page.getByRole("heading", { name: /Lönekörning \d{6}/ })).toBeVisible({ timeout: 60_000 });
    const legend = page.getByRole("group", { name });
    await expect(legend.getByRole("combobox", { name: `Löneart rad 1, ${name}` })).toHaveValue("LON");
    await axe(page);
    await page.getByRole("button", { name: "Spara och beräkna" }).click();
    await expect(page.getByText("Beräknat och sparat.")).toBeVisible();
    const slip = page.getByRole("row").filter({ hasText: name });
    await expect(slip.getByText("32 000,00")).toBeVisible();
    await expect(slip.getByText("Full avgift 31,42 %")).toBeVisible();
    await expect(slip.getByText("10 054,40")).toBeVisible(); // 31,42 % of 32 000
    const download = page.waitForEvent("download");
    await slip.getByRole("button", { name: "Lönespecifikation (PDF)" }).click();
    expect((await download).suggestedFilename()).toMatch(/^lonespecifikation-\d{6}-\d+\.pdf$/);
    await axe(page);
    // Leave no draft behind: a draft blocks the period's employer return.
    await page.getByRole("button", { name: "Underlag" }).click();
    await page.getByRole("button", { name: "Radera utkast" }).click();
    await expect(page).toHaveURL(/\/admin\/accounting\/payroll$/);

    for (const path of ["/admin/accounting/payroll/agi", "/admin/accounting/payroll/vaxa", "/admin/accounting/payroll/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("status").filter({ hasText: "Laddar" })).toHaveCount(0);
      await axe(page);
    }
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  } finally {
    await revoke();
  }
});
