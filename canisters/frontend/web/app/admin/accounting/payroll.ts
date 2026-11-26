// Lön helpers in the browser: Skatteverket's monthly tax-table file (V10), personnummer,
// personal data encrypted with the pii-v1 vetKey (C16), and the AGI XML (V7, schema 1.1),
// which needs the decrypted personnummer and so is built here, never in the canister.
import { Role, type AgiReturn, type CompanyProfile, type TaxTableRow } from "../../bindings/accounting";
import type { Accounting } from "./api";
import { purposeKey } from "./crypto";

/** Payroll writes: owner and payroll (the canister checks too). */
export const canPayroll = (role: Role) => role === Role.owner || role === Role.payroll;

// ── Tax tables (V10: "Postbeskrivning allmänna tabeller 2026") ──

/**
 * Fixed width: 1–2 "30" (monthly), 3 "B" amount / "%" percent, 4–5 table, 6–12 lowest
 * income, 13–19 highest (blank on the open top row), then six columns of five characters.
 */
export function parseTaxTables(text: string): Map<number, TaxTableRow[]> {
  const out = new Map<number, TaxTableRow[]>();
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    if (raw.length < 20 || raw.slice(0, 2) !== "30") continue;
    const kind = raw[2];
    if (kind !== "B" && kind !== "%") continue;
    const table = Number(raw.slice(3, 5));
    const from = Number(raw.slice(5, 12).trim());
    const toText = raw.slice(12, 19).trim();
    const to = toText === "" ? 9_999_999 : Number(toText);
    const cols: bigint[] = [];
    for (let i = 0; i < 6; i++) cols.push(BigInt(Number(raw.slice(19 + i * 5, 24 + i * 5).trim() || "0")));
    if (!Number.isInteger(table) || !Number.isInteger(from) || !Number.isInteger(to) || cols.some((c) => c < 0n)) throw new Error(`row: ${raw}`);
    const rows: TaxTableRow[] = out.get(table) ?? [];
    rows.push({ from: BigInt(from), to: BigInt(to), percent: kind === "%", cols });
    out.set(table, rows);
  }
  for (const rows of out.values()) rows.sort((a, b) => Number(a.from - b.from));
  return out;
}

// ── Personnummer ──

/** 12 digits YYYYMMDDNNNC with a valid Luhn check digit; returns null when not valid. */
export function normalizePnr(input: string): string | null {
  const d = input.replace(/[\s-+]/g, "");
  if (!/^\d{12}$/.test(d)) return null;
  const tail = d.slice(2);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = Number(tail[i]) * (i % 2 === 0 ? 2 : 1);
    if (v > 9) v -= 9;
    sum += v;
  }
  if ((10 - (sum % 10)) % 10 !== Number(tail[9])) return null;
  const m = Number(d.slice(4, 6));
  const day = Number(d.slice(6, 8));
  // Samordningsnummer add 60 to the day.
  if (m < 1 || m > 12 || day < 1 || (day > 31 && (day < 61 || day > 91))) return null;
  return d;
}

/** Tax-table column for 2026 (V10): 1 under 66 at the start of the year, else 3. */
export const suggestedColumn = (birthYear: number, year: number) => (year - 1 - birthYear >= 66 ? 3 : 1);

// ── Personal data (pii-v1) ──

const DOMAIN = "axelkod-accounting-pii";

export async function encryptPii(acc: Accounting, text: string): Promise<Uint8Array> {
  const key = await purposeKey(acc, "pii-v1");
  return key.encryptMessage(new TextEncoder().encode(text), DOMAIN, "");
}

export async function decryptPii(acc: Accounting, cipher: Uint8Array | number[]): Promise<string> {
  const key = await purposeKey(acc, "pii-v1");
  return new TextDecoder().decode(await key.decryptMessage(Uint8Array.from(cipher), DOMAIN, ""));
}

// ── AGI XML (V7: arbetsgivardeklaration 1.1, document 1.1.18.2) ──

const NS = "http://xmls.skatteverket.se/se/skatteverket/da/instans/schema/1.1";
const NS_AGD = "http://xmls.skatteverket.se/se/skatteverket/da/komponent/schema/1.1";

/** Field code → element name (Fältlista 1.1.18.1). */
export const AGI_ELEMENTS: Record<number, string> = {
  1: "AvdrPrelSkatt", 11: "KontantErsattningUlagAG", 12: "SkatteplOvrigaFormanerUlagAG", 13: "SkatteplBilformanUlagAG",
  18: "DrivmVidBilformanUlagAG", 19: "AvdragUtgiftArbetet", 20: "AndraKostnadsers", 50: "Bilersattning", 51: "Traktamente",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad3 = (n: bigint | number) => String(n).padStart(3, "0");

/** Organisationsnummer as AgRegistreradId: "16" + 10 digits (Exempelfil 15). */
export const agRegId = (orgNr: string) => `16${orgNr.replace(/\D/g, "")}`;

export type AgiPayee = { employeeId: bigint; personnummer: string; street?: string; city?: string };
export type AgiContact = { name: string; phone: string; email: string };

/**
 * The file for one period: Avsandare, Blankettgemensamt, one Blankett with the HU (201,
 * 006, 487, 497) and one per IU (201, 215, 006, 570, workplace 245/246, the fields).
 * Kryss fields (050, 051) are written as 1; amounts are whole kronor.
 */
export function agiXml(company: CompanyProfile, contact: AgiContact, a: AgiReturn, payees: AgiPayee[], created: Date, program = "Axelkod Ekonomi"): string {
  const org = agRegId(company.orgNr);
  const period = a.period;
  const stamp = created.toISOString().slice(0, 19);
  const blankett = (inner: string) =>
    `  <agd:Blankett>\n    <agd:Arendeinformation>\n      <agd:Arendeagare>${org}</agd:Arendeagare>\n      <agd:Period>${period}</agd:Period>\n    </agd:Arendeinformation>\n    <agd:Blankettinnehall>\n${inner}    </agd:Blankettinnehall>\n  </agd:Blankett>\n`;
  const field = (el: string, code: string, v: string) => `        <agd:${el} faltkod="${code}">${v}</agd:${el}>\n`;
  let body = blankett(
    "      <agd:HU>\n" +
    `        <agd:ArbetsgivareHUGROUP>\n  ${field("AgRegistreradId", "201", org)}        </agd:ArbetsgivareHUGROUP>\n` +
    field("RedovisningsPeriod", "006", period) +
    field("SummaArbAvgSlf", "487", String(a.sumFees)) +
    field("SummaSkatteavdr", "497", String(a.sumTax)) +
    "      </agd:HU>\n");
  for (const ind of a.individuals) {
    const p = payees.find((x) => x.employeeId === ind.employeeId);
    if (!p) throw new Error(`personnummer ${ind.employeeId}`);
    let iu = "      <agd:IU>\n" +
      `        <agd:ArbetsgivareIUGROUP>\n  ${field("AgRegistreradId", "201", org)}        </agd:ArbetsgivareIUGROUP>\n` +
      `        <agd:BetalningsmottagareIUGROUP>\n          <agd:BetalningsmottagareIDChoice>\n    ${field("BetalningsmottagarId", "215", p.personnummer)}          </agd:BetalningsmottagareIDChoice>\n        </agd:BetalningsmottagareIUGROUP>\n` +
      field("RedovisningsPeriod", "006", period) +
      field("Specifikationsnummer", "570", pad3(ind.specNr));
    if (p.street) iu += field("ArbetsplatsensGatuadress", "245", esc(p.street));
    if (p.city) iu += field("ArbetsplatsensOrt", "246", esc(p.city));
    for (const f of [...ind.fields].sort((x, y) => Number(x.code - y.code))) {
      const el = AGI_ELEMENTS[Number(f.code)];
      if (!el) throw new Error(`field ${f.code}`);
      // BELOPP fields are 0 or more (Fältlista, Fälttyp): a negative month needs a correction instead.
      if (f.amount < 0n) throw new Error(`negative ${f.code}`);
      const v = Number(f.code) === 50 || Number(f.code) === 51 ? "1" : String(f.amount);
      iu += field(el, pad3(f.code), v);
    }
    body += blankett(iu + "      </agd:IU>\n");
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
    `<Skatteverket omrade="Arbetsgivardeklaration" xmlns="${NS}" xmlns:agd="${NS_AGD}">\n` +
    `  <agd:Avsandare>\n    <agd:Programnamn>${esc(program)}</agd:Programnamn>\n    <agd:Organisationsnummer>${org}</agd:Organisationsnummer>\n` +
    `    <agd:TekniskKontaktperson>\n      <agd:Namn>${esc(contact.name)}</agd:Namn>\n      <agd:Telefon>${esc(contact.phone)}</agd:Telefon>\n      <agd:Epostadress>${esc(contact.email)}</agd:Epostadress>\n    </agd:TekniskKontaktperson>\n` +
    `    <agd:Skapad>${stamp}</agd:Skapad>\n  </agd:Avsandare>\n` +
    `  <agd:Blankettgemensamt>\n    <agd:Arbetsgivare>\n      <agd:AgRegistreradId>${org}</agd:AgRegistreradId>\n      <agd:Kontaktperson>\n        <agd:Namn>${esc(contact.name)}</agd:Namn>\n        <agd:Telefon>${esc(contact.phone)}</agd:Telefon>\n        <agd:Epostadress>${esc(contact.email)}</agd:Epostadress>\n      </agd:Kontaktperson>\n    </agd:Arbetsgivare>\n  </agd:Blankettgemensamt>\n` +
    body + "</Skatteverket>\n";
}
