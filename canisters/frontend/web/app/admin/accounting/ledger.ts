// Ledger data for pages and documents: paging, account sums and PDF jobs.
import type { Attachment, BalanceRow, FiscalYear, VoucherView } from "../../bindings/accounting";
import { ok, type Accounting } from "./api";
import type { AccContext } from "./context";
import { voucherHash } from "./encode";
import { hex } from "./canonical";
import { nowStamp } from "./pdf/client";
import type { Job, LedgerAccount, Meta, PdfVoucher, TrialRow } from "./pdf/types";

export const ref = (v: { series: string; number: bigint }) => `${v.series}-${v.number}`;

/** Every voucher of the year in registration order (optionally one series). */
export async function allVouchers(acc: Accounting, fy: bigint, series: string | null = null): Promise<VoucherView[]> {
  const out: VoucherView[] = [];
  for (let off = 0n; ; off += 200n) {
    const page = ok(await acc.journal(fy, series, off, 200n));
    out.push(...page.items);
    if (out.length >= Number(page.total) || page.items.length === 0) return out;
  }
}

/** The voucher with a given series and number: numbering is gapless, so it is at offset number - 1. */
export async function findVoucher(acc: Accounting, fy: bigint, series: string, n: bigint): Promise<VoucherView | null> {
  if (n < 1n) return null;
  const page = ok(await acc.journal(fy, series, n - 1n, 1n));
  return page.items[0]?.number === n ? page.items[0] : null;
}

export const sumPositive = (xs: bigint[]) => xs.reduce((a, b) => (b > 0n ? a + b : a), 0n);

/** Months of the fiscal year as "YYYY-MM", matching BalanceRow.months indexes. */
export function fyMonths(y: FiscalYear): string[] {
  const out: string[] = [];
  let [yy, mm] = y.start.split("-").map(Number);
  const end = y.end.slice(0, 7);
  for (;;) {
    const m = `${yy}-${String(mm).padStart(2, "0")}`;
    out.push(m);
    if (m >= end) return out;
    mm++;
    if (mm > 12) { mm = 1; yy++; }
  }
}

/** Ingående balans per account (A9b): from the year-end transfer or entered by hand. */
export async function openingMap(acc: AccContext["acc"], yearId: bigint): Promise<Map<number, bigint>> {
  return new Map(ok(await acc.openingBalances(yearId)).map((l) => [Number(l.account), l.amount]));
}

/** `opening` (IB) is added before the first month of the year. */
export function trialRows(balances: BalanceRow[], from: number, to: number, name: (n: bigint) => string, opening: ReadonlyMap<number, bigint> = new Map()): TrialRow[] {
  const rows = balances.map((b) => ({
    number: Number(b.account), name: name(b.account),
    opening: (opening.get(Number(b.account)) ?? 0n) + b.months.slice(0, from).reduce((a, x) => a + x, 0n),
    change: b.months.slice(from, to + 1).reduce((a, x) => a + x, 0n),
  }));
  for (const [n, a] of opening) if (!balances.some((b) => Number(b.account) === n)) rows.push({ number: n, name: name(BigInt(n)), opening: a, change: 0n });
  return rows
    .filter((r) => r.opening !== 0n || r.change !== 0n)
    .sort((a, b) => a.number - b.number);
}

export function generalLedger(vouchers: VoucherView[], name: (n: bigint) => string, only?: number): LedgerAccount[] {
  const map = new Map<number, LedgerAccount>();
  for (const v of vouchers)
    for (const l of v.lines) {
      const n = Number(l.account);
      if (only !== undefined && n !== only) continue;
      let a = map.get(n);
      if (!a) map.set(n, (a = { number: n, name: name(l.account), opening: 0n, rows: [] }));
      a.rows.push({ date: v.eventDate, ref: ref(v), text: l.text ?? v.description, amount: l.amount });
    }
  return [...map.values()].sort((a, b) => a.number - b.number);
}

export function meta(ctx: AccContext, title: string, refText: string, subtitle: string[], date = new Date()): Meta {
  if (!ctx.data?.company) throw new Error("company");
  return { title, ref: refText, subtitle, company: ctx.data.company, generatedAt: nowStamp(), date };
}

const sourceText = (v: VoucherView, sources: Record<string, string>) => sources[v.source.__kind__] ?? v.source.__kind__;

export function pdfVoucher(ctx: AccContext, v: VoucherView, all: Map<bigint, VoucherView>, attachments: Attachment[], sources: Record<string, string>): PdfVoucher {
  const refOf = (id: bigint) => { const x = all.get(id); return x ? ref(x) : `#${id}`; };
  return {
    ref: ref(v), eventDate: v.eventDate, registeredAt: nowStamp(new Date(Number(v.registeredAt / 1_000_000n))),
    description: v.description, counterparty: v.counterparty,
    lines: v.lines.map((l) => ({ account: Number(l.account), name: ctx.accountName(l.account), amount: l.amount, vatCode: l.vatCode, text: l.text })),
    attachments: attachments.map((a) => ({ filename: a.filename, sha: hex(Uint8Array.from(a.plainSha256)).slice(0, 16) })),
    corrects: v.corrects !== undefined ? refOf(v.corrects) : undefined, correctedBy: v.correctedBy.map(refOf),
    createdBy: v.createdBy.toText(), retainUntil: v.retainUntil, source: sourceText(v, sources),
  };
}

export async function voucherJob(ctx: AccContext, v: VoucherView, related: Map<bigint, VoucherView>, attachments: Attachment[], sources: Record<string, string>): Promise<Job> {
  const hash = await voucherHash(v);
  return {
    template: "voucher@1",
    meta: { ...meta(ctx, "Verifikation", ref(v), [`Bokföringsdatum ${v.eventDate}`], new Date(Number(v.registeredAt / 1_000_000n))), hash: hash.slice(0, 8) },
    voucher: pdfVoucher(ctx, v, related, attachments, sources),
  };
}

const yearLabel = (y: FiscalYear) => `Räkenskapsår ${y.start} – ${y.end}`;

export async function journalJob(ctx: AccContext, y: FiscalYear, series: string | null, sources: Record<string, string>): Promise<Job> {
  const vs = await allVouchers(ctx.acc, y.id, series);
  const byId = new Map(vs.map((v) => [v.id, v]));
  return {
    template: "journal@1",
    meta: meta(ctx, "Grundbok", y.start.slice(0, 4), [yearLabel(y), series ? `Serie ${series}` : "Alla serier"]),
    vouchers: vs.map((v) => pdfVoucher(ctx, v, byId, [], sources)),
  };
}

export async function generalJob(ctx: AccContext, y: FiscalYear, only?: number): Promise<Job> {
  const [vs, ib] = await Promise.all([allVouchers(ctx.acc, y.id), openingMap(ctx.acc, y.id)]);
  const accounts = generalLedger(vs, ctx.accountName, only).map((a) => ({ ...a, opening: ib.get(a.number) ?? 0n }));
  for (const [n, amount] of ib) if ((only === undefined || only === n) && !accounts.some((a) => a.number === n)) accounts.push({ number: n, name: ctx.accountName(BigInt(n)), opening: amount, rows: [] });
  return {
    template: "ledger@1",
    meta: meta(ctx, "Huvudbok", y.start.slice(0, 4), [yearLabel(y), ...(only !== undefined ? [`Konto ${only}`] : [])]),
    accounts: accounts.sort((a, b) => a.number - b.number),
  };
}

export async function trialJob(ctx: AccContext, y: FiscalYear, from: number, to: number): Promise<Job> {
  const months = fyMonths(y);
  const rows = trialRows(ok(await ctx.acc.balances(y.id)), from, to, ctx.accountName, await openingMap(ctx.acc, y.id));
  return {
    template: "trial-balance@1",
    meta: meta(ctx, "Saldobalans", y.start.slice(0, 4), [yearLabel(y), `Period ${months[from]} – ${months[to]}`]),
    rows,
  };
}
