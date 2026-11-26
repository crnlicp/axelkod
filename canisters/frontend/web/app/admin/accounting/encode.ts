// acj-1 values of stored records, field for field as accounting/src/lib/Encode.mo,
// so a hash computed here equals the audit entry's detailHash for the same record.
import type { CompanyProfile, HusPart, PartySnapshot, Reminder, Snapshot, SourceRef, Voucher, VoucherLine } from "../../bindings/accounting";
import { sha256, hex, type Value } from "./canonical";

const opt = <T>(x: T | undefined, f: (y: T) => Value = (y) => y as Value): Value => (x === undefined ? null : f(x));

export function source(s: SourceRef): Value {
  return s.__kind__ === "manual" ? { manual: null } : { [s.__kind__]: (s as Record<string, unknown>)[s.__kind__] as bigint };
}

export const line = (l: VoucherLine): Value => ({
  account: l.account, amount: l.amount, vatCode: opt(l.vatCode), costCenter: opt(l.costCenter),
  project: opt(l.project), quantity: opt(l.quantity), text: opt(l.text),
});

export const voucher = (v: Voucher): Value => ({
  id: v.id, fiscalYearId: v.fiscalYearId, series: v.series, number: v.number, eventDate: v.eventDate,
  registeredAt: v.registeredAt, description: v.description, lines: v.lines.map(line), source: source(v.source),
  attachmentIds: [...v.attachmentIds], counterparty: opt(v.counterparty), corrects: opt(v.corrects),
  createdBy: v.createdBy.toText(), retainUntil: v.retainUntil,
});

export async function voucherHash(v: Voucher): Promise<string> {
  return hex(await sha256(voucher(v)));
}

// ── Sales (mirrors Encode.mo: company, party, snapshot, reminder) ──

export const company = (c: CompanyProfile): Value => ({
  legalName: c.legalName, orgNr: c.orgNr, vatNr: c.vatNr, registeredOffice: c.registeredOffice, street: c.street,
  postalCode: c.postalCode, city: c.city, country: c.country, email: c.email, phone: opt(c.phone), web: opt(c.web),
  bankgiro: opt(c.bankgiro), plusgiro: opt(c.plusgiro), iban: opt(c.iban), bic: opt(c.bic), fSkatt: c.fSkatt, peppolId: opt(c.peppolId),
});

const tag = (t: string): Value => ({ [t]: null });

export const party = (p: PartySnapshot): Value => ({
  name: p.name, orgNr: opt(p.orgNr), vatNr: opt(p.vatNr),
  address: { street: p.address.street, postalCode: p.address.postalCode, city: p.address.city, country: p.address.country },
  email: opt(p.email), peppolId: opt(p.peppolId), kind: tag(p.kind),
});

/** ROT/RUT part (Encode.mo `hus`); ciphertext is hashed as is. */
export const hus = (h: HusPart): Value => ({
  kind: tag(h.kind), rateBp: h.rateBp,
  lineParts: h.lineParts.map((p) => (p === null ? null : p.__kind__ === "other" ? { other: null } : { [p.__kind__]: p.__kind__ === "labour" ? p.labour : p.material })),
  labour: h.labour, material: h.material, other: h.other,
  work: h.work.map((w) => ({ workType: w.workType, labour: w.labour, material: w.material })),
  deduction: h.deduction,
  buyers: h.buyers.map((b) => ({ identityEnc: Uint8Array.from(b.identityEnc), shareBp: b.shareBp, amount: b.amount })),
  propertyEnc: opt(h.propertyEnc, (b) => Uint8Array.from(b)),
});

/** `hus` is present only on ROT/RUT documents, so earlier hashes are unchanged. */
export const snapshot = (x: Snapshot): Value => ({ ...snapshotBase(x), ...(x.hus ? { hus: hus(x.hus) } : {}) }) as Value;

const snapshotBase = (x: Snapshot): { [k: string]: Value } => ({
  kind: tag(x.kind), number: x.number, seller: company(x.seller), buyer: party(x.buyer), language: tag(x.language),
  issueDate: x.issueDate, deliveryDate: opt(x.deliveryDate), dueDate: opt(x.dueDate), validUntil: opt(x.validUntil), currency: x.currency,
  fxRate: opt(x.fxRate, (f) => ({ rate: f.rate, date: f.date })),
  lines: x.lines.map((l) => ({ description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, discountBp: l.discountBp, vatCode: l.vatCode, rateBp: l.rateBp, account: l.account, net: l.net })),
  vat: x.vat.map((r) => ({ vatCode: r.vatCode, rateBp: r.rateBp, category: r.category, base: r.base, vat: r.vat })),
  totalNet: x.totalNet, totalVat: x.totalVat, total: x.total, totalVatSek: opt(x.totalVatSek), legalNotes: [...x.legalNotes],
  ocr: opt(x.ocr), ourRef: opt(x.ourRef), yourRef: opt(x.yourRef), notes: opt(x.notes), termsDays: x.termsDays,
  lateInterestText: opt(x.lateInterestText), creditOf: opt(x.creditOf, (c) => ({ number: c.number, issueDate: c.issueDate })),
  templateVersion: x.templateVersion,
});

export const reminder = (r: Reminder): Value => ({
  number: r.number, date: r.date, invoiceNumber: r.invoiceNumber, dueDate: r.dueDate, balance: r.balance, interest: r.interest,
  interestRateBp: r.interestRateBp, fee: r.fee, feeKind: r.feeKind, language: tag(r.language), seller: company(r.seller), buyer: party(r.buyer),
});

/** Recomputes a stored hash; a mismatch means the data is not the issued original (C11). */
export async function matches(value: Value, stored: Uint8Array): Promise<boolean> {
  return hex(await sha256(value)) === hex(Uint8Array.from(stored));
}
