// ROT/RUT against the local accounting canister (V12): a RUT invoice with the deduction
// on labour incl. VAT, the receivable split 1510/1513, the full-credit rule, partial
// payments claimed in the same share, a claim with its XML valid against the XSD, and
// Skatteverket's decision booked (payout, and a refused part moved back to the customer).
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { validateXML } from "xmllint-wasm";
import { DocKind, HusKind, Lang, PaymentMethod, Variant_person_company, type DocInput } from "../../app/bindings/accounting";
import { matches, snapshot } from "../../app/admin/accounting/encode";
import { claimXml } from "../../app/admin/accounting/rotrut";
import { ensureOwnerAndYear, ok, owner } from "../support/accounting";

test.describe.configure({ mode: "serial" });

const fx = (p: string) => readFileSync(new URL(`../fixtures/${p}`, import.meta.url), "utf8");
const today = new Date().toISOString().slice(0, 10);
const run = Date.now() % 100000;
// The canister stores ciphertext only; a stand-in blob is enough here.
const enc = new TextEncoder().encode(`enc:${run}`);
let customerId = 0n;
let invoiceId = 0n;
let cash = false;

const line = (qty: bigint, price: bigint, description: string) => ({ description, quantity: qty, unit: "h", unitPrice: price, discountBp: 0n, vatCode: "U25", account: 3001n });
const input = (): DocInput => ({
  customerId, language: Lang.sv, termsDays: 30n, currency: "SEK",
  lines: [line(2_000n, 100_000n, "It-support i hemmet"), line(1_000n, 20_000n, "Resa")],
  hus: {
    kind: HusKind.rut, lineParts: [{ __kind__: "labour", labour: "IT_TJANSTER" }, { __kind__: "other", other: null }],
    buyers: [{ identityEnc: enc, shareBp: 10_000n }],
  },
});

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  if (!ok(await owner.getCompany())) {
    ok(await owner.setCompany({
      legalName: "Test AB", orgNr: "556036-0793", vatNr: "SE556036079301", registeredOffice: "Göteborg", street: "Gatan 1",
      postalCode: "411 01", city: "Göteborg", country: "SE", email: "a@example.se", fSkatt: true,
    }));
  }
  const s = ok(await owner.getSettings()).settings;
  cash = s.accountingMethod === "cash";
  if (!s.modules.rotRut) ok(await owner.setSettings({ ...s, modules: { ...s.modules, rotRut: true } }));
  customerId = ok(await owner.saveCustomer(null, {
    kind: Variant_person_company.person, name: `Privat ${run}`, address: { street: "Vägen 2", postalCode: "111 22", city: "Stockholm", country: "SE" },
    termsDays: 30n, language: Lang.sv, reminderFeeAgreed: false, active: true,
  })).id;
});

test("RUT invoice: 50 % of labour incl. VAT; 1510 the customer's part, 1513 the deduction; full credit only", async () => {
  const d = ok(await owner.saveSalesDraft(null, DocKind.invoice, input(), null, null));
  const p = ok(await owner.previewSalesDraft(d.id));
  // 2 h × 1 000 kr + 25 % = 2 500 kr labour → 1 250 kr; travel 200 kr + VAT is not labour.
  expect(p.hus?.deduction).toBe(125_000n);
  expect(p.hus?.other).toBe(25_000n);
  expect(p.total).toBe(275_000n);
  const v = ok(await owner.issueSalesDraft(d.id));
  invoiceId = v.doc.id;
  expect(v.payable).toBe(150_000n);
  expect(v.balance).toBe(150_000n);
  expect(await matches(snapshot(v.doc.snapshot), v.doc.contentHash)).toBe(true);
  if (!cash) {
    const vo = ok(await owner.getVoucher(v.doc.voucherId!));
    expect(vo.lines.find((l) => l.account === 1510n)?.amount).toBe(150_000n);
    expect(vo.lines.find((l) => l.account === 1513n)?.amount).toBe(125_000n);
  }
  // A company customer or another currency cannot have the deduction.
  const bad = ok(await owner.saveSalesDraft(null, DocKind.invoice, { ...input(), currency: "EUR", fxRate: { rate: 11_000_000n, date: today } }, null, null));
  expect((await owner.previewSalesDraft(bad.id)).__kind__).toBe("err");
  ok(await owner.deleteSalesDraft(bad.id));
  // A partial credit note is refused.
  const cd = ok(await owner.creditDraftFrom(invoiceId));
  const half = ok(await owner.saveSalesDraft(cd.id, DocKind.creditNote, { ...cd.input, lines: [cd.input.lines[0]] }, invoiceId, null));
  const r = await owner.issueSalesDraft(half.id);
  expect(r.__kind__ === "err" && r.err.__kind__ === "invalid" && r.err.invalid).toBe("husFullCredit");
  ok(await owner.deleteSalesDraft(half.id));
});

test("partial payments: the same share of the deduction; claim XML valid; decision booked", async () => {
  // 60 % of the customer's 1 500 kr → 60 % of 1 250 kr.
  ok(await owner.registerPayment({ salesDocId: invoiceId, date: today, amount: 90_000n, interest: 0n, fees: 0n, method: PaymentMethod.bankgiro }));
  const hours = [{ workType: "IT_TJANSTER", hours: 2n }];
  expect((await owner.createHusCase({ salesDocId: invoiceId, hours: [], subcontractor: false, staffingAgency: false })).__kind__).toBe("err");
  const a = ok(await owner.createHusCase({ salesDocId: invoiceId, hours, subcontractor: false, staffingAgency: false }));
  expect(a.requested).toBe(75_000n);
  expect(a.deadline).toBe(`${Number(today.slice(0, 4)) + 1}-01-31`);
  expect((await owner.createHusCase({ salesDocId: invoiceId, hours, subcontractor: false, staffingAgency: false })).__kind__).toBe("err"); // nothing new paid
  ok(await owner.registerPayment({ salesDocId: invoiceId, date: today, amount: 60_000n, interest: 0n, fees: 0n, method: PaymentMethod.swish }));
  const b = ok(await owner.createHusCase({ salesDocId: invoiceId, hours, subcontractor: true, staffingAgency: false }));
  expect(b.requested).toBe(50_000n);
  expect(ok(await owner.getSalesDoc(invoiceId)).balance).toBe(0n);

  const name = `T${run}`;
  const claim = ok(await owner.createHusClaim(name, [a.id, b.id]));
  expect((await owner.createHusClaim(name, [])).__kind__).toBe("err");
  const company = ok(await owner.getCompany())!;
  const hus = ok(await owner.getSalesDoc(invoiceId)).doc.snapshot.hus!;
  const buyers = [{ name: "Privat", personnummer: "198202252386" }];
  const xml = claimXml(company, claim, [{ c: a, hus, buyers }, { c: b, hus, buyers }]);
  const v = claim.xmlVersion as "1.0" | "1.1";
  const res = await validateXML({ xml: [{ fileName: "b.xml", contents: xml }], schema: [{ fileName: "Begaran.xsd", contents: fx(`xsd/rotrut-${v}/Begaran.xsd`) }] });
  expect(res.errors.map((e) => e.rawMessage)).toEqual([]);
  expect(xml).toContain("<p:BegartBelopp>750</p:BegartBelopp>");

  ok(await owner.markHusClaimSubmitted(claim.id, today, true));
  expect((await owner.deleteHusClaim(claim.id)).__kind__).toBe("err");
  expect((await owner.applyHusDecision({ caseId: a.id, approved: 75_000n, reference: "123", date: today, bankAccount: 1930n })).__kind__).toBe("err");
  const da = ok(await owner.applyHusDecision({ caseId: a.id, approved: 75_000n, reference: "20260000185-01", date: today, bankAccount: 1930n }));
  const va = ok(await owner.getVoucher(da.voucherId!));
  expect(va.lines.find((l) => l.account === 1930n)?.amount).toBe(75_000n);
  if (!cash) expect(va.lines.find((l) => l.account === 1513n)?.amount).toBe(-75_000n);
  // 300 of 500 kr granted: the customer owes the other 200 kr.
  ok(await owner.applyHusDecision({ caseId: b.id, approved: 30_000n, reference: "20260000186-01", date: today, bankAccount: 1930n }));
  const view = ok(await owner.getSalesDoc(invoiceId));
  expect(view.payable).toBe(170_000n);
  expect(view.balance).toBe(20_000n);
  const cases = ok(await owner.listHusCases()).filter((c) => c.salesDocId === invoiceId);
  expect(cases.every((c) => c.status === "decided")).toBe(true);
});
