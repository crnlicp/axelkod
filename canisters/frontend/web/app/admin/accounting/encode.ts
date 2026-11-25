// acj-1 values of stored records, field for field as accounting/src/lib/Encode.mo,
// so a hash computed here equals the audit entry's detailHash for the same record.
import type { SourceRef, Voucher, VoucherLine } from "../../bindings/accounting";
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
