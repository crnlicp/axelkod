// ROT/RUT in the browser (V12): the claim XML valid against Skatteverket's Begaran.xsd
// 1.0 and 1.1 (with the 2027 fields), one Arende per buyer with the amounts split by share,
// and the decision file parsed and matched as in Skatteverket's example export.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { validateXML } from "xmllint-wasm";
import { CaseStatus, HusKind, type Claim, type CompanyProfile, type HusCase, type HusPart } from "../../app/bindings/accounting";
import { claimXml, matchDecision, parseDecision, splitKr, type ClaimCase } from "../../app/admin/accounting/rotrut";

const fx = (p: string) => readFileSync(new URL(`../fixtures/${p}`, import.meta.url), "utf8");

async function validate(xml: string, version: "1.0" | "1.1") {
  const r = await validateXML({ xml: [{ fileName: "begaran.xml", contents: xml }], schema: [{ fileName: "Begaran.xsd", contents: fx(`xsd/rotrut-${version}/Begaran.xsd`) }] });
  return r.errors.map((e) => e.rawMessage);
}

const company = { orgNr: "556036-0793" } as CompanyProfile;
const enc = new Uint8Array([1]);

// Skatteverket's example (V12): labour 10 000 + VAT, material 8 000 + VAT, travel 400 + VAT; deduction 3 750 kr.
const rot: HusPart = {
  kind: HusKind.rot, rateBp: 3000n, lineParts: [], labour: 1_250_000n, material: 1_000_000n, other: 50_000n, deduction: 375_000n,
  work: [{ workType: "EL", labour: 1_250_000n, material: 1_000_000n }],
  buyers: [{ identityEnc: enc, shareBp: 5000n, amount: 187_500n }, { identityEnc: enc, shareBp: 5000n, amount: 187_500n }],
};
const caseOf = (over: Partial<HusCase>): HusCase => ({
  id: 1n, salesDocId: 10n, invoiceNumber: 1042n, kind: HusKind.rot, paymentIds: [3n], paymentDate: "2026-11-20", year: 2026n,
  labour: 1_250_000n, paidLabour: 875_000n, requested: 375_000n, material: 1_000_000n, other: 50_000n, hours: [{ workType: "EL", hours: 9n }],
  buyerAmounts: [187_500n, 187_500n], subcontractor: false, staffingAgency: true, deadline: "2027-01-31", status: CaseStatus.claimed,
  createdAt: 0n, createdBy: {} as HusCase["createdBy"], ...over,
});
const claim = (version: string, kind = HusKind.rot): Claim => ({
  id: 5n, kind, year: 2026n, name: "Nov 2026", caseIds: [1n], xmlVersion: version, createdAt: 0n, createdBy: {} as Claim["createdBy"], confirmed: true,
});
const buyers = [{ name: "Anna", personnummer: "198202252386" }, { name: "Bo", personnummer: "195803120194" }];
const rotCase: ClaimCase = { c: caseOf({}), hus: rot, buyers, property: { fastighetsbeteckning: "Göteborg Inom Vallgraven 12:3" } };

test("Skatteverket's example files are valid against their own schemas", async () => {
  expect(await validate(fx("rotrut/Rot_V1.0.xml"), "1.0")).toEqual([]);
  expect(await validate(fx("rotrut/Rut_V1.0.xml"), "1.0")).toEqual([]);
  expect(await validate(fx("rotrut/Rot_V1.1.xml"), "1.1")).toEqual([]);
  expect(await validate(fx("rotrut/Rut_V1.1.xml"), "1.1")).toEqual([]);
});

test("ROT claim, XML 1.0: one Arende per buyer, amounts split by share, valid against the XSD", async () => {
  const xml = claimXml(company, claim("1.0"), [rotCase]);
  expect(await validate(xml, "1.0")).toEqual([]);
  expect(xml.match(/<p:Arende>/g)).toHaveLength(2);
  expect(xml).toContain("<p:Utforare>165560360793</p:Utforare>");
  expect(xml).toContain("<p:TypAvBegaran>ROT</p:TypAvBegaran>");
  // 12 500 kr labour, 3 750 kr deduction: 6 250 / 1 875 per buyer, paid 4 375.
  expect(xml).toContain("<p:Arbetskostnad>6250</p:Arbetskostnad>");
  expect(xml).toContain("<p:BegartBelopp>1875</p:BegartBelopp>");
  expect(xml).toContain("<p:BetaltBelopp>4375</p:BetaltBelopp>");
  expect(xml).toContain("<p:AntalTimmar>5</p:AntalTimmar>"); // 9 h: 5 + 4
  expect(xml).toContain("<p:Kostnad>5000</p:Kostnad>");
  expect(xml).toContain("<p:OvrigKostnad>250</p:OvrigKostnad>");
  expect(xml).not.toContain("Underentreprenor");
});

test("XML 1.1 (from 2027) adds subcontractor and staffing agency; a BRF apartment", async () => {
  const xml = claimXml(company, claim("1.1"), [{ ...rotCase, property: { brfOrgNr: "769600-1234", lagenhetsnummer: "1102" } }]);
  expect(await validate(xml, "1.1")).toEqual([]);
  expect(xml).toContain("<p:Underentreprenor>false</p:Underentreprenor>");
  expect(xml).toContain("<p:Bemanningsforetag>true</p:Bemanningsforetag>");
  expect(xml).toContain("<p:LagenhetsNr>1102</p:LagenhetsNr>");
  expect(xml).toContain("<p:BrfOrgNr>7696001234</p:BrfOrgNr>");
  expect(await validate(xml, "1.0")).not.toEqual([]);
});

test("RUT claim: no property; a buyer under 18 or a bad personnummer is refused", async () => {
  const rut: HusPart = { ...rot, kind: HusKind.rut, rateBp: 5000n, deduction: 625_000n, material: 0n, work: [{ workType: "IT_TJANSTER", labour: 1_250_000n, material: 0n }], buyers: [{ identityEnc: enc, shareBp: 10_000n, amount: 625_000n }] };
  const c = caseOf({ kind: HusKind.rut, requested: 625_000n, paidLabour: 625_000n, material: 0n, hours: [{ workType: "IT_TJANSTER", hours: 4n }], buyerAmounts: [625_000n] });
  const xml = claimXml(company, claim("1.0", HusKind.rut), [{ c, hus: rut, buyers: [buyers[0]] }]);
  expect(await validate(xml, "1.0")).toEqual([]);
  expect(xml).not.toContain("Fastighet");
  expect(() => claimXml(company, claim("1.0", HusKind.rut), [{ c, hus: rut, buyers: [{ name: "Ung", personnummer: "201001012382" }] }])).toThrow();
  expect(() => claimXml(company, claim("1.0", HusKind.rut), [{ c, hus: rut, buyers: [{ name: "X", personnummer: "198202252387" }] }])).toThrow(/personnummer/);
});

test("split in whole kronor, the first buyer takes the remainder (as the canister)", () => {
  expect(splitKr(3750n, [3333n, 6667n])).toEqual([1250n, 2500n]);
  expect(splitKr(9n, [5000n, 5000n])).toEqual([5n, 4n]);
});

test("decision file: Skatteverket's example parses; entries match on invoice + personnummer and sum", () => {
  const file = parseDecision(fx("rotrut/beslut-exempel.json"));
  expect(file.beslut).toHaveLength(4);
  const open = [
    { c: caseOf({ id: 7n, invoiceNumber: 96458n, status: CaseStatus.submitted }), claimName: "Jobb för Johansson", pnrs: ["193610058590"] },
    { c: caseOf({ id: 8n, invoiceNumber: 123n, status: CaseStatus.submitted }), claimName: "Min andra skickade begäran", pnrs: ["194711052326"] },
  ];
  const { matches, unmatched } = matchDecision(file, open);
  // 96458: 2 000 kr in the payout "-01" and 0 kr in the claim itself.
  expect(matches.find((m) => m.caseId === 7n)).toEqual({ caseId: 7n, approved: 200_000n, reference: "20260000185-01" });
  expect(matches.find((m) => m.caseId === 8n)).toEqual({ caseId: 8n, approved: 80_000n, reference: "20260000186-01" });
  expect(unmatched).toBe(4);
  expect(() => parseDecision('{"version":"1","utforare":"1","beslut":[{"namn":"x","referensnummer":"1","arenden":[]}]}')).toThrow();
});
