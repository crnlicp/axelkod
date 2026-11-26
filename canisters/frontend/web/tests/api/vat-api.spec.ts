// Moms against the local accounting canister: boxes from the ledger, lock and settle
// (series M, lock date), file, payment link, EU sales list rows and the XML built from
// the stored return. Locking is permanent, so the lock runs once per period: on later
// runs the stored return is checked instead.
import { expect, test } from "@playwright/test";
import { DocKind, Lang, TaxKind, Variant_person_company } from "../../app/bindings/accounting";
import { boxValue, vatPeriods, vatXml } from "../../app/admin/accounting/vat";
import { ensureOwnerAndYear, ok, owner } from "../support/accounting";

test.describe.configure({ mode: "serial" });

const today = new Date().toISOString().slice(0, 10);
const line = (account: bigint, amount: bigint) => ({ account, amount });

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  if (!ok(await owner.getCompany())) {
    ok(await owner.setCompany({
      legalName: "Test AB", orgNr: "556036-0793", vatNr: "SE556036079301", registeredOffice: "Göteborg", street: "Gatan 1",
      postalCode: "411 01", city: "Göteborg", country: "SE", email: "a@example.se", fSkatt: true,
    }));
  }
});

test("return: preview from the ledger, lock with settlement, file, link payment", async () => {
  const { settings, lockDate } = ok(await owner.getSettings());
  const years = ok(await owner.listFiscalYears());
  const period = vatPeriods(settings.vatPeriod, years, today, true).find((p) => p.to < today);
  test.skip(!period, "no ended VAT period in the fiscal years");
  const { from, to } = period!;
  expect((await owner.vatPreview(from, "2099-01-01")).__kind__).toBe("err");

  const stored = ok(await owner.listVatReturns()).find((r) => r.from === from);
  if (!stored && (!lockDate || lockDate < from)) {
    // A sale with öre, a domestic purchase and Skatteverket's EU goods example (55 000 kr).
    const post = async (lines: { account: bigint; amount: bigint }[]) => ok(await owner.postVoucher({
      series: "A", eventDate: to, description: "Momstest", attachmentIds: [],
      lines: lines.map((l) => ({ ...l, vatCode: undefined, text: undefined, costCenter: undefined, project: undefined, quantity: undefined })),
    }));
    const before = ok(await owner.vatPreview(from, to));
    await post([line(1510n, 1_250_094n), line(3001n, -1_000_075n), line(2611n, -250_019n)]);
    await post([line(4515n, 5_500_000n), line(2645n, 1_375_000n), line(2614n, -1_375_000n), line(2440n, -5_500_000n)]);
    const p = ok(await owner.vatPreview(from, to));
    expect(boxValue(p.boxes, 5) - boxValue(before.boxes, 5)).toBeGreaterThanOrEqual(10_000n);
    expect(boxValue(p.exact, 20) - boxValue(before.exact, 20)).toBe(5_500_000n);
    expect(boxValue(p.exact, 30) - boxValue(before.exact, 30)).toBe(1_375_000n);
    expect(boxValue(p.exact, 49) - boxValue(before.exact, 49)).toBe(250_019n);
    const sum = (n: number[]) => n.reduce((a, b) => a + boxValue(p.boxes, b), 0n);
    expect(boxValue(p.boxes, 49)).toBe(sum([10, 11, 12, 30, 31, 32, 60, 61, 62]) - boxValue(p.boxes, 48));

    const r = ok(await owner.lockVatReturn(from, to, "Test"));
    expect(r.boxes).toEqual(p.boxes);
    const v = ok(await owner.getVoucher(r.settlementVoucherId!));
    expect(v.series).toBe("M");
    expect(v.eventDate).toBe(to);
    expect(v.lines.reduce((s, l) => s + l.amount, 0n)).toBe(0n);
    expect(v.lines.find((l) => l.account === 2650n)?.amount).toBe(-boxValue(r.boxes, 49) * 100n);
    expect(ok(await owner.getSettings()).lockDate! >= to).toBe(true);
    // Nothing more can be booked in the period, and the VAT accounts are zero after it.
    expect((await post([line(1510n, 100n), line(3001n, -100n)]).catch((e) => String(e))) as string).toContain("lockDate");
  }
  const r = ok(await owner.listVatReturns()).find((x) => x.from === from);
  test.skip(!r, "the period was locked outside this test");
  expect(ok(await owner.vatPreview(from, to)).filed?.id).toBe(r!.id);
  expect((await owner.lockVatReturn(from, to, null)).__kind__).toBe("err");

  const xml = vatXml("556036-0793", to, r!.boxes, r!.note);
  expect(xml.startsWith('<?xml version="1.0" encoding="ISO-8859-1"?>\r\n<eSKDUpload Version="6.0">\r\n<OrgNr>556036-0793</OrgNr>\r\n<Moms>\r\n')).toBe(true);
  expect(xml).toContain(`<Period>${to.slice(0, 4)}${to.slice(5, 7)}</Period>`);
  expect(xml).toContain(`<MomsBetala>${boxValue(r!.boxes, 49)}</MomsBetala>`);

  if (r!.filedAt === undefined) {
    const f = ok(await owner.markVatReturnFiled(r!.id, "KV-1"));
    expect(f.receiptRef).toBe("KV-1");
  }
  if (r!.taxEntryId === undefined && boxValue(r!.boxes, 49) !== 0n) {
    // Skatteverket debits the VAT on the tax account; booked against 2650.
    const amount = -boxValue(r!.boxes, 49) * 100n;
    const imported = ok(await owner.importTaxRows([{ date: today, amount, kind: TaxKind.vat, text: `Moms ${to.slice(0, 7)} test ${Date.now()}` }]));
    const entries = ok(await owner.listTaxEntries(0n, 500n)).items.filter((e) => e.amount === amount && e.voucherId === undefined);
    const e = entries[entries.length - 1];
    expect(imported.added).toBe(1n);
    expect((await owner.linkVatPayment(r!.id, e.id)).__kind__).toBe("err"); // not booked yet
    ok(await owner.bookTaxEntry(e.id, null));
    const paid = ok(await owner.linkVatPayment(r!.id, e.id));
    expect(paid.taxEntryId).toBe(e.id);
  }
});

test("EU sales list: rows per buyer VAT number from issued EU invoices", async () => {
  const run = Date.now() % 100000;
  const customerId = ok(await owner.saveCustomer(null, {
    kind: Variant_person_company.company, name: `EU Kund ${run}`, vatNr: "DE262875793", address: { street: "Strasse 1", postalCode: "10115", city: "Berlin", country: "DE" },
    termsDays: 30n, language: Lang.en, reminderFeeAgreed: false, active: true,
  })).id;
  const month = { from: `${today.slice(0, 7)}-01`, to: today };
  const last = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const before = ok(await owner.ecSalesPreview(month.from, last)).rows.find((r) => r.vatNr === "DE262875793");
  const d = ok(await owner.saveSalesDraft(null, DocKind.invoice, {
    customerId, language: Lang.en, termsDays: 30n, currency: "SEK",
    lines: [
      { description: "Parts", quantity: 1_000n, unit: "st", unitPrice: 1_640_050n, discountBp: 0n, vatCode: "EUVA", account: 3108n },
      { description: "Service", quantity: 1_000n, unit: "h", unitPrice: 1_530_000n, discountBp: 0n, vatCode: "EUTJ", account: 3308n },
    ],
  }, null, null));
  ok(await owner.issueSalesDraft(d.id));
  const after = ok(await owner.ecSalesPreview(month.from, last));
  const row = after.rows.find((r) => r.vatNr === "DE262875793")!;
  expect(row.goods - (before?.goods ?? 0n)).toBeGreaterThanOrEqual(16_400n);
  expect(row.services - (before?.services ?? 0n)).toBeGreaterThanOrEqual(15_300n);
  // The current month has not ended: it cannot be filed yet.
  expect((await owner.fileEcSalesList({ from: month.from, to: last, contactName: "Per Persson", phone: "0123-45690" })).__kind__).toBe("err");
  expect((await owner.ecSalesPreview(month.from, month.from)).__kind__).toBe("err");
});
