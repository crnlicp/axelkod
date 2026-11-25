// Peppol BIS 3.0 export: valid against the UBL 2.1 schemas (OASIS os-UBL-2.1, xsd/ in
// tests/fixtures/xsd/ubl-2.1) and the Swedish national rules SE-R-001…013 we can
// check without a Schematron engine.
import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { validateXML } from "xmllint-wasm";
import { CUSTOMIZATION_ID, PROFILE_ID, toUbl } from "../../app/admin/accounting/peppol";
import { DocKind, Lang, Variant_person_company, type Snapshot } from "../../app/bindings/accounting";

const xsd = new URL("../fixtures/xsd/ubl-2.1/", import.meta.url);
const common = readdirSync(new URL("common/", xsd)).map((f) => ({ fileName: `common/${f}`, contents: readFileSync(new URL(`common/${f}`, xsd), "utf8") }));

async function validate(xml: string, main: "UBL-Invoice-2.1.xsd" | "UBL-CreditNote-2.1.xsd") {
  const r = await validateXML({
    xml: [{ fileName: "doc.xml", contents: xml }],
    schema: [{ fileName: `maindoc/${main}`, contents: readFileSync(new URL(`maindoc/${main}`, xsd), "utf8") }],
    preload: common,
  });
  return r.errors.map((e) => e.rawMessage);
}

const seller = {
  legalName: "Axelkod AB", orgNr: "556036-0793", vatNr: "SE556036079301", registeredOffice: "Göteborg", street: "Gatan 1", postalCode: "411 01",
  city: "Göteborg", country: "SE", email: "faktura@example.se", fSkatt: true, bankgiro: "5050-1055",
};
const invoice: Snapshot = {
  kind: DocKind.invoice, number: 1042n, seller, language: Lang.sv, issueDate: "2026-11-25", dueDate: "2026-12-25", deliveryDate: "2026-11-20",
  buyer: { kind: Variant_person_company.company, name: "Kund & Co AB", orgNr: "556036-0793", address: { street: "Vägen 2", postalCode: "111 22", city: "Stockholm", country: "SE" } },
  currency: "SEK", lines: [
    { description: "Konsulttimmar", quantity: 2_500n, unit: "h", unitPrice: 120_000n, discountBp: 0n, vatCode: "U25", rateBp: 2_500n, account: 3001n, net: 300_000n },
    { description: "Bok", quantity: 1_000n, unit: "st", unitPrice: 20_000n, discountBp: 1_000n, vatCode: "U6", rateBp: 600n, account: 3003n, net: 18_000n },
  ],
  vat: [{ vatCode: "U25", rateBp: 2_500n, category: "S", base: 300_000n, vat: 75_000n }, { vatCode: "U6", rateBp: 600n, category: "S", base: 18_000n, vat: 1_080n }],
  totalNet: 318_000n, totalVat: 76_080n, total: 394_080n, legalNotes: [], ocr: "104265", termsDays: 30n,
  lateInterestText: "Dröjsmålsränta enligt räntelagen", templateVersion: "invoice@1",
};
const euInvoice: Snapshot = {
  ...invoice, language: Lang.en, currency: "EUR", fxRate: { rate: 11_234_500n, date: "2026-11-24" }, totalVatSek: 0n,
  buyer: { kind: Variant_person_company.company, name: "Kunde GmbH", vatNr: "DE123456789", peppolId: "9930:DE123456789", address: { street: "Str. 1", postalCode: "10115", city: "Berlin", country: "DE" } },
  lines: [{ ...invoice.lines[0], vatCode: "EUTJ", rateBp: 0n, account: 3308n }], vat: [{ vatCode: "EUTJ", rateBp: 0n, category: "AE", base: 300_000n, vat: 0n }],
  totalNet: 300_000n, totalVat: 0n, total: 300_000n, legalNotes: ["Reverse charge"],
};
const creditNote: Snapshot = { ...invoice, kind: DocKind.creditNote, number: 1043n, ocr: undefined, creditOf: { number: 1042n, issueDate: "2026-11-25" }, templateVersion: "credit-note@1" };

test("domestic invoice is valid UBL 2.1 and meets the Swedish rules", async () => {
  const xml = toUbl(invoice);
  expect(await validate(xml, "UBL-Invoice-2.1.xsd")).toEqual([]);
  expect(xml).toContain(`<cbc:CustomizationID>${CUSTOMIZATION_ID}</cbc:CustomizationID>`);
  expect(xml).toContain(`<cbc:ProfileID>${PROFILE_ID}</cbc:ProfileID>`);
  expect(xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
  expect(xml).toContain('<cbc:EndpointID schemeID="0007">5560360793</cbc:EndpointID>'); // SE-R-003/004/013
  expect(/<cbc:CompanyID>(SE\d{12})<\/cbc:CompanyID>/.exec(xml)?.[1]).toHaveLength(14); // SE-R-001/002
  expect(xml).toContain("<cbc:CompanyID>Godkänd för F-skatt</cbc:CompanyID>"); // SE-R-005
  expect([...xml.matchAll(/<cbc:Percent>([\d.]+)<\/cbc:Percent>/g)].map((m) => m[1]).every((p) => ["25", "12", "6"].includes(p))).toBe(true); // SE-R-006
  expect(xml).toContain("<cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cbc:PaymentID>104265</cbc:PaymentID>"); // SE-R-011/012
  expect(xml).toContain("<cbc:ID>SE:BANKGIRO</cbc:ID>");
  expect(xml).toContain('<cbc:InvoicedQuantity unitCode="HUR">2.5</cbc:InvoicedQuantity>');
  expect(xml).toContain("Kund &amp; Co AB");
  // Discount as a line allowance: 200,00 − 10 % = 180,00.
  expect(xml).toContain('<cbc:Amount currencyID="SEK">20.00</cbc:Amount>');
});

test("EU service invoice in EUR: reverse charge (AE) and VAT also in SEK", async () => {
  const xml = toUbl(euInvoice);
  expect(await validate(xml, "UBL-Invoice-2.1.xsd")).toEqual([]);
  expect(xml).toContain("<cbc:ID>AE</cbc:ID><cbc:Percent>0</cbc:Percent><cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>");
  expect(xml).toContain("<cbc:TaxCurrencyCode>SEK</cbc:TaxCurrencyCode>");
  expect(xml).toContain('<cac:TaxTotal><cbc:TaxAmount currencyID="SEK">0.00</cbc:TaxAmount></cac:TaxTotal>');
  expect(xml).toContain('<cbc:EndpointID schemeID="9930">DE123456789</cbc:EndpointID>');
});

test("credit note is valid UBL 2.1 and references the invoice", async () => {
  const xml = toUbl(creditNote);
  expect(await validate(xml, "UBL-CreditNote-2.1.xsd")).toEqual([]);
  expect(xml).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
  expect(xml).toContain("<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>1042</cbc:ID>");
});

test("a buyer without a Peppol ID or Swedish org nr cannot be addressed", () => {
  expect(() => toUbl({ ...euInvoice, buyer: { ...euInvoice.buyer, peppolId: undefined } })).toThrow("endpoint");
});

test("the schema check is real: a document without IssueDate is rejected", async () => {
  const broken = toUbl(invoice).replace(/<cbc:IssueDate>[^<]*<\/cbc:IssueDate>/, "");
  expect((await validate(broken, "UBL-Invoice-2.1.xsd")).length).toBeGreaterThan(0);
});
