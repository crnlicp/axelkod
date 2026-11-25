// Purchases, bank and tax account against the local accounting canister: inbox,
// booking per VAT treatment (series L), bank import with duplicates, suggestions,
// matching to invoices / supplier invoices / rules, and tax-account postings.
import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import {
  DocKind, Lang, PurchaseKind, TaxKind, Treatment, Variant_person_company, Variant_scan_email_upload, type PurchaseInput,
} from "../../app/bindings/accounting";
import { createActor as createVault } from "../../app/bindings/vault";
import { ensureOwnerAndYear, ok, owner, ownerId } from "../support/accounting";
import { agentOptions, ids } from "../support/local";

test.describe.configure({ mode: "serial" });

const vault = createVault(ids.vault, { agentOptions: { ...agentOptions, identity: ownerId } });
const today = new Date().toISOString().slice(0, 10);
const run = `${Date.now()}`;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest();
let supplierId = 0n;

async function attachment(name: string) {
  const cipher = randomBytes(500);
  const upload = ok(await vault.beginUpload({ mime: "application/pdf", size: 500n, chunkCount: 1n, cipherSha256: sha256(cipher) }));
  ok(await vault.putChunk(upload, 0n, cipher));
  const file = ok(await vault.finalize(upload));
  const ticket = ok(await owner.beginAttachment({
    filename: name, mime: "application/pdf", size: 472n, plainSha256: sha256(randomBytes(8)),
    wrappedKey: randomBytes(60), keyId: "docs-v1", receivedVia: Variant_scan_email_upload.upload,
  }));
  return ok(await owner.confirmAttachment(ticket, file.id));
}

const invoice = (attachmentIds: bigint[], extra: Partial<PurchaseInput> = {}): PurchaseInput => ({
  kind: PurchaseKind.supplierInvoice, supplierId, docDate: today, dueDate: today, docNumber: `L-${run}`, currency: "SEK",
  treatment: Treatment.domestic, lines: [{ account: 6212n, net: 80_000n, rateBp: 2500n, vat: 20_000n }], total: 100_000n,
  paymentRef: `9${run.slice(-6)}`, description: "Telefoni", attachmentIds, ...extra,
});

async function voucherLines(id: bigint) {
  return ok(await owner.getVoucher(id)).lines.map((l) => [Number(l.account), Number(l.amount)]);
}

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  if (!ok(await owner.getCompany())) {
    ok(await owner.setCompany({
      legalName: "Test AB", orgNr: "556036-0793", vatNr: "SE556036079301", registeredOffice: "Göteborg", street: "Gatan 1",
      postalCode: "411 01", city: "Göteborg", country: "SE", email: "a@example.se", fSkatt: true,
    }));
  }
  supplierId = ok(await owner.saveSupplier(null, { name: `Telia ${run}`, country: "se", treatment: Treatment.domestic, defaultAccount: 6212n, active: true })).id;
});

test("inbox → book a supplier invoice in series L; the file leaves the inbox and cannot be reused", async () => {
  const a = await attachment("faktura.pdf");
  expect(ok(await owner.listInbox()).some((x) => x.id === a.id)).toBe(true);
  const v = ok(await owner.bookPurchase(invoice([a.id])));
  const voucher = ok(await owner.getVoucher(v.purchase.voucherId!));
  expect(voucher.series).toBe("L");
  expect(voucher.attachmentIds).toEqual([a.id]);
  expect(await voucherLines(voucher.id)).toEqual([[2440, -100_000], [2641, 20_000], [6212, 80_000]]);
  expect(v.balance).toBe(100_000n);
  expect(ok(await owner.listInbox()).some((x) => x.id === a.id)).toBe(false);
  const again = await owner.bookPurchase(invoice([a.id]));
  expect(again.__kind__ === "err" && again.err).toEqual({ __kind__: "conflict", conflict: "attachment" });
  const none = await owner.bookPurchase(invoice([]));
  expect(none.__kind__ === "err" && none.err).toEqual({ __kind__: "invalid", invalid: "attachmentIds" });
});

test("EU services (reverse charge): 2645 and 2614, payable is the net; credit note reduces the balance", async () => {
  const v = ok(await owner.bookPurchase(invoice([(await attachment("eu.pdf")).id], {
    treatment: Treatment.euServices, lines: [{ account: 4535n, net: 100_000n, rateBp: 2500n, vat: 0n }], total: 100_000n, paymentRef: undefined,
  })));
  expect(await voucherLines(v.purchase.voucherId!)).toEqual([[2440, -100_000], [2614, -25_000], [2645, 25_000], [4535, 100_000]]);
  const cn = ok(await owner.bookPurchase(invoice([(await attachment("kredit.pdf")).id], {
    kind: PurchaseKind.creditNote, creditOf: v.purchase.id, treatment: Treatment.euServices,
    lines: [{ account: 4535n, net: 40_000n, rateBp: 2500n, vat: 0n }], total: 40_000n, dueDate: undefined, paymentRef: undefined,
  })));
  expect(await voucherLines(cn.purchase.voucherId!)).toEqual([[2440, 40_000], [2614, 10_000], [2645, -10_000], [4535, -40_000]]);
  expect(ok(await owner.getPurchase(v.purchase.id)).balance).toBe(60_000n);
});

test("bank: import skips duplicates; OCR, amount and rule suggestions; matches post B vouchers", async () => {
  const bankAccount = ok(await owner.listBankAccounts()).find((a) => a.ledgerAccount === 1930n)!;
  // An invoice with an OCR to pay.
  const customerId = ok(await owner.saveCustomer(null, {
    kind: Variant_person_company.company, name: `Kund ${run}`, address: { street: "Vägen 2", postalCode: "111 22", city: "Stockholm", country: "SE" },
    termsDays: 30n, language: Lang.sv, reminderFeeAgreed: false, active: true,
  })).id;
  const draft = ok(await owner.saveSalesDraft(null, DocKind.invoice, {
    customerId, language: Lang.sv, termsDays: 30n, currency: "SEK",
    lines: [{ description: "Tjänst", quantity: 1_000n, unit: "st", unitPrice: 80_000n, discountBp: 0n, vatCode: "U25", account: 3001n }],
  }, null, null));
  const sale = ok(await owner.issueSalesDraft(draft.id));
  const ocr = sale.doc.snapshot.ocr!;
  const supplier = ok(await owner.bookPurchase(invoice([(await attachment("el.pdf")).id], { total: 123_400n, lines: [{ account: 6212n, net: 98_720n, rateBp: 2500n, vat: 24_680n }], paymentRef: undefined })));

  const rows = [
    { date: today, amount: 100_000n, text: `BG INBET ${run}`, reference: ocr },
    { date: today, amount: -123_400n, text: `LEVERANTÖR ${run}` },
    { date: today, amount: -49_900n, text: `KORTKÖP TELIA${run}` },
  ];
  const first = ok(await owner.importBankRows(bankAccount.id, rows));
  expect([first.added, first.duplicates]).toEqual([3n, 0n]);
  const second = ok(await owner.importBankRows(bankAccount.id, rows));
  expect([second.added, second.duplicates]).toEqual([0n, 3n]);
  const txs = ok(await owner.listBankTxs(bankAccount.id, true, 0n, 500n)).items.filter((t) => t.text.includes(run));
  const byAmount = (a: bigint) => txs.find((t) => t.amount === a)!;

  const s1 = ok(await owner.suggestBankMatches(byAmount(100_000n).id));
  expect(s1[0]).toMatchObject({ reason: "ocr", target: { __kind__: "invoice", invoice: sale.doc.id } });
  ok(await owner.matchBankToInvoice(byAmount(100_000n).id, sale.doc.id, null));
  expect(ok(await owner.getSalesDoc(sale.doc.id)).status.__kind__).toBe("paid");

  const s2 = ok(await owner.suggestBankMatches(byAmount(-123_400n).id));
  expect(s2.some((s) => s.reason === "amount" && s.target.__kind__ === "purchase" && s.target.purchase === supplier.purchase.id)).toBe(true);
  const matched = ok(await owner.matchBankToPurchase(byAmount(-123_400n).id, supplier.purchase.id, null));
  expect(await voucherLines(matched.match!.voucherId)).toEqual([[1930, -123_400], [2440, 123_400]]);
  expect(ok(await owner.getPurchase(supplier.purchase.id)).status).toBe("paid");

  const rule = ok(await owner.saveBankRule(null, { contains: `telia${run}`, account: 6212n, vatRateBp: 2500n, description: "Telefon" }));
  const s3 = ok(await owner.suggestBankMatches(byAmount(-49_900n).id));
  expect(s3.some((s) => s.target.__kind__ === "rule" && s.target.rule === rule.id)).toBe(true);
  const booked = ok(await owner.bookBankTx(byAmount(-49_900n).id, rule.id, [], ""));
  const ruleVoucher = ok(await owner.getVoucher(booked.match!.voucherId));
  expect(ruleVoucher.series).toBe("B");
  expect(ruleVoucher.lines.map((l) => [Number(l.account), Number(l.amount)])).toEqual([[1930, -49_900], [6212, 39_920], [2641, 9_980]]);
  expect((await owner.bookBankTx(byAmount(-49_900n).id, rule.id, [], "")).__kind__).toBe("err");
  expect(ok(await owner.listBankTxs(bankAccount.id, true, 0n, 500n)).items.filter((t) => t.text.includes(run))).toEqual([]);
  ok(await owner.deleteBankRule(rule.id));
});

test("tax account: VAT and interest booked against 1630, the deposit linked to the bank voucher", async () => {
  const bankAccount = ok(await owner.listBankAccounts()).find((a) => a.ledgerAccount === 1930n)!;
  const deposit = 37_500n + BigInt(run.slice(-3));
  const imp = ok(await owner.importTaxRows([
    { date: today, amount: -deposit, text: `Moms ${run}`, kind: TaxKind.vat },
    { date: today, amount: 1_00n, text: `Intäktsränta ${run}`, kind: TaxKind.interestIncome },
    { date: today, amount: deposit, text: `Inbetalning bokförd ${run}`, kind: TaxKind.payment },
  ]));
  expect(imp.added).toBe(3n);
  const entries = ok(await owner.listTaxEntries(0n, 500n)).items.filter((e) => e.text.includes(run));
  const of = (k: TaxKind) => entries.find((e) => e.kind === k)!;
  const vat = ok(await owner.bookTaxEntry(of(TaxKind.vat).id, null));
  expect(await voucherLines(vat.voucherId!)).toEqual([[1630, -Number(deposit)], [2650, Number(deposit)]]);
  const interest = ok(await owner.bookTaxEntry(of(TaxKind.interestIncome).id, null));
  expect(await voucherLines(interest.voucherId!)).toEqual([[1630, 100], [8314, -100]]);
  expect((await owner.bookTaxEntry(of(TaxKind.payment).id, null)).__kind__).toBe("err");
  // The payment from the bank, booked from the bank side, then linked on the tax account.
  ok(await owner.importBankRows(bankAccount.id, [{ date: today, amount: -deposit, text: `SKATTEVERKET ${run}` }]));
  const tx = ok(await owner.listBankTxs(bankAccount.id, true, 0n, 500n)).items.find((t) => t.text === `SKATTEVERKET ${run}`)!;
  const paid = ok(await owner.bookBankTx(tx.id, null, [{ account: 1630n, amount: deposit }], "Inbetalning skattekonto"));
  const linked = ok(await owner.linkTaxEntry(of(TaxKind.payment).id, paid.match!.voucherId));
  expect(linked.voucherId).toBe(paid.match!.voucherId);
  const summary = ok(await owner.taxAccountSummary());
  expect(typeof summary.ledger).toBe("bigint");
});
