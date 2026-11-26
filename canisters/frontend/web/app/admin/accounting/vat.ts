// Moms: periods and deadlines, the eSKDUpload 6.0 file (V3) and the SKV574008 EU sales
// list file (V4). Both files are built from stored values only and encoded ISO-8859-1.
import { Variant_month_quarter_year, type Box, type EslRow, type FiscalYear } from "../../bindings/accounting";
import { ecSalesDue, vatMonthDue, vatQuarterDue, vatYearDue, type Ymd } from "./deadlines";

/** Box → XML element, in file order (Skatteverket "Lämna momsdeklaration via fil"). */
export const BOXES: readonly (readonly [number, string])[] = [
  [5, "ForsMomsEjAnnan"], [6, "UttagMoms"], [7, "UlagMargbesk"], [8, "HyrinkomstFriv"],
  [10, "MomsUtgHog"], [11, "MomsUtgMedel"], [12, "MomsUtgLag"],
  [20, "InkopVaruAnnatEg"], [21, "InkopTjanstAnnatEg"], [22, "InkopTjanstUtomEg"], [23, "InkopVaruSverige"], [24, "InkopTjanstSverige"],
  [30, "MomsInkopUtgHog"], [31, "MomsInkopUtgMedel"], [32, "MomsInkopUtgLag"],
  [35, "ForsVaruAnnatEg"], [36, "ForsVaruUtomEg"], [37, "InkopVaruMellan3p"], [38, "ForsVaruMellan3p"],
  [39, "ForsTjSkskAnnatEg"], [40, "ForsTjOvrUtomEg"], [41, "ForsKopareSkskSverige"], [42, "ForsOvrigt"],
  [50, "MomsUlagImport"], [60, "MomsImportUtgHog"], [61, "MomsImportUtgMedel"], [62, "MomsImportUtgLag"],
  [48, "MomsIngAvdr"], [49, "MomsBetala"],
];

/** Sections of the form (A–I as on "Fylla i momsdeklarationen"), each with its boxes. */
export const SECTIONS: readonly (readonly [string, readonly number[]])[] = [
  ["A", [5, 6, 7, 8]], ["B", [10, 11, 12]], ["C", [20, 21, 22, 23, 24]], ["D", [30, 31, 32]],
  ["E", [35, 36, 37, 38, 39, 40, 41, 42]], ["H", [50]], ["I", [60, 61, 62]], ["F", [48]], ["G", [49]],
];

export const boxValue = (boxes: Box[], b: number): bigint => boxes.find((x) => Number(x.box) === b)?.amount ?? 0n;

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export type Period = { from: Ymd; to: Ymd; label: string; due: Ymd };

/** VAT periods per the settings, newest first, from the earliest fiscal year to the current period. */
export function vatPeriods(kind: Variant_month_quarter_year, years: FiscalYear[], today: Ymd, euTrade: boolean): Period[] {
  if (!years.length) return [];
  const first = years.map((y) => y.start).sort()[0];
  const out: Period[] = [];
  if (kind === Variant_month_quarter_year.year) {
    for (const y of years) {
      if (y.start > today) continue;
      const [ey, em] = y.end.split("-").map(Number);
      out.push({ from: y.start, to: y.end, label: y.start.slice(0, 4) === y.end.slice(0, 4) ? y.start.slice(0, 4) : `${y.start.slice(0, 7)} – ${y.end.slice(0, 7)}`, due: vatYearDue(ey, em, euTrade) });
    }
    return out.sort((a, b) => b.from.localeCompare(a.from));
  }
  const step = kind === Variant_month_quarter_year.quarter ? 3 : 1;
  let [y, m] = first.split("-").map(Number);
  if (step === 3) m = m - ((m - 1) % 3);
  while (`${y}-${pad(m)}-01` <= today) {
    const em = m + step - 1;
    const from = `${y}-${pad(m)}-01`;
    const to = `${y}-${pad(em)}-${pad(lastDay(y, em))}`;
    out.push(step === 3
      ? { from, to, label: `${y} kvartal ${(m + 2) / 3}`, due: vatQuarterDue(y, (m + 2) / 3) }
      : { from, to, label: `${y}-${pad(m)}`, due: vatMonthDue(y, m) });
    m += step;
    if (m > 12) { m -= 12; y += 1; }
  }
  return out.reverse();
}

/** EU sales list periods (month or calendar quarter) for the last two years. */
export function eslPeriods(quarterly: boolean, today: Ymd, count = 12): Period[] {
  const [ty, tm] = today.split("-").map(Number);
  const out: Period[] = [];
  let y = ty;
  let m = quarterly ? tm - ((tm - 1) % 3) : tm;
  for (let i = 0; i < count; i++) {
    const em = quarterly ? m + 2 : m;
    out.push({
      from: `${y}-${pad(m)}-01`, to: `${y}-${pad(em)}-${pad(lastDay(y, em))}`,
      label: quarterly ? `${y} kvartal ${(m + 2) / 3}` : `${y}-${pad(m)}`, due: ecSalesDue(y, em),
    });
    m -= quarterly ? 3 : 1;
    if (m < 1) { m += 12; y -= 1; }
  }
  return out;
}

/** Characters outside ISO-8859-1 become "?" (the file's declared encoding). */
export function latin1(text: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); out[i] = c <= 0xff ? c : 0x3f; }
  return out;
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * eSKDUpload 6.0: header elements always; boxes only when not zero, except 49 which is
 * always given (0 when there is nothing to report). Whole kronor, a leading minus only.
 */
export function vatXml(orgNr: string, to: Ymd, boxes: Box[], note?: string): string {
  const lines = ['<?xml version="1.0" encoding="ISO-8859-1"?>', '<eSKDUpload Version="6.0">', `<OrgNr>${orgNr}</OrgNr>`, "<Moms>", `<Period>${to.slice(0, 4)}${to.slice(5, 7)}</Period>`];
  for (const [b, el] of BOXES) {
    const v = boxValue(boxes, b);
    if (b === 49 || v !== 0n) lines.push(`<${el}>${v.toString()}</${el}>`);
  }
  if (note?.trim()) lines.push(`<TextUpplysningMoms>${xmlEscape(note.trim().slice(0, 300))}</TextUpplysningMoms>`);
  lines.push("</Moms>", "</eSKDUpload>");
  return lines.join("\r\n") + "\r\n";
}

/** YYMM for a month, YY-Q for a calendar quarter. */
export function eslCode(from: Ymd, to: Ymd): string {
  const yy = from.slice(2, 4);
  return from.slice(0, 7) === to.slice(0, 7) ? yy + from.slice(5, 7) : `${yy}-${(Number(from.slice(5, 7)) + 2) / 3}`;
}

const amount = (v: bigint) => (v === 0n ? "" : v.toString());

/** SKV574008: identifier, reporter row, one row per buyer (goods; triangulation; services;). */
export function eslFile(vatNr: string, from: Ymd, to: Ymd, contact: { name: string; phone: string; email?: string }, rows: EslRow[]): string {
  const own = vatNr.replace(/\s/g, "").replace(/^SE/i, "");
  const head = [own, eslCode(from, to), contact.name.trim(), contact.phone.trim(), ...(contact.email?.trim() ? [contact.email.trim()] : [])].join(";");
  return ["SKV574008;", head, ...rows.map((r) => `${r.vatNr};${amount(r.goods)};${amount(r.triangulation)};${amount(r.services)};`)].join("\r\n") + "\r\n";
}

/** Headings as on Skatteverket's form ("Fylla i momsdeklarationen", V3). */
export const BOX_SV: Record<number, string> = {
  5: "Momspliktig försäljning som inte ingår i fält 06, 07 eller 08", 6: "Momspliktiga uttag",
  7: "Beskattningsunderlag vid vinstmarginalbeskattning", 8: "Hyresinkomster vid frivillig beskattning",
  10: "Utgående moms 25 %", 11: "Utgående moms 12 %", 12: "Utgående moms 6 %",
  20: "Inköp av varor från annat EU-land", 21: "Inköp av tjänster från annat EU-land, enligt huvudregeln",
  22: "Inköp av tjänster från land utanför EU", 23: "Inköp av varor i Sverige som köparen är betalningsskyldig för",
  24: "Övriga inköp av tjänster i Sverige som köparen är betalningsskyldig för",
  30: "Utgående moms 25 %", 31: "Utgående moms 12 %", 32: "Utgående moms 6 %",
  35: "Försäljning av varor till annat EU-land", 36: "Försäljning av varor utanför EU",
  37: "Mellanmans inköp av varor vid trepartshandel", 38: "Mellanmans försäljning av varor vid trepartshandel",
  39: "Försäljning av tjänster till beskattningsbar person i annat EU-land, enligt huvudregeln",
  40: "Övrig försäljning av tjänster som tillhandahållits utomlands", 41: "Försäljning när köparen är betalningsskyldig i Sverige",
  42: "Övrig försäljning med mera", 50: "Beskattningsunderlag vid import",
  60: "Utgående moms 25 %", 61: "Utgående moms 12 %", 62: "Utgående moms 6 %",
  48: "Ingående moms att dra av", 49: "Moms att betala eller få tillbaka",
};

export const SECTION_SV: Record<string, string> = {
  A: "Momspliktig försäljning eller uttag exklusive moms", B: "Utgående moms på försäljning eller uttag i fält 05–08",
  C: "Momspliktiga inköp vid omvänd betalningsskyldighet", D: "Utgående moms på inköp i fält 20–24",
  E: "Försäljning med mera som är undantagen från moms", H: "Import", I: "Utgående moms på import i fält 50",
  F: "Ingående moms", G: "Moms att betala eller få tillbaka",
};
