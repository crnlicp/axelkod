// Bokslut against the local accounting canister (A9b): the checklist, opening balances on the
// next year, the tax preview (20,6 %, fund ≤ 25 %), the closing voucher in series X, the
// refusals (no parameters for 2027, locking before the year has ended), and the SRU files
// from the booked year.
import { expect, test } from "@playwright/test";
import { FiscalYearStatus, StepState, Variant_bank_taxAccount } from "../../app/bindings/accounting";
import { ink2r, sruFiles } from "../../app/admin/accounting/sru";
import { forms } from "../../app/admin/accounting/yearend";
import { ensureOwnerAndYear, ok, owner } from "../support/accounting";

test.describe.configure({ mode: "serial" });

const year = new Date().getUTCFullYear();
let fyId = 0n;
let nextId = 0n;

test.beforeAll(async () => {
  fyId = await ensureOwnerAndYear();
  if (!ok(await owner.getCompany())) {
    ok(await owner.setCompany({
      legalName: "Test AB", orgNr: "556036-0793", vatNr: "SE556036079301", registeredOffice: "Göteborg", street: "Gatan 1",
      postalCode: "411 01", city: "Göteborg", country: "SE", email: "a@example.se", fSkatt: true,
    }));
  }
  const years = ok(await owner.listFiscalYears());
  nextId = years.find((y) => y.start === `${year + 1}-01-01`)?.id ?? ok(await owner.createFiscalYear(`${year + 1}-01-01`, `${year + 1}-12-31`, false)).id;
});

test("checklist: every step reported, lock refused before the year has ended", async () => {
  const st = ok(await owner.yearEndStatus(fyId));
  expect(st.steps.map((s) => s.id)).toEqual(["inventory", "depreciation", "accruals", "cash", "bank", "taxAccount", "vat", "payroll", "tax", "lock", "transfer"]);
  expect(st.steps.find((s) => s.id === "lock")?.state).toBe(StepState.todo);
  const r = await owner.lockFiscalYear(fyId);
  expect(r.__kind__ === "err" && r.err).toEqual({ __kind__: "invalid", invalid: "notEnded" });
  // A statement balance equal to the ledger completes the bank step.
  const bank = st.steps.find((s) => s.id === "bank")!;
  ok(await owner.setStatementBalance(fyId, Variant_bank_taxAccount.bank, bank.amount ?? 0n));
  expect(ok(await owner.yearEndStatus(fyId)).steps.find((s) => s.id === "bank")?.state).toBe(StepState.done);
  ok(await owner.confirmYearEndStep(fyId, "accruals", true));
  expect(ok(await owner.yearEndStatus(fyId)).closing.confirmed).toContain("accruals");
  expect((await owner.confirmYearEndStep(fyId, "lock", true)).__kind__).toBe("err");
});

test("opening balances: balanced, balance-sheet accounts only; read back", async () => {
  const bad = await owner.setOpeningBalances(nextId, [{ account: 1930n, amount: 100n }]);
  expect(bad.__kind__ === "err" && bad.err).toEqual({ __kind__: "invalid", invalid: "unbalanced" });
  const pl = await owner.setOpeningBalances(nextId, [{ account: 3001n, amount: 100n }, { account: 1930n, amount: -100n }]);
  expect(pl.__kind__ === "err" && pl.err).toEqual({ __kind__: "invalid", invalid: "lines[0].account" });
  const lines = [{ account: 1930n, amount: 5_000_000n }, { account: 2081n, amount: -2_500_000n }, { account: 2098n, amount: -2_500_000n }];
  ok(await owner.setOpeningBalances(nextId, lines));
  expect(ok(await owner.openingBalances(nextId))).toEqual(lines);
  ok(await owner.setOpeningBalances(nextId, []));
});

test("tax: preview from the ledger, fund at most 25 %, no parameters for next year", async () => {
  const st = ok(await owner.yearEndStatus(fyId));
  const none = { deficitIn: 0n, fund: 0n, otherAdd: 0n, otherDeduct: 0n };
  const later = await owner.previewYearEndTax(nextId, none);
  expect(later.__kind__ === "err" && later.err).toEqual({ __kind__: "invalid", invalid: "taxParams" });
  if (st.closing.closingVoucherId !== undefined) return; // booked by an earlier run
  const c = ok(await owner.previewYearEndTax(fyId, none));
  expect(c.params.corporateTaxBp).toBe(2060n);
  expect(c.taxable % 1000n).toBe(0n);
  expect(c.tax).toBe((c.taxable * 2060n) / 10_000n);
  const tooMuch = await owner.previewYearEndTax(fyId, { ...none, fund: c.fundMax + 100n });
  expect(tooMuch.__kind__ === "err" && tooMuch.err).toEqual({ __kind__: "invalid", invalid: "fund" });
});

test("closing voucher in series X; the result moves to 2099 and the SRU files follow", async () => {
  let st = ok(await owner.yearEndStatus(fyId));
  if (st.closing.closingVoucherId === undefined) {
    // A sale of 100 000 kr so there is a result to close.
    ok(await owner.postVoucher({
      series: "A", eventDate: `${year}-06-30`, description: "Försäljning inför bokslut", attachmentIds: [],
      lines: [{ account: 1930n, amount: 12_500_000n }, { account: 3001n, amount: -10_000_000n }, { account: 2611n, amount: -2_500_000n, vatCode: "U25" }],
    }));
    const c = ok(await owner.previewYearEndTax(fyId, { deficitIn: 0n, fund: 0n, otherAdd: 0n, otherDeduct: 0n }));
    const fund = c.fundMax > 0n ? (c.fundMax / 2n / 100n) * 100n : 0n;
    st = { ...st, closing: ok(await owner.bookYearEnd(fyId, { deficitIn: 0n, fund, otherAdd: 0n, otherDeduct: 0n })) };
    const again = await owner.bookYearEnd(fyId, { deficitIn: 0n, fund: 0n, otherAdd: 0n, otherDeduct: 0n });
    expect(again.__kind__ === "err" && again.err).toEqual({ __kind__: "conflict", conflict: "yearEndBooked" });
  }
  const calc = st.closing.tax!;
  const v = ok(await owner.getVoucher(st.closing.closingVoucherId!));
  expect(v.series).toBe("X");
  expect(v.eventDate).toBe(`${year}-12-31`);
  expect(v.lines.reduce((s, l) => s + l.amount, 0n)).toBe(0n);
  expect(v.lines.find((l) => l.account === 2099n)?.amount ?? 0n).toBe(-calc.resultAfterTax);
  expect(ok(await owner.listFiscalYears()).find((y) => y.id === fyId)?.status).not.toBe(FiscalYearStatus.open);

  // INK2R from the canister's balances adds up to the booked result; the files carry it.
  const rows = ok(await owner.balances(fyId));
  const bal = new Map(rows.map((r) => [Number(r.account), r.months.reduce((a, x) => a + x, 0n)]));
  const r = ink2r(bal);
  const result = (r.get(7450) ?? 0n) - (r.get(7550) ?? 0n);
  expect(result - calc.resultAfterTax / 100n).toBeLessThanOrEqual(20n);
  const company = ok(await owner.getCompany())!;
  const out = sruFiles({ orgNr: company.orgNr, name: company.legalName, postalCode: company.postalCode, city: company.city, start: `${year}-01-01`, end: `${year}-12-31`, created: new Date(), forms: forms(r, calc) });
  expect(out.blanketterText).toContain(`#BLANKETT INK2R-${year}P4`);
  expect(out.infoText).toContain(`#ORGNR 16${company.orgNr.replace("-", "")}`);
});
