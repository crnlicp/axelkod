// Sales against the local accounting canister: customers, gapless invoice numbers,
// snapshot hash parity (browser acj-1 = canister), posting, credit notes, payments, quotes.
import { expect, test } from "@playwright/test";
import { DocKind, Lang, PaymentMethod, Variant_accepted_declined, Variant_person_company, type DocInput } from "../../app/bindings/accounting";
import { matches, snapshot } from "../../app/admin/accounting/encode";
import { ensureOwnerAndYear, ok, owner } from "../support/accounting";

test.describe.configure({ mode: "serial" });

const today = new Date().toISOString().slice(0, 10);
let customerId = 0n;

const input = (lines: DocInput["lines"], extra: Partial<DocInput> = {}): DocInput => ({
  customerId, language: Lang.sv, termsDays: 30n, currency: "SEK", lines, ...extra,
});
const line = (qty: bigint, price: bigint, vatCode = "U25", account = 3001n) => ({ description: "Konsulttimmar", quantity: qty, unit: "h", unitPrice: price, discountBp: 0n, vatCode, account });

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  if (!ok(await owner.getCompany())) {
    ok(await owner.setCompany({
      legalName: "Test AB", orgNr: "556036-0793", vatNr: "SE556036079301", registeredOffice: "Göteborg", street: "Gatan 1",
      postalCode: "411 01", city: "Göteborg", country: "SE", email: "a@example.se", fSkatt: true,
    }));
  }
  customerId = ok(await owner.saveCustomer(null, {
    kind: Variant_person_company.company, name: "Kund AB", orgNr: "556036-0793", address: { street: "Vägen 2", postalCode: "111 22", city: "Stockholm", country: "se" },
    termsDays: 30n, language: Lang.sv, reminderFeeAgreed: false, active: true,
  })).id;
});

test("invoices: gapless numbers, snapshot hash parity, voucher in series F", async () => {
  const d1 = ok(await owner.saveSalesDraft(null, DocKind.invoice, input([line(2_500n, 120_000n)]), null, null));
  const preview = ok(await owner.previewSalesDraft(d1.id));
  expect(preview.total).toBe(375_000n); // 2,5 h × 1 200 kr + 25 %
  const a = ok(await owner.issueSalesDraft(d1.id));
  const d2 = ok(await owner.saveSalesDraft(null, DocKind.invoice, input([line(1_000n, 50_000n)]), null, null));
  const b = ok(await owner.issueSalesDraft(d2.id));
  expect(b.doc.number).toBe(a.doc.number + 1n);
  expect(a.doc.number).toBe(preview.number);
  expect(await matches(snapshot(a.doc.snapshot), a.doc.contentHash)).toBe(true);
  expect(a.doc.snapshot.ocr).toMatch(/^\d+$/);
  expect(a.doc.snapshot.buyer.address.country).toBe("SE");
  expect(a.status.__kind__).toBe("issued");

  const v = ok(await owner.getVoucher(a.doc.voucherId!));
  expect(v.series).toBe("F");
  expect(v.lines.reduce((s, l) => s + l.amount, 0n)).toBe(0n);
  expect(v.lines.find((l) => l.account === 1510n)?.amount).toBe(375_000n);
  // The issue is audited with the snapshot's hash as detail.
  const trail = ok(await owner.auditFor("salesDoc", a.doc.id));
  expect(Buffer.from(trail[0].detailHash).equals(Buffer.from(a.doc.contentHash))).toBe(true);
  expect((await owner.issueSalesDraft(d1.id)).__kind__).toBe("err"); // the draft is gone
});

test("credit notes: partial, referenced, never more than the invoice", async () => {
  const docs = ok(await owner.listSalesDocs(DocKind.invoice, 0n, 1n));
  const inv = ok(await owner.getSalesDoc(docs.items[0].id));
  const draft = ok(await owner.creditDraftFrom(inv.doc.id));
  const half = { ...draft.input, lines: draft.input.lines.map((l) => ({ ...l, quantity: l.quantity / 2n })) };
  ok(await owner.saveSalesDraft(draft.id, DocKind.creditNote, half, inv.doc.id, null));
  const cn = ok(await owner.issueSalesDraft(draft.id));
  expect(cn.doc.snapshot.creditOf?.number).toBe(inv.doc.number);
  expect(cn.doc.number).toBe(inv.doc.number + 1n); // same series as invoices
  const after = ok(await owner.getSalesDoc(inv.doc.id));
  expect(after.credited).toBe(cn.doc.snapshot.total);
  const v = ok(await owner.getVoucher(cn.doc.voucherId!));
  expect(v.lines.find((l) => l.account === 1510n)?.amount).toBe(-cn.doc.snapshot.total);

  const again = ok(await owner.creditDraftFrom(inv.doc.id)); // full lines exceed what is left
  const err = await owner.issueSalesDraft(again.id);
  expect(err.__kind__ === "err" && err.err).toEqual({ __kind__: "invalid", invalid: "creditExceedsInvoice" });
  ok(await owner.deleteSalesDraft(again.id));
});

test("payments: balance, status paid, voucher 1930/1510, no overpayment", async () => {
  const docs = ok(await owner.listSalesDocs(DocKind.invoice, 0n, 5n));
  const target = docs.items.find((d) => d.balance > 0n && d.status.__kind__ === "issued")!;
  const over = await owner.registerPayment({ salesDocId: target.id, date: today, amount: target.balance + 1n, interest: 0n, fees: 0n, method: PaymentMethod.bankgiro });
  expect(over.__kind__).toBe("err");
  const p = ok(await owner.registerPayment({ salesDocId: target.id, date: today, amount: target.balance, interest: 0n, fees: 0n, method: PaymentMethod.bankgiro, reference: "OCR" }));
  const v = ok(await owner.getVoucher(p.voucherId));
  expect(v.series).toBe("B");
  expect(v.lines.find((l) => l.account === 1930n)?.amount).toBe(target.balance);
  const after = ok(await owner.getSalesDoc(target.id));
  expect(after.balance).toBe(0n);
  expect(after.status.__kind__).toBe("paid");
});

test("quotes: own numbering, accept, convert to an invoice draft", async () => {
  const d = ok(await owner.saveSalesDraft(null, DocKind.quote, input([line(1_000n, 10_000n)], { validUntil: today }), null, null));
  const q = ok(await owner.issueSalesDraft(d.id));
  expect(q.doc.voucherId).toBeUndefined();
  expect(q.status).toEqual({ __kind__: "quote", quote: "sent" });
  ok(await owner.setQuoteStatus(q.doc.id, Variant_accepted_declined.accepted));
  const inv = ok(await owner.invoiceDraftFromQuote(q.doc.id));
  expect(inv.quoteOf).toBe(q.doc.id);
  expect(inv.input.lines[0].unitPrice).toBe(10_000n);
  ok(await owner.deleteSalesDraft(inv.id));
});

test("mandatory content: EU services without the buyer's VAT number is refused", async () => {
  const eu = ok(await owner.saveCustomer(null, {
    kind: Variant_person_company.company, name: "GmbH", address: { street: "Str. 1", postalCode: "10115", city: "Berlin", country: "DE" },
    termsDays: 30n, language: Lang.en, reminderFeeAgreed: false, active: true,
  }));
  const d = ok(await owner.saveSalesDraft(null, DocKind.invoice, { ...input([line(1_000n, 10_000n, "EUTJ", 3308n)]), customerId: eu.id, language: Lang.en }, null, null));
  const r = await owner.issueSalesDraft(d.id);
  expect(r.__kind__ === "err" && r.err).toEqual({ __kind__: "invalid", invalid: "buyer.vatNr" });
  ok(await owner.saveCustomer(eu.id, { ...eu, vatNr: "de 123456789" }));
  const ok2 = ok(await owner.issueSalesDraft(d.id));
  expect(ok2.doc.snapshot.legalNotes).toEqual(["Reverse charge"]);
  expect(ok2.doc.snapshot.buyer.vatNr).toBe("DE123456789");
});
