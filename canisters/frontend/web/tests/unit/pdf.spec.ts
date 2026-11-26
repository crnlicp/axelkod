// PDF templates: shared header and footer content, reproducible bytes, and a
// fingerprint per published template version (a published version must never change).
import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { render } from "../../app/admin/accounting/pdf/templates";
import type { Job, Meta, PdfVoucher } from "../../app/admin/accounting/pdf/types";
import { DocKind, Lang, Variant_person_company, type Reminder, type Snapshot } from "../../app/bindings/accounting";
import { Principal } from "@icp-sdk/core/principal";
import { pdfText } from "../support/pdf-text";

const file = (p: string) => { const b = readFileSync(new URL(`../../app/admin/accounting/pdf/${p}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const assets = { regular: file("fonts/Inter-Regular.ttf"), bold: file("fonts/Inter-Bold.ttf"), logo: file("logo@1.png") };

// Font subsetting is CPU-heavy; a loaded machine needs headroom.
test.describe.configure({ timeout: 180_000 });

const meta: Meta = {
  title: "Verifikation", ref: "A-12", subtitle: ["Räkenskapsår 2026"], generatedAt: "2026-11-25 14:02", date: new Date(Date.UTC(2026, 10, 25)), hash: "1a2b3c4d",
  company: {
    legalName: "Axelkod AB", orgNr: "559999-9999", vatNr: "SE559999999901", registeredOffice: "Göteborg", street: "Exempelgatan 1",
    postalCode: "411 01", city: "Göteborg", country: "SE", email: "info@example.se", fSkatt: true, bankgiro: "123-4567",
  },
};
const voucher: PdfVoucher = {
  ref: "A-12", eventDate: "2026-03-10", registeredAt: "2026-03-10 09:15", description: "Försäljning, Kund AB – långt namn som får radbrytas",
  counterparty: "Kund AB", lines: [
    { account: 1930, name: "Företagskonto", amount: 1_250_000n },
    { account: 3001, name: "Försäljning inom Sverige, 25 % moms", amount: -1_000_000n },
    { account: 2611, name: "Utgående moms på försäljning inom Sverige, 25 %", amount: -250_000n, vatCode: "U25" },
  ],
  attachments: [{ filename: "kvitto.pdf", sha: "9f86d081" }], correctedBy: [], createdBy: "abcde-…", retainUntil: "2033-12-31", source: "Manuell",
};

const jobs: Job[] = [
  { template: "voucher@1", meta, voucher },
  { template: "journal@1", meta: { ...meta, title: "Grundbok", ref: "2026" }, vouchers: Array.from({ length: 40 }, (_, i) => ({ ...voucher, ref: `A-${i + 1}` })) },
  { template: "ledger@1", meta: { ...meta, title: "Huvudbok", ref: "2026" }, accounts: [{ number: 1930, name: "Företagskonto", opening: 500_00n, rows: [{ date: "2026-03-10", ref: "A-12", text: "Försäljning", amount: 1_250_000n }] }] },
  { template: "trial-balance@1", meta: { ...meta, title: "Saldobalans", ref: "2026" }, rows: [{ number: 1930, name: "Företagskonto", opening: 0n, change: 1_250_000n }, { number: 3001, name: "Försäljning", opening: 0n, change: -1_250_000n }] },
];

// Fingerprints of the published versions. Changing one means the template changed:
// publish a new version instead (C7, C11).
const fingerprints: Record<string, string> = {
  "voucher@1": "93ccdc02f89ceebb99369efa35ce8bd5b862d5d756ce4e673565b37312c14976",
  "journal@1": "2d03c0174fb6a0bb619ec0a614cdc883befbf032501753d3b0698d7c2e5b819d",
  "ledger@1": "53ce2cacbfaa807fef399763d534083882ed98e84a29e190e1062bfe42163ef5",
  "trial-balance@1": "49237b884ebd892c337b28da0aeffa16969e41d5a82b23ed1afbf0f86ebfb798",
  "invoice@1": "73d365174a7feaa57bee367554065e2e9ccc2ffd5f7ff91f51ee346c3676a843",
  "credit-note@1": "8c8bdbf86f0b31d718dcccc70d5d0b075839c1504f1cdd8dccf341cb8a253294",
  "invoice@1 en": "c4da84cb20749d8b4ed1931e374da2288918cd15348d4cec0559f40cae237f75",
  "reminder@1": "5acfe7bebc5591a3dad9e8cb04c6c855322a88cab28b7b837a689c4efb3794e0",
  "vat-return@1": "3c24cb3fa4ff1b65de8058483998c784e3892e177576e601f8fbf9f2eccbdc9f",
  "ec-sales@1": "0022690972733a5182e93f001b9e3a14a6f8f873d5ecac3ce4059c9a61a544b1",
  "payslip@1": "dd236ff8896d690c7d25ba47670b4a6cf949cc662c1edc33120d7b48f63ca255",
  "summary@1": "58ab012eebf6a303323501991f31f86e9480495c1f8305807ce9ef1c941c44c5",
};

const invoice: Snapshot = {
  kind: DocKind.invoice, number: 1042n, seller: meta.company, language: Lang.sv, issueDate: "2026-11-25", deliveryDate: "2026-11-20", dueDate: "2026-12-25",
  buyer: { kind: Variant_person_company.company, name: "Kund AB", orgNr: "556036-0793", address: { street: "Vägen 2", postalCode: "111 22", city: "Stockholm", country: "SE" } },
  currency: "SEK", lines: [
    { description: "Konsulttimmar november", quantity: 2_500n, unit: "h", unitPrice: 120_000n, discountBp: 0n, vatCode: "U25", rateBp: 2_500n, account: 3001n, net: 300_000n },
    { description: "Bok", quantity: 1_000n, unit: "st", unitPrice: 20_000n, discountBp: 1_000n, vatCode: "U6", rateBp: 600n, account: 3003n, net: 18_000n },
  ],
  vat: [{ vatCode: "U25", rateBp: 2_500n, category: "S", base: 300_000n, vat: 75_000n }, { vatCode: "U6", rateBp: 600n, category: "S", base: 18_000n, vat: 1_080n }],
  totalNet: 318_000n, totalVat: 76_080n, total: 394_080n, legalNotes: [], ocr: "104265", termsDays: 30n,
  lateInterestText: "Dröjsmålsränta enligt räntelagen", templateVersion: "invoice@1",
};
const euInvoice: Snapshot = {
  ...invoice, language: Lang.en, currency: "EUR", fxRate: { rate: 11_234_500n, date: "2026-11-24" }, totalVatSek: 0n,
  buyer: { kind: Variant_person_company.company, name: "Kunde GmbH", vatNr: "DE123456789", address: { street: "Str. 1", postalCode: "10115", city: "Berlin", country: "DE" } },
  lines: [{ ...invoice.lines[0], vatCode: "EUTJ", rateBp: 0n, account: 3308n }], vat: [{ vatCode: "EUTJ", rateBp: 0n, category: "AE", base: 300_000n, vat: 0n }],
  totalNet: 300_000n, totalVat: 0n, total: 300_000n, legalNotes: ["Reverse charge"],
};
const reminder: Reminder = {
  id: 1n, number: 7n, salesDocId: 1n, date: "2027-01-10", invoiceNumber: 1042n, dueDate: "2026-12-25", balance: 394_080n, interest: 1_727n,
  interestRateBp: 1_000n, fee: 45_000n, feeKind: "forseningsersattning", language: Lang.sv, seller: meta.company, buyer: invoice.buyer,
  contentHash: new Uint8Array(32), at: 0n, by: Principal.anonymous(),
};
jobs.push(
  { template: "invoice@1", meta: { ...meta, title: "Faktura", ref: "1042" }, snapshot: invoice },
  { template: "credit-note@1", meta: { ...meta, title: "Kreditfaktura", ref: "1043" }, snapshot: { ...invoice, kind: DocKind.creditNote, number: 1043n, ocr: undefined, creditOf: { number: 1042n, issueDate: "2026-11-25" }, templateVersion: "credit-note@1" } },
  { template: "invoice@1", meta: { ...meta, title: "Invoice", ref: "1044", lang: "en" }, snapshot: euInvoice },
  { template: "reminder@1", meta: { ...meta, title: "Betalningspåminnelse", ref: "7" }, reminder },
  { template: "vat-return@1", meta: { ...meta, title: "Momsdeklaration", ref: "2026-10" }, facts: [["Period", "2026-10-01 – 2026-10-31"]],
    boxes: [{ box: 5n, amount: 10_000n }, { box: 10n, amount: 2_500n }, { box: 48n, amount: 200n }, { box: 49n, amount: 2_300n }] },
  { template: "ec-sales@1", meta: { ...meta, title: "Periodisk sammanställning", ref: "2610" }, facts: [["Period", "2610"]],
    rows: [{ vatNr: "DE262875793", buyer: "Kunde GmbH", goods: 16_400n, triangulation: 0n, services: 15_300n }] },
  { template: "payslip@1", meta: { ...meta, title: "Lönespecifikation", ref: "202605" },
    facts: [["Anställd", "Anna Andersson"], ["Personnummer", "198202252386"], ["Period", "202605"], ["Skatteavdrag", "Tabell 33, kolumn 1"]],
    lines: [{ text: "Månadslön", quantity: "1", rate: 2_800_000n, amount: 2_800_000n }, { text: "Skattefri bilersättning", quantity: "10", rate: 2_500n, amount: 25_000n }],
    totals: [["Kontant lön", 2_800_000n], ["Avdragen skatt", -560_000n], ["Att utbetala", 2_265_000n]], agi: [["Ruta 011", "28000 kr"], ["Ruta 050", "Ja"]] },
  { template: "summary@1", meta: { ...meta, title: "Växa-stöd – underlag", ref: "202601" }, facts: [["Period", "202601"]],
    table: { cols: ["Underlag", "Inom taket", "Återbetalning"], rows: [["42 500 kr", "35 000 kr", "7 423 kr"]] } },
);

test("payslip@1 shows the lines, the net and the AGI fields", async () => {
  const text = pdfText(await render(jobs[10], assets)).join("\n");
  for (const s of ["Lönespecifikation", "Anna Andersson", "Månadslön", "28\u00a0000,00", "Att utbetala", "22\u00a0650,00", "Redovisas till Skatteverket (arbetsgivardeklaration)", "Ruta 011"])
    expect(text).toContain(s);
});


test("vat-return@1: sections and box headings as on Skatteverket's form; ec-sales@1 rows", async () => {
  const text = pdfText(await render(jobs[8], assets)).join("\n");
  for (const s of ["Momsdeklaration", "A. Momspliktig försäljning eller uttag exklusive moms", "Momspliktig försäljning som inte ingår i fält 06, 07 eller 08",
    "10000", "G. Moms att betala eller få tillbaka", "2300"])
    expect(text).toContain(s);
  const esl = pdfText(await render(jobs[9], assets)).join("\n");
  for (const s of ["Periodisk sammanställning", "DE262875793", "Kunde GmbH", "16400", "15300"]) expect(esl).toContain(s);
});

test("invoice@1: ML 17:24 content, ABL 28:5 header, VAT per rate, OCR, payment details", async () => {
  const text = pdfText(await render(jobs[4], assets)).join("\n");
  for (const s of ["Faktura", "1042", "Kund AB", "Org.nr 556036-0793", "Leveransdatum", "2026-11-20", "Förfallodatum", "2026-12-25",
    "Konsulttimmar november", "2,5", "1\u00a0200,00", "10 %", "Momsspecifikation", "25 %", "750,00", "6 %", "10,80", "Att betala", "3\u00a0940,80 SEK",
    "Org.nr 559999-9999 · Momsreg.nr SE559999999901 · Säte Göteborg", "Godkänd för F-skatt", "Bankgiro 123-4567 · OCR 104265", "Dröjsmålsränta enligt räntelagen"])
    expect(text).toContain(s);
});

test("credit note refers to the invoice; English EU invoice: reverse charge, buyer VAT nr, VAT in SEK", async () => {
  expect(pdfText(await render(jobs[5], assets)).join("\n")).toContain("Avser faktura 1042 daterad 2026-11-25");
  const en = pdfText(await render(jobs[6], assets)).join("\n");
  for (const s of ["Invoice", "Reverse charge", "VAT no DE123456789", "Amount due", "3\u00a0000,00 EUR", "VAT in SEK: 0,00 SEK (rate 11,2345, 2026-11-24)",
    "Reg. no 559999-9999 · VAT reg. no SE559999999901 · Registered office Göteborg", "Page 1/1"])
    expect(en).toContain(s);
});

test("reminder@1: balance, interest, förseningsersättning", async () => {
  const text = pdfText(await render(jobs[7], assets)).join("\n");
  for (const s of ["Betalningspåminnelse", "Fakturanummer 1042, förfallodatum 2026-12-25", "Obetalt belopp", "Dröjsmålsränta (10 % per år) hittills",
    "Förseningsersättning (lag 1981:739 4 a §)", "450,00 SEK", "4\u00a0408,07 SEK"])
    expect(text).toContain(s);
});

test("voucher@1 shows the shared header, the lines and the footer", async () => {
  const text = pdfText(await render(jobs[0], assets)).join("\n");
  for (const s of ["Axelkod AB", "Org.nr 559999-9999 · Momsreg.nr SE559999999901 · Säte Göteborg", "Godkänd för F-skatt", "Bankgiro 123-4567",
    "Verifikation", "12 500,00".replace(/ /g, " "), "Utgående moms på försäljning", "kvitto.pdf",
    "Verifikation A-12 · Genererad 2026-11-25 14:02 · Hash 1a2b3c4d", "Axelkod AB, org.nr 559999-9999 · Sida 1/1"])
    expect(text).toContain(s);
});

test("long reports break pages and number them", async () => {
  const text = pdfText(await render(jobs[1], assets));
  const pages = text.filter((t) => /· Sida \d+\/\d+$/.test(t));
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.at(-1)).toMatch(new RegExp(`Sida ${pages.length}/${pages.length}$`));
  expect(text.filter((t) => t === "Axelkod AB").length).toBe(pages.length); // header on every page
});

for (const job of jobs) {
  const key = `${job.template}${job.meta.lang === "en" ? " en" : ""}`;
  test(`${key} is byte-reproducible`, async () => {
    const a = await render(job, assets);
    const b = await render(job, assets);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const sha = createHash("sha256").update(a).digest("hex");
    if (process.env.PDF_DUMP) (await import("node:fs")).writeFileSync(`${process.env.PDF_DUMP}/${key.replace(" ", "-")}.pdf`, a);
    if (!fingerprints[key]) console.log(`fingerprint ${key}: ${sha}`);
    expect(sha, `${key} changed: publish a new template version instead`).toBe(fingerprints[key]);
  });
}
