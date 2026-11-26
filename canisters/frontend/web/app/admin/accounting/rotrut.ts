// ROT/RUT in the browser (V12): buyers and the property encrypted with pii-v1, the claim
// XML for Skatteverket's "Rot och rut – företag" (schema 1.0, or 1.1 from 2027) and the
// decision file. Both need the decrypted personnummer, so they are built here.
import { HusKind, type Claim, type CompanyProfile, type HusCase, type HusPart } from "../../bindings/accounting";
import type { Accounting } from "./api";
import { decryptPii, encryptPii, normalizePnr } from "./payroll";

export const ROT_TYPES = ["BYGG", "EL", "GLASARBETE", "MARKARBETE", "MALNING_TAPETSERING", "MURNING", "VVS"] as const;
export const RUT_TYPES = [
  "BARNPASSNING", "FLYTTJANSTER", "IT_TJANSTER", "KLAD_TEXTILVARD", "MOBLERING", "PERSONLIG_OMSORG", "REPARATION_VITVAROR",
  "SNOSKOTTNING", "STADNING", "TILLSYN_AV_BOSTAD", "TRADGARDSARBETE", "TRANSPORT_TILL_FORSALJNING", "TVATT_VID_TVATTINRATTNING",
] as const;
export const workTypes = (k: HusKind): readonly string[] => (k === HusKind.rot ? ROT_TYPES : RUT_TYPES);

export type Identity = { name: string; personnummer: string };
export type Property = { fastighetsbeteckning: string } | { brfOrgNr: string; lagenhetsnummer: string };

export const encryptIdentity = (acc: Accounting, i: Identity) => encryptPii(acc, JSON.stringify(i));
export const encryptProperty = (acc: Accounting, p: Property) => encryptPii(acc, JSON.stringify(p));

export async function decryptIdentity(acc: Accounting, b: Uint8Array | number[]): Promise<Identity> {
  const v = JSON.parse(await decryptPii(acc, b)) as Identity;
  if (typeof v.name !== "string" || typeof v.personnummer !== "string") throw new Error("identity");
  return v;
}

export async function decryptProperty(acc: Accounting, b: Uint8Array | number[]): Promise<Property> {
  return JSON.parse(await decryptPii(acc, b)) as Property;
}

/** The buyer must turn 18 at the latest in the payment year (e-service check, V12). */
export const adultIn = (pnr: string, year: number) => Number(pnr.slice(0, 4)) <= year - 18;

/** Whole kronor split by shares (basis points); the first takes the remainder (as lib/RotRut.mo). */
export function splitKr(kronor: bigint, shares: bigint[]): bigint[] {
  const parts = shares.map((s) => (kronor * s) / 10_000n);
  const used = parts.reduce((a, b) => a + b, 0n);
  return parts.map((p, i) => (i === 0 ? p + kronor - used : p));
}

const kr = (ore: bigint) => ore / 100n;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "16" + organisationsnummer, the 12-digit form the decision file uses for `utforare`. */
export const performerId = (orgNr: string) => `16${orgNr.replace(/\D/g, "")}`;

export type ClaimCase = { c: HusCase; hus: HusPart; buyers: Identity[]; property?: Property };

/** One Arende per buyer and case, element order as in Begaran.xsd. */
export function claimXml(company: CompanyProfile, claim: Claim, cases: ClaimCase[]): string {
  const v11 = claim.xmlVersion === "1.1";
  const ns = `http://xmls.skatteverket.se/se/skatteverket/skattered/begaran/${v11 ? "1.1" : "1.0"}`;
  const el = (name: string, v: string | bigint, ind = "        ") => `${ind}<p:${name}>${typeof v === "string" ? esc(v) : String(v)}</p:${name}>\n`;
  let body = "";
  for (const { c, hus, buyers, property } of cases) {
    const shares = hus.buyers.map((b) => b.shareBp);
    if (buyers.length !== shares.length) throw new Error("buyers");
    const labour = splitKr(kr(c.labour), shares);
    const material = splitKr(kr(c.material), shares);
    const other = splitKr(kr(c.other), shares);
    // Per work type: hours and material, split the same way.
    const perType = c.hours.map((h) => {
      const w = hus.work.find((x) => x.workType === h.workType);
      const mat = hus.material > 0n && w ? (c.material * w.material) / hus.material : 0n;
      return { type: h.workType, hours: splitKr(h.hours, shares), material: splitKr(kr(mat), shares) };
    });
    // Material per type is rounded down; the first type takes what is left of the buyer's material.
    buyers.forEach((b, i) => {
      const pnr = normalizePnr(b.personnummer);
      if (!pnr) throw new Error(`personnummer ${b.name}`);
      if (!adultIn(pnr, Number(c.year))) throw new Error(`age ${b.name}`);
      const requested = kr(c.buyerAmounts[i]);
      const paid = labour[i] - requested;
      if (requested > paid || requested + paid > labour[i]) throw new Error("amounts");
      let a = "    <p:Arende>\n" + el("FakturaNr", String(c.invoiceNumber), "      ") + el("Kopare", pnr, "      ");
      if (c.kind === HusKind.rot) {
        if (!property) throw new Error("property");
        a += "      <p:Fastighet>\n";
        if ("fastighetsbeteckning" in property) a += el("Fastighetsbeteckning", property.fastighetsbeteckning);
        else a += el("LagenhetsNr", property.lagenhetsnummer) + el("BrfOrgNr", property.brfOrgNr.replace(/\D/g, ""));
        a += "      </p:Fastighet>\n";
      }
      const typeMat = perType.map((t) => t.material[i]);
      const rest = material[i] - typeMat.reduce((x, y) => x + y, 0n);
      perType.forEach((t, j) => {
        a += "      <p:UtfortArbete>\n" + el("TypAvUtfortArbete", t.type) + el("AntalTimmar", t.hours[i]) + el("Kostnad", typeMat[j] + (j === 0 ? rest : 0n)) + "      </p:UtfortArbete>\n";
      });
      a += el("OvrigKostnad", other[i], "      ") + el("Betalningsdatum", c.paymentDate, "      ") + el("Arbetskostnad", labour[i], "      ") +
        el("BetaltBelopp", paid, "      ") + el("BegartBelopp", requested, "      ");
      if (v11) a += el("Underentreprenor", String(c.subcontractor), "      ") + el("Bemanningsforetag", String(c.staffingAgency), "      ");
      body += a + "    </p:Arende>\n";
    });
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<p:Begaran xmlns:p="${ns}">\n` +
    `    <p:NamnPaBegaran>${esc(claim.name)}</p:NamnPaBegaran>\n    <p:TypAvBegaran>${claim.kind === HusKind.rot ? "ROT" : "RUT"}</p:TypAvBegaran>\n` +
    `    <p:Utforare>${performerId(company.orgNr)}</p:Utforare>\n${body}</p:Begaran>\n`;
}

// ── Decision file (Beslut.json, version 1) ──

export type DecisionEntry = { personnummer: string; fakturanummer: string; godkantBelopp: number };
export type Decision = { namn: string; referensnummer: string; arenden: DecisionEntry[] };
export type DecisionFile = { version: string; utforare: string; beslut: Decision[] };

/** Parses and checks the decision export against its JSON schema (V12). */
export function parseDecision(text: string): DecisionFile {
  const v = JSON.parse(text) as DecisionFile;
  const bad = (what: string) => { throw new Error(`decision: ${what}`); };
  if (typeof v !== "object" || v === null || typeof v.version !== "string" || typeof v.utforare !== "string" || !Array.isArray(v.beslut)) bad("root");
  for (const b of v.beslut) {
    if (typeof b.namn !== "string" || typeof b.referensnummer !== "string" || !/^\d{11}(-\d+)?$/.test(b.referensnummer) || !Array.isArray(b.arenden)) bad("beslut");
    for (const a of b.arenden) {
      if (typeof a.personnummer !== "string" || !/^\d{12}$/.test(a.personnummer) || typeof a.fakturanummer !== "string"
        || !Number.isInteger(a.godkantBelopp) || a.godkantBelopp < 0) bad("arende");
    }
  }
  return v;
}

export type DecisionMatch = { caseId: bigint; approved: bigint; reference: string };

/**
 * Matches decisions to submitted cases on invoice number + personnummer. A case's approved
 * amount is the sum over its buyers and over the decision's entries (Skatteverket lists a
 * claim and its payouts, "-01" etc., separately). When an invoice has several open cases,
 * the decision's name must equal the claim's.
 */
export function matchDecision(file: DecisionFile, open: { c: HusCase; claimName: string; pnrs: string[] }[]): { matches: DecisionMatch[]; unmatched: number } {
  const sum = new Map<bigint, { approved: bigint; refs: string[] }>();
  let unmatched = 0;
  for (const b of file.beslut) for (const a of b.arenden) {
    let hits = open.filter((o) => String(o.c.invoiceNumber) === a.fakturanummer && o.pnrs.includes(a.personnummer));
    if (hits.length > 1) hits = hits.filter((o) => o.claimName === b.namn);
    if (hits.length !== 1) { unmatched++; continue; }
    const s = sum.get(hits[0].c.id) ?? { approved: 0n, refs: [] };
    s.approved += BigInt(a.godkantBelopp) * 100n;
    if (a.godkantBelopp > 0 || !s.refs.length) s.refs.push(b.referensnummer);
    sum.set(hits[0].c.id, s);
  }
  const matches = [...sum].map(([caseId, s]) => {
    const payout = s.refs.find((r) => r.includes("-")) ?? s.refs[0];
    return { caseId, approved: s.approved, reference: payout };
  });
  return { matches, unmatched };
}

/** Days left to the claim deadline (31 January the year after payment). */
export const daysLeft = (deadline: string, today: string) => Math.round((Date.parse(deadline) - Date.parse(today)) / 86_400_000);
