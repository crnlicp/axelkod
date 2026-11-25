// Browser-side Inköp/Bank helpers: the booking preview matches the canister's rules,
// and bank CSV parsing (quotes, decimal comma, dates, bad rows).
import { expect, test } from "@playwright/test";
import { PurchaseKind, TaxKind, Treatment, type PurchaseInput } from "../../app/bindings/accounting";
import { bankRows, guessDelimiter, guessTaxKind, parseCsv, parseDate, previewLines, suggestedAccount } from "../../app/admin/accounting/purchases";

const doc = (x: Partial<PurchaseInput>): PurchaseInput => ({
  kind: PurchaseKind.supplierInvoice, supplierId: 1n, docDate: "2026-11-02", currency: "SEK", treatment: Treatment.domestic,
  lines: [], total: 0n, description: "x", attachmentIds: [1n], ...x,
});
const pairs = (x: PurchaseInput) => previewLines(x).map((l) => [Number(l.account), Number(l.amount)]);

test("preview: domestic, EU goods (Skatteverket's 55 000 kr example), receipt in cash, credit note", () => {
  expect(pairs(doc({ lines: [{ account: 6212n, net: 80_000n, rateBp: 2500n, vat: 20_000n }], total: 100_000n }))).toEqual([[2440, -100_000], [2641, 20_000], [6212, 80_000]]);
  expect(pairs(doc({ treatment: Treatment.euGoods, lines: [{ account: 4515n, net: 5_500_000n, rateBp: 2500n, vat: 0n }], total: 5_500_000n })))
    .toEqual([[2440, -5_500_000], [2614, -1_375_000], [2645, 1_375_000], [4515, 5_500_000]]);
  expect(pairs(doc({ kind: PurchaseKind.receipt, paidFrom: "cash" as never, lines: [{ account: 6110n, net: 4_000n, rateBp: 2500n, vat: 1_000n }], total: 5_000n })))
    .toEqual([[1910, -5_000], [2641, 1_000], [6110, 4_000]]);
  expect(pairs(doc({ kind: PurchaseKind.creditNote, treatment: Treatment.seServicesRC, lines: [{ account: 4425n, net: 40_000n, rateBp: 2500n, vat: 0n }], total: 40_000n })))
    .toEqual([[2440, 40_000], [2614, 10_000], [2647, -10_000], [4425, -40_000]]);
  expect(suggestedAccount(Treatment.nonEuServices, 1200n)).toBe(4532n);
  expect(suggestedAccount(Treatment.domestic, 2500n)).toBeNull();
});

test("CSV: quotes, semicolons, decimal comma, Swedish and ISO dates; bad rows reported", () => {
  const text = 'Bokföringsdag;Belopp;Text;Referens\r\n2026-11-02;"-1 234,56";"Telia; faktura";12351\r\n02.11.2026;500,00;Insättning;\r\nnot a date;1;x;\r\n';
  expect(guessDelimiter(text)).toBe(";");
  const table = parseCsv(text, ";");
  expect(table[1]).toEqual(["2026-11-02", "-1 234,56", "Telia; faktura", "12351"]);
  const r = bankRows(table, { delimiter: ";", skipRows: 1n, dateCol: 0n, amountCol: 1n, textCol: 2n, referenceCol: 3n, decimalComma: true });
  expect(r.rows).toEqual([
    { date: "2026-11-02", amount: -123_456n, text: "Telia; faktura", reference: "12351", counterparty: undefined },
    { date: "2026-11-02", amount: 50_000n, text: "Insättning", reference: undefined, counterparty: undefined },
  ]);
  expect(r.errors).toEqual([4]);
  expect(parseDate("20261102")).toBe("2026-11-02");
  expect(parseDate("2026-02-30")).toBeNull();
});

test("tax-account kind guess is only a first guess from the text", () => {
  expect(guessTaxKind("Intäktsränta", 100n)).toBe(TaxKind.interestIncome);
  expect(guessTaxKind("Moms nov 2026", -100n)).toBe(TaxKind.vat);
  expect(guessTaxKind("Inbetalning bokförd 261112", 100n)).toBe(TaxKind.payment);
  expect(guessTaxKind("Något annat", -1n)).toBe(TaxKind.other);
});
