// SIE 4 (type 4E export and parsing), SIE file format version 4C 2025-08-06 (sources.md V17).
// Codepage 437, one item per line ending LF, fields separated by spaces, quotes for text,
// amounts with "." and two decimals, dates YYYYMMDD, debit positive and credit negative.
import type { Account, BalanceRow, FiscalYear, VoucherView } from "../../bindings/accounting";
import { targetOf } from "./sru";

// Codepage 437, bytes 128–255 (5.8).
const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
const TO_437 = new Map([...CP437_HIGH].map((c, i) => [c, 128 + i]));

export function encode437(text: string): Uint8Array {
  const out: number[] = [];
  for (const c of text) {
    const n = c.codePointAt(0)!;
    out.push(n < 128 ? n : TO_437.get(c) ?? 63);
  }
  return Uint8Array.from(out);
}

export const decode437 = (b: Uint8Array) => Array.from(b, (x) => (x < 128 ? String.fromCharCode(x) : CP437_HIGH[x - 128])).join("");

/** A text field: control characters out (5.7), quotes escaped, always quoted. */
const q = (s: string) => `"${s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/"/g, '\\"')}"`;
const date = (iso: string) => iso.replaceAll("-", "");
/** Öre → "-1234.50" (5.9). */
export function amount(ore: bigint): string {
  const neg = ore < 0n;
  const a = neg ? -ore : ore;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}

const isBalance = (n: number) => n >= 1000 && n < 3000;
const KTYP: Record<string, string> = { asset: "T", liability: "S", equity: "S", expense: "K", revenue: "I" };

export type SieYear = {
  year: FiscalYear;
  months: string[]; // "YYYY-MM", matching BalanceRow.months
  balances: BalanceRow[];
  opening: ReadonlyMap<number, bigint>;
};

export type SieInput = {
  program: { name: string; version: string };
  generated: Date;
  company: { legalName: string; orgNr: string; street: string; postalCode: string; city: string; phone?: string };
  accounts: Account[];
  current: SieYear;
  previous?: SieYear;
  vouchers: VoucherView[];
};

function balances(y: SieYear) {
  const ub = new Map(y.opening);
  const res = new Map<number, bigint>();
  for (const r of y.balances) {
    const n = Number(r.account);
    const sum = r.months.reduce((a, x) => a + x, 0n);
    if (isBalance(n)) ub.set(n, (ub.get(n) ?? 0n) + sum);
    else res.set(n, (res.get(n) ?? 0n) + sum);
  }
  return { ub, res };
}

/** The SIE 4E file as text (encode437 for the bytes). */
export function sie4(x: SieInput): string {
  const L: string[] = [];
  const years: [number, SieYear][] = [[0, x.current], ...(x.previous ? [[-1, x.previous] as [number, SieYear]] : [])];
  // 1 flag, 2 identification (6), 3 chart of accounts, 4 balances and verifications (5.12).
  L.push("#FLAGGA 0", `#PROGRAM ${q(x.program.name)} ${q(x.program.version)}`, "#FORMAT PC8", `#GEN ${date(x.generated.toISOString().slice(0, 10))}`, "#SIETYP 4");
  L.push(`#FNAMN ${q(x.company.legalName)}`, `#ORGNR ${x.company.orgNr}`);
  L.push(`#ADRESS "" ${q(x.company.street)} ${q(`${x.company.postalCode} ${x.company.city}`)} ${q(x.company.phone ?? "")}`);
  for (const [i, y] of years) L.push(`#RAR ${i} ${date(y.year.start)} ${date(y.year.end)}`);
  L.push("#KPTYP EUBAS97", "#VALUTA SEK");
  const accounts = [...x.accounts].sort((a, b) => Number(a.number - b.number));
  for (const a of accounts) L.push(`#KONTO ${a.number} ${q(a.name)}`);
  for (const a of accounts) L.push(`#KTYP ${a.number} ${KTYP[a.kind] ?? "K"}`);
  for (const a of accounts) {
    const t = targetOf(Number(a.number), a.sruCode ?? null);
    if (t) L.push(`#SRU ${a.number} ${"code" in t ? t.code : t.pair}`);
  }
  for (const [i, y] of years) {
    const { ub, res } = balances(y);
    // Zero balances may be left out (5.17).
    for (const [n, v] of [...y.opening].sort((a, b) => a[0] - b[0])) if (v !== 0n) L.push(`#IB ${i} ${n} ${amount(v)}`);
    for (const [n, v] of [...ub].sort((a, b) => a[0] - b[0])) if (v !== 0n) L.push(`#UB ${i} ${n} ${amount(v)}`);
    for (const [n, v] of [...res].sort((a, b) => a[0] - b[0])) if (v !== 0n) L.push(`#RES ${i} ${n} ${amount(v)}`);
  }
  for (const [i, y] of years) {
    for (const r of [...y.balances].sort((a, b) => Number(a.account - b.account))) {
      r.months.forEach((v, m) => { if (v !== 0n) L.push(`#PSALDO ${i} ${y.months[m].replace("-", "")} ${r.account} {} ${amount(v)}`); });
    }
  }
  // Each series in ascending number order (#VER 7).
  const vs = [...x.vouchers].sort((a, b) => (a.series === b.series ? Number(a.number - b.number) : a.series < b.series ? -1 : 1));
  for (const v of vs) {
    const reg = new Date(Number(v.registeredAt / 1_000_000n)).toISOString().slice(0, 10);
    L.push(`#VER ${q(v.series)} ${v.number} ${date(v.eventDate)} ${q(v.description)} ${date(reg)}`, "{");
    for (const l of v.lines) L.push(`#TRANS ${l.account} {} ${amount(l.amount)}${l.text ? ` "" ${q(l.text)}` : ""}`);
    L.push("}");
  }
  return L.join("\n") + "\n";
}

// ── Parsing ──

export type SieVer = { series: string; number: string; date: string; text: string; trans: { account: number; amount: bigint; text: string }[] };
export type SieFile = {
  sieType: string;
  program: string;
  company: string;
  orgNr: string;
  years: Map<number, { start: string; end: string }>;
  accounts: Map<number, string>;
  ib: Map<number, Map<number, bigint>>;
  ub: Map<number, Map<number, bigint>>;
  res: Map<number, Map<number, bigint>>;
  vers: SieVer[];
};

/** Fields of one line: quoted text with \" escapes, {…} object lists as one field (5.7). */
export function fields(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === '"') {
      let s = "";
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === "\\" && line[i + 1] === '"') { s += '"'; i += 2; } else s += line[i++];
      }
      out.push(s);
      i++;
    } else if (c === "{") {
      const j = line.indexOf("}", i);
      out.push(line.slice(i, j < 0 ? line.length : j + 1));
      i = j < 0 ? line.length : j + 1;
    } else {
      let j = i;
      while (j < line.length && line[j] !== " " && line[j] !== "\t") j++;
      out.push(line.slice(i, j));
      i = j;
    }
  }
  return out;
}

/** "-1234.5" → öre, exactly. */
export function parseAmount(s: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`amount: ${s}`);
  const ore = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0") || "0");
  return m[1] ? -ore : ore;
}

const iso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

export function parseSie(bytes: Uint8Array): SieFile {
  const f: SieFile = { sieType: "1", program: "", company: "", orgNr: "", years: new Map(), accounts: new Map(), ib: new Map(), ub: new Map(), res: new Map(), vers: [] };
  const put = (m: Map<number, Map<number, bigint>>, y: string, a: string, v: string) => {
    const k = Number(y);
    if (!m.has(k)) m.set(k, new Map());
    m.get(k)!.set(Number(a), parseAmount(v));
  };
  let ver: SieVer | null = null;
  for (const raw of decode437(bytes).split("\n")) {
    const line = raw.replace(/\r$/, "").trim();
    if (!line) continue; // 5.6
    if (line === "{") continue;
    if (line === "}") { if (ver) f.vers.push(ver); ver = null; continue; }
    const [label, ...a] = fields(line);
    switch (label) {
      case "#SIETYP": f.sieType = a[0] ?? ""; break;
      case "#PROGRAM": f.program = a.join(" "); break;
      case "#FNAMN": f.company = a[0] ?? ""; break;
      case "#ORGNR": f.orgNr = a[0] ?? ""; break;
      case "#RAR": f.years.set(Number(a[0]), { start: iso(a[1]), end: iso(a[2]) }); break;
      case "#KONTO": f.accounts.set(Number(a[0]), a[1] ?? ""); break;
      case "#IB": put(f.ib, a[0], a[1], a[2]); break;
      case "#UB": put(f.ub, a[0], a[1], a[2]); break;
      case "#RES": put(f.res, a[0], a[1], a[2]); break;
      case "#VER": ver = { series: a[0] ?? "", number: a[1] ?? "", date: iso(a[2] ?? ""), text: a[3] ?? "", trans: [] }; break;
      // With #RTRANS handled, the identical #TRANS after it is skipped (#RTRANS 6); #BTRANS rows were removed.
      case "#TRANS": if (ver) {
        const prev = ver.trans.at(-1) as (SieVer["trans"][number] & { r?: true }) | undefined;
        if (prev?.r) { delete prev.r; break; }
        ver.trans.push({ account: Number(a[0]), amount: parseAmount(a[2]), text: a[4] ?? "" });
      } break;
      case "#RTRANS": if (ver) ver.trans.push({ account: Number(a[0]), amount: parseAmount(a[2]), text: a[4] ?? "", r: true } as SieVer["trans"][number]); break;
      default: break; // unknown labels are ignored (7.1)
    }
  }
  return f;
}

/**
 * Opening balances for a fiscal year starting `start` from a SIE file: the file's #IB for a
 * year starting the same day, otherwise #UB of the year that ended the day before. Balance
 * sheet accounts only; an unclosed result on 2099 moves to 2098, as the year-end carry-over does.
 */
export function openingFromSie(f: SieFile, start: string): { lines: Map<number, bigint>; names: Map<number, string> } | null {
  const before = new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  let src: Map<number, bigint> | undefined;
  for (const [i, y] of f.years) {
    if (y.start === start) src = f.ib.get(i);
    else if (y.end === before) src = f.ub.get(i);
    if (src) break;
  }
  if (!src) return null;
  const lines = new Map<number, bigint>();
  for (const [n, v] of src) {
    if (!isBalance(n) || v === 0n) continue;
    const k = n === 2099 ? 2098 : n;
    lines.set(k, (lines.get(k) ?? 0n) + v);
  }
  for (const [n, v] of lines) if (v === 0n) lines.delete(n);
  return { lines, names: f.accounts };
}
