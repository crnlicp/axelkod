// PDF templates: shared header and footer content, reproducible bytes, and a
// fingerprint per published template version (a published version must never change).
import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { render } from "../../app/admin/accounting/pdf/templates";
import type { Job, Meta, PdfVoucher } from "../../app/admin/accounting/pdf/types";
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
};

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
  test(`${job.template} is byte-reproducible`, async () => {
    const a = await render(job, assets);
    const b = await render(job, assets);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const sha = createHash("sha256").update(a).digest("hex");
    expect(sha, `${job.template} changed: publish a new template version instead`).toBe(fingerprints[job.template]);
  });
}
