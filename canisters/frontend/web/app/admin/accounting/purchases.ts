// Inköp and Bank helpers: suggested accounts per VAT treatment (BAS 2026, V23), the
// voucher preview (mirrors lib/Purchase.mo), and CSV parsing for bank and tax imports.
import { PurchaseKind, TaxKind, Treatment, type CsvMapping, type PurchaseInput, type Row, type TaxRow } from "../../bindings/accounting";
import { parseOre } from "./money";

export const REVERSE = new Set<Treatment>([Treatment.euGoods, Treatment.euServices, Treatment.nonEuServices, Treatment.seGoodsRC, Treatment.seServicesRC]);
export const RATES = [2500n, 1200n, 600n, 0n];

/** Purchase accounts by treatment and rate (BAS 2026: 4415–4427, 4515–4537). */
const RC_ACCOUNTS: Partial<Record<Treatment, Record<string, bigint>>> = {
  [Treatment.euGoods]: { "2500": 4515n, "1200": 4516n, "600": 4517n },
  [Treatment.euServices]: { "2500": 4535n, "1200": 4536n, "600": 4537n },
  [Treatment.nonEuServices]: { "2500": 4531n, "1200": 4532n, "600": 4533n },
  [Treatment.seGoodsRC]: { "2500": 4415n, "1200": 4416n, "600": 4417n },
  [Treatment.seServicesRC]: { "2500": 4425n, "1200": 4426n, "600": 4427n },
};
export const suggestedAccount = (t: Treatment, rateBp: bigint): bigint | null => RC_ACCOUNTS[t]?.[String(rateBp)] ?? null;

const divRound = (a: bigint, b: bigint) => {
  const q = a / b, r = a % b;
  const twice = (r < 0n ? -r : r) * 2n;
  return twice >= (b < 0n ? -b : b) ? q + ((a < 0n) !== (b < 0n) ? -1n : 1n) : q;
};
const toSek = (x: bigint, fx?: { rate: bigint }) => (fx ? divRound(x * fx.rate, 1_000_000n) : x);
/** Input VAT from the net at a rate (domestic documents; the stated VAT wins when it differs). */
export const vatOf = (net: bigint, rateBp: bigint) => divRound(net * rateBp, 10_000n);

const RC_OUT: Record<string, bigint> = { "2500": 2614n, "1200": 2624n, "600": 2634n };
const IMPORT_OUT: Record<string, bigint> = { "2500": 2615n, "1200": 2625n, "600": 2635n };

/** The voucher lines `bookPurchase` will post, for the confirmation (same rules as the canister). */
export function previewLines(x: PurchaseInput): { account: bigint; amount: bigint }[] {
  const m = new Map<bigint, bigint>();
  const add = (a: bigint, v: bigint) => { if (v !== 0n) m.set(a, (m.get(a) ?? 0n) + v); };
  let cost = 0n;
  const reverse = REVERSE.has(x.treatment);
  const rcIn = x.treatment === Treatment.seGoodsRC || x.treatment === Treatment.seServicesRC ? 2647n : 2645n;
  for (const l of x.lines) {
    const net = toSek(l.net, x.fxRate);
    if (x.treatment === Treatment.importVat) { const v = divRound(net * l.rateBp, 10_000n); add(2645n, v); add(IMPORT_OUT[String(l.rateBp)] ?? 2615n, -v); continue; }
    add(l.account, net); cost += net;
    if (x.treatment === Treatment.domestic) { const v = toSek(l.vat, x.fxRate); add(2641n, v); cost += v; }
    if (reverse) { const v = divRound(net * l.rateBp, 10_000n); add(rcIn, v); add(RC_OUT[String(l.rateBp)] ?? 2614n, -v); }
  }
  const credit = x.kind === PurchaseKind.expenseClaim ? 2820n : x.kind === PurchaseKind.receipt ? (x.paidFrom === "cash" ? 1910n : 1930n) : 2440n;
  add(credit, -cost);
  const sign = x.kind === PurchaseKind.creditNote ? -1n : 1n;
  return [...m.entries()].filter(([, v]) => v !== 0n).sort(([a], [b]) => Number(a - b)).map(([account, amount]) => ({ account, amount: amount * sign }));
}

// ── CSV ──

/** RFC 4180-style split with quotes; `delimiter` is one character. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** Guesses the delimiter from the first lines (semicolon is common in Swedish bank files). */
export function guessDelimiter(text: string): string {
  const head = text.split(/\r?\n/).slice(0, 5).join("\n");
  const count = (d: string) => head.split(d).length;
  return [";", ",", "\t"].sort((a, b) => count(b) - count(a))[0];
}

export function parseAmount(text: string, decimalComma: boolean): bigint | null {
  const s = text.trim().replace(/[\s  ]/g, "");
  return parseOre(decimalComma ? s.replace(/\./g, "") : s.replace(/,/g, ""));
}

/** YYYY-MM-DD, YYYYMMDD, YYYY/MM/DD, DD.MM.YYYY or DD/MM/YYYY → YYYY-MM-DD. */
export function parseDate(text: string): string | null {
  const s = text.trim();
  let m = /^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/.exec(s);
  const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : (m = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(s)) ? `${m[3]}-${m[2]}-${m[1]}` : null;
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export type Parsed<T> = { rows: T[]; errors: number[] };

export function bankRows(table: string[][], m: CsvMapping): Parsed<Row> {
  const rows: Row[] = [];
  const errors: number[] = [];
  table.slice(Number(m.skipRows)).forEach((cells, i) => {
    const date = parseDate(cells[Number(m.dateCol)] ?? "");
    const amount = parseAmount(cells[Number(m.amountCol)] ?? "", m.decimalComma);
    const text = (cells[Number(m.textCol)] ?? "").trim().slice(0, 300);
    if (!date || amount === null || amount === 0n) { errors.push(i + 1 + Number(m.skipRows)); return; }
    const opt = (c?: bigint) => (c === undefined ? undefined : (cells[Number(c)] ?? "").trim() || undefined);
    rows.push({ date, amount, text, reference: opt(m.referenceCol)?.slice(0, 100), counterparty: opt(m.counterpartyCol)?.slice(0, 200) });
  });
  return { rows, errors };
}

/**
 * A first guess of the kind from the transaction text; the user checks it in the
 * preview and can change it later until the entry is booked.
 */
export function guessTaxKind(text: string, amount: bigint): TaxKind {
  const s = text.toLowerCase();
  if (s.includes("intäktsränta")) return TaxKind.interestIncome;
  if (s.includes("kostnadsränta")) return TaxKind.interestCost;
  if (s.includes("moms")) return TaxKind.vat;
  if (s.includes("arbetsgivaravgift")) return TaxKind.employerFee;
  if (s.includes("avdragen skatt")) return TaxKind.withheldTax;
  if (s.includes("preliminärskatt") || s.includes("f-skatt")) return TaxKind.prelimTax;
  if (s.includes("inbetalning")) return TaxKind.payment;
  if (s.includes("utbetalning") || s.includes("återbetalning")) return TaxKind.refund;
  return amount > 0n ? TaxKind.payment : TaxKind.other;
}

export function taxRows(table: string[][], m: CsvMapping): Parsed<TaxRow> {
  const { rows, errors } = bankRows(table, m);
  return { rows: rows.map((r) => ({ date: r.date, amount: r.amount, text: r.text, kind: guessTaxKind(r.text, r.amount) })), errors };
}
