// Moms end to end (A6): the period list and stepper, the box table, the XML download of
// a locked period (built from the stored return), the EU sales list page. Axe on each.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Role } from "../../app/bindings/accounting";
import { boxValue } from "../../app/admin/accounting/vat";
import { ensureOwnerAndYear, grant, ok, owner } from "../support/accounting";
import { signInWithLocalII } from "../support/local";

test.describe.configure({ mode: "serial", timeout: 240_000 });

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.beforeAll(async () => { await ensureOwnerAndYear(); });

test("VAT return: periods, boxes, stepper, XML of a locked period; EU sales list", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInWithLocalII(page, context);
  const revoke = await grant((await page.getByTestId("principal").textContent())!.trim(), Role.owner);
  try {
    await page.goto("/admin/accounting/vat");
    await expect(page.getByRole("navigation", { name: "Perioder" })).toBeVisible();
    await expect(page.getByRole("table", { name: /A\. Momspliktig försäljning/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("cell", { name: "Ingående moms att dra av" })).toBeVisible();
    await axe(page);

    // A locked period (vat-api.spec.ts locks one): the file step offers the XML.
    const r = ok(await owner.listVatReturns())[0];
    if (r) {
      await page.goto(`/admin/accounting/vat?p=${r.from}`);
      await expect(page.getByText(`(${r.from} – ${r.to})`)).toBeVisible();
      await page.getByRole("button", { name: /Ladda ner fil/ }).click();
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Ladda ner XML-fil" }).click();
      const xml = (await readFile(await (await download).path())).toString("latin1");
      expect(xml).toContain('<eSKDUpload Version="6.0">');
      expect(xml).toContain(`<MomsBetala>${boxValue(r.boxes, 49)}</MomsBetala>`);
      await expect(page.getByRole("link", { name: `#${r.settlementVoucherId}` })).toBeVisible();
      await axe(page);
    }

    await page.getByRole("link", { name: "Periodisk sammanställning" }).click();
    await expect(page.getByLabel("Redovisningsperiod")).toBeVisible();
    await page.getByLabel("Redovisningsperiod").selectOption("q");
    await expect(page.getByRole("status").filter({ hasText: "Laddar" })).toHaveCount(0);
    await axe(page);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  } finally {
    await revoke();
  }
});
