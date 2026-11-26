// Lön in the browser: Skatteverket's 2026 monthly tax-table file parsed as the record
// description says (V10), personnummer checks, and the AGI XML (V7) valid against the
// official XSD 1.1 and carrying the same figures as Skatteverket's example file 15.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { validateXML } from "xmllint-wasm";
import type { AgiReturn, CompanyProfile } from "../../app/bindings/accounting";
import { agRegId, agiXml, normalizePnr, parseTaxTables, suggestedColumn } from "../../app/admin/accounting/payroll";

const fx = (p: string) => readFileSync(new URL(`../fixtures/${p}`, import.meta.url), "utf8");
const xsd = "xsd/agi-1.1/";

async function validate(xml: string) {
  const r = await validateXML({
    xml: [{ fileName: "agi.xml", contents: xml }],
    schema: [{ fileName: "arbetsgivardeklaration_1.1.xsd", contents: fx(xsd + "arbetsgivardeklaration_1.1.xsd") }],
    preload: [{ fileName: "arbetsgivardeklaration_component_1.1.xsd", contents: fx(xsd + "arbetsgivardeklaration_component_1.1.xsd") }],
  });
  return r.errors.map((e) => e.rawMessage);
}

test("tax tables 2026: every table 29–42, amount rows to 80 000 kr, percent rows above, open top row", () => {
  const t = parseTaxTables(fx("agi/allmanna-tabeller-manad-2026.txt"));
  expect([...t.keys()].sort((a, b) => a - b)).toEqual([29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42]);
  const t33 = t.get(33)!;
  expect(t33.find((r) => r.from === 29_801n)).toEqual({ from: 29_801n, to: 30_000n, percent: false, cols: [5878n, 5748n, 2644n, 5878n, 9103n, 9103n] });
  // 5-character columns that touch each other ("265952646723362…") are split by position.
  expect(t33.find((r) => r.from === 79_801n)?.cols).toEqual([26595n, 26467n, 23362n, 23386n, 30888n, 30888n]);
  expect(t33.find((r) => r.from === 80_001n)).toMatchObject({ percent: true, cols: [33n, 33n, 29n, 29n, 39n, 39n] });
  expect(t33.at(-1)).toMatchObject({ from: 1_269_001n, to: 9_999_999n, percent: true });
  for (let i = 1; i < t33.length; i++) expect(t33[i].from).toBeGreaterThan(t33[i - 1].to);
});

test("personnummer: Luhn, 12 digits, samordningsnummer; tax column by age", () => {
  expect(normalizePnr("19820225-2386")).toBe("198202252386"); // Skatteverket's example 15
  expect(normalizePnr("200711272385")).toBe("200711272385");
  expect(normalizePnr("198202252387")).toBeNull();
  expect(normalizePnr("8202252386")).toBeNull();
  expect(normalizePnr("198202852383")).not.toBeNull(); // day + 60
  expect(suggestedColumn(1960, 2026)).toBe(1);
  expect(suggestedColumn(1959, 2026)).toBe(3);
});

const company: CompanyProfile = {
  legalName: "Företaget AB", orgNr: "556026-9986", vatNr: "SE556026998601", registeredOffice: "Visby", street: "Arbetsgatan 21",
  postalCode: "62145", city: "Visby", country: "SE", email: "viljam.vessla@foretaget.se", fSkatt: true,
};
// Skatteverket's Exempelfil 15 (202604), as an AgiReturn from the canister.
const ret: AgiReturn = {
  id: 1n, period: "202604", runIds: [1n], sumFees: 18_881n, sumTax: 28_140n, createdAt: 0n, createdBy: null as never,
  individuals: [
    { employeeId: 1n, specNr: 1n, fields: [{ code: 1n, amount: 9_300n }, { code: 11n, amount: 28_500n }, { code: 13n, amount: 2_500n }, { code: 18n, amount: 1_200n }] },
    { employeeId: 2n, specNr: 2n, fields: [{ code: 1n, amount: 7_590n }, { code: 11n, amount: 25_350n }, { code: 50n, amount: 1n }] },
    { employeeId: 3n, specNr: 3n, fields: [{ code: 1n, amount: 3_250n }, { code: 11n, amount: 16_700n }, { code: 51n, amount: 1n }] },
    { employeeId: 4n, specNr: 4n, fields: [{ code: 1n, amount: 8_000n }, { code: 11n, amount: 25_800n }, { code: 13n, amount: 2_500n }] },
  ],
};
const payees = [["198202252386"], ["194406098824"], ["193603119045"], ["200711272385"]].map(([p], i) => ({ employeeId: BigInt(i + 1), personnummer: p, street: "Arbetsgatan 21", city: "Jobbstaden" }));

test("AGI XML is valid against arbetsgivardeklaration_1.1.xsd and matches example 15", async () => {
  const xml = agiXml(company, { name: "Viljam Vessla", phone: "555-244454", email: "viljam.vessla@foretaget.se" }, ret, payees, new Date("2026-05-07T07:42:25Z"));
  expect(await validate(xml)).toEqual([]);
  expect(await validate(fx("agi/Exempelfil_15_Olika_aldrar_v1.1.18.1.xml"))).toEqual([]);
  const example = fx("agi/Exempelfil_15_Olika_aldrar_v1.1.18.1.xml");
  const values = (x: string) => [...x.matchAll(/faltkod="(\d+)">([^<]+)</g)].map((m) => `${m[1]}=${m[2]}`).filter((v) => !/^(245|246|570)=/.test(v)).sort();
  expect(values(xml)).toEqual(values(example));
  expect(agRegId("556026-9986")).toBe("165560269986");
});

test("AGI zero return: only the HU with 487 = 0 and 497 = 0", async () => {
  const xml = agiXml(company, { name: "A", phone: "1", email: "a@example.se" }, { ...ret, individuals: [], sumFees: 0n, sumTax: 0n }, [], new Date("2026-05-07T00:00:00Z"));
  expect(await validate(xml)).toEqual([]);
  expect(xml).toContain('<agd:SummaArbAvgSlf faltkod="487">0</agd:SummaArbAvgSlf>');
  expect(xml).not.toContain("<agd:IU>");
});
