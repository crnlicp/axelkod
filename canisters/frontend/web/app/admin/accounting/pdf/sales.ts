// Sales document templates (sv/en), drawn only from the stored snapshot. Published
// versions never change; tests/unit/pdf.spec.ts pins their output.
import type { Reminder, Snapshot } from "../../../bindings/accounting";
import type { HusPrint } from "./types";
import { formatOre } from "../money";
import { type Col, Doc, MUTED } from "./layout";

const L = {
  sv: {
    invoice: "Faktura", creditNote: "Kreditfaktura", quote: "Offert", reminder: "Betalningspåminnelse",
    number: "Nummer", date: "Datum", issueDate: "Fakturadatum", delivery: "Leveransdatum", due: "Förfallodatum", validUntil: "Giltig till",
    ocr: "OCR", ourRef: "Vår referens", yourRef: "Er referens", terms: "Betalningsvillkor", days: (n: bigint) => `${n} dagar netto`,
    buyer: "Kund", buyerOrgNr: "Org.nr", buyerVatNr: "Momsreg.nr", creditOf: (n: bigint, d: string) => `Avser faktura ${n} daterad ${d}`,
    description: "Beskrivning", qty: "Antal", unit: "Enhet", price: "À-pris", discount: "Rabatt", vatRate: "Moms", amount: "Belopp",
    vatSummary: "Momsspecifikation", base: "Underlag", vat: "Moms", net: "Summa exkl. moms", total: "Att betala", totalCredit: "Att kreditera",
    totalQuote: "Summa", vatSek: (v: string, rate: string, d: string) => `Moms i SEK: ${v} (kurs ${rate}, ${d})`,
    payment: "Betalning", notes: "Meddelande", invoiceNo: "Fakturanummer", balance: "Obetalt belopp", interest: (r: string) => `Dröjsmålsränta (${r} % per år) hittills`,
    feeKinds: { reminderFee: "Påminnelseavgift", forseningsersattning: "Förseningsersättning (lag 1981:739 4 a §)" } as Record<string, string>,
    husTitle: { rot: "Skattereduktion för rotarbete", rut: "Skattereduktion för rutarbete" } as Record<string, string>,
    husDeduction: { rot: "Rotavdrag", rut: "Rutavdrag" } as Record<string, string>, sum: "Summa",
    husLabour: "Arbetskostnad inkl. moms", husMaterial: "Material inkl. moms", husOther: "Övriga kostnader inkl. moms", husBuyer: "Köpare", husHome: "Bostad",
    husNote: (pct: string) => `Avdraget är högst ${pct} av arbetskostnaden inkl. moms. Om Skatteverket inte beviljar avdraget ska köparen betala mellanskillnaden.`,
    toPay: "Att betala", reminderText: "Enligt vår bokföring är fakturan nedan obetald. Vänligen betala snarast. Har du redan betalat kan du bortse från denna påminnelse.",
  },
  en: {
    invoice: "Invoice", creditNote: "Credit note", quote: "Quote", reminder: "Payment reminder",
    number: "Number", date: "Date", issueDate: "Invoice date", delivery: "Delivery date", due: "Due date", validUntil: "Valid until",
    ocr: "Payment reference (OCR)", ourRef: "Our reference", yourRef: "Your reference", terms: "Payment terms", days: (n: bigint) => `${n} days net`,
    buyer: "Customer", buyerOrgNr: "Reg. no", buyerVatNr: "VAT no", creditOf: (n: bigint, d: string) => `Refers to invoice ${n} dated ${d}`,
    description: "Description", qty: "Qty", unit: "Unit", price: "Unit price", discount: "Discount", vatRate: "VAT", amount: "Amount",
    vatSummary: "VAT breakdown", base: "Taxable amount", vat: "VAT", net: "Total excl. VAT", total: "Amount due", totalCredit: "Amount credited",
    totalQuote: "Total", vatSek: (v: string, rate: string, d: string) => `VAT in SEK: ${v} (rate ${rate}, ${d})`,
    payment: "Payment", notes: "Message", invoiceNo: "Invoice number", balance: "Unpaid amount", interest: (r: string) => `Late payment interest (${r} % a year) to date`,
    feeKinds: { reminderFee: "Reminder fee", forseningsersattning: "Late payment compensation (Swedish Act 1981:739, s. 4 a)" } as Record<string, string>,
    husTitle: { rot: "Tax reduction for ROT work", rut: "Tax reduction for RUT work" } as Record<string, string>,
    husDeduction: { rot: "ROT deduction", rut: "RUT deduction" } as Record<string, string>, sum: "Total",
    husLabour: "Labour incl. VAT", husMaterial: "Material incl. VAT", husOther: "Other costs incl. VAT", husBuyer: "Buyer", husHome: "Home",
    husNote: (pct: string) => `The deduction is at most ${pct} of the labour cost incl. VAT. If Skatteverket does not grant it, the buyer pays the difference.`,
    toPay: "Amount due", reminderText: "According to our records the invoice below is unpaid. Please pay as soon as possible. If you have already paid, please disregard this reminder.",
  },
};

const qty = (q: bigint) => {
  const whole = q / 1000n;
  const frac = (q < 0n ? -q : q) % 1000n;
  return frac === 0n ? String(whole) : `${whole},${String(frac).padStart(3, "0").replace(/0+$/, "")}`;
};
const pct = (bp: bigint) => `${(Number(bp) / 100).toLocaleString("sv-SE")} %`;
const money = (v: bigint, cur: string) => `${formatOre(v)} ${cur}`;

function partyBlock(d: Doc, x: { buyer: Snapshot["buyer"] }, t: (typeof L)["sv"], startY: number) {
  const b = x.buyer;
  const lines = [b.name, b.address.street, `${b.address.postalCode} ${b.address.city}`, ...(b.address.country !== "SE" ? [b.address.country] : []),
    ...(b.orgNr ? [`${t.buyerOrgNr} ${b.orgNr}`] : []), ...(b.vatNr ? [`${t.buyerVatNr} ${b.vatNr}`] : [])];
  d.text(t.buyer, d.left, startY, { size: 8, color: MUTED });
  lines.forEach((l, i) => d.text(l, d.left, startY - 13 - 12 * i, { size: 9.5, bold: i === 0, width: 250 }));
  return startY - 13 - 12 * lines.length;
}

function factsBlock(d: Doc, rows: [string, string][], startY: number) {
  const x = d.left + d.width - 230;
  rows.forEach(([k, v], i) => {
    d.text(k, x, startY - 12 * i, { size: 8.5, color: MUTED });
    d.text(v, x + 105, startY - 12 * i, { size: 8.5, width: 125 });
  });
  return startY - 12 * rows.length;
}

export function salesDoc(d: Doc, x: Snapshot, hus?: HusPrint) {
  const t = L[x.language];
  const cur = x.currency;
  const top = d.y;
  const facts: [string, string][] = [
    [t.number, String(x.number)],
    [x.kind === "invoice" ? t.issueDate : t.date, x.issueDate],
    ...(x.deliveryDate ? [[t.delivery, x.deliveryDate] as [string, string]] : []),
    ...(x.dueDate && x.kind === "invoice" ? [[t.due, x.dueDate] as [string, string]] : []),
    ...(x.validUntil ? [[t.validUntil, x.validUntil] as [string, string]] : []),
    ...(x.ocr ? [[t.ocr, x.ocr] as [string, string]] : []),
    ...(x.kind === "invoice" ? [[t.terms, t.days(x.termsDays)] as [string, string]] : []),
    ...(x.yourRef ? [[t.yourRef, x.yourRef] as [string, string]] : []),
    ...(x.ourRef ? [[t.ourRef, x.ourRef] as [string, string]] : []),
  ];
  const y1 = partyBlock(d, x, t, top);
  const y2 = factsBlock(d, facts, top);
  d.y = Math.min(y1, y2) - 14;
  if (x.creditOf) { d.text(t.creditOf(x.creditOf.number, x.creditOf.issueDate), d.left, d.y, { bold: true }); d.y -= 16; }

  const cols: Col[] = [
    { title: t.description, width: d.width - 40 - 36 - 72 - 42 - 40 - 80 }, { title: t.qty, width: 40, align: "right" }, { title: t.unit, width: 36 },
    { title: t.price, width: 72, align: "right" }, { title: t.discount, width: 42, align: "right" }, { title: t.vatRate, width: 40, align: "right" },
    { title: t.amount, width: 80, align: "right" },
  ];
  d.table(cols, x.lines.map((l) => [l.description, qty(l.quantity), l.unit, formatOre(l.unitPrice), l.discountBp ? pct(l.discountBp) : "", pct(l.rateBp), formatOre(l.net)]));

  d.heading(t.vatSummary, 9.5);
  d.table([{ title: t.vatRate, width: 70, align: "right" }, { title: t.base, width: 110, align: "right" }, { title: t.vat, width: 110, align: "right" }],
    x.vat.map((r) => [pct(r.rateBp), formatOre(r.base), formatOre(r.vat)]));

  const totalLabel = x.kind === "creditNote" ? t.totalCredit : x.kind === "quote" ? t.totalQuote : t.total;
  d.ensure(60);
  const rx = d.left + d.width - 230;
  [[t.net, money(x.totalNet, cur)], [t.vat, money(x.totalVat, cur)]].forEach(([k, v]) => {
    d.text(k, rx, d.y, { color: MUTED }); d.text(v, rx + 100, d.y, { align: "right", width: 130 }); d.y -= 13;
  });
  // ROT/RUT: the total, the deduction, and what the customer pays.
  if (x.hus) {
    [[t.sum, money(x.total, cur)], [t.husDeduction[x.hus.kind], `−${money(x.hus.deduction, cur)}`]].forEach(([k, v]) => {
      d.text(k, rx, d.y, { color: MUTED }); d.text(v, rx + 100, d.y, { align: "right", width: 130 }); d.y -= 13;
    });
  }
  d.rule(d.y + 9);
  d.text(totalLabel, rx, d.y - 4, { size: 11, bold: true });
  d.text(money(x.total - (x.hus?.deduction ?? 0n), cur), rx + 80, d.y - 4, { size: 11, bold: true, align: "right", width: 150 });
  d.y -= 24;
  if (x.hus) {
    const h = x.hus;
    d.heading(t.husTitle[h.kind], 9.5);
    const work = h.work.map((w) => w.workType.replace(/_/g, " ").toLowerCase()).join(", ");
    d.facts([[t.husLabour, `${money(h.labour, cur)} (${work})`], [t.husMaterial, money(h.material, cur)], [t.husOther, money(h.other, cur)]], 0);
    for (const b of hus?.buyers ?? []) d.facts([[t.husBuyer, `${b.name}, ${b.personnummer} – ${t.husDeduction[h.kind]} ${money(b.amount, cur)}`]], 0);
    if (hus?.property) d.facts([[t.husHome, hus.property]], 0);
    for (const l of d.wrap(t.husNote(pct(h.rateBp)), d.width)) { d.ensure(12); d.text(l, d.left, d.y, { size: 8.5, color: MUTED }); d.y -= 12; }
  }
  if (x.totalVatSek !== undefined && x.fxRate) {
    d.text(t.vatSek(`${formatOre(x.totalVatSek)} SEK`, (Number(x.fxRate.rate) / 1_000_000).toLocaleString("sv-SE", { maximumFractionDigits: 6 }), x.fxRate.date), d.left, d.y, { size: 8.5 });
    d.y -= 14;
  }
  for (const n of x.legalNotes) { d.text(n, d.left, d.y, { bold: true }); d.y -= 13; }
  if (x.lateInterestText) { d.text(x.lateInterestText, d.left, d.y, { size: 8.5, color: MUTED }); d.y -= 13; }
  if (x.kind === "invoice") {
    const s = x.seller;
    const pay = [s.bankgiro && `Bankgiro ${s.bankgiro}`, s.plusgiro && `Plusgiro ${s.plusgiro}`, s.iban && `IBAN ${s.iban}`, s.bic && `BIC ${s.bic}`, x.ocr && `${t.ocr} ${x.ocr}`].filter(Boolean).join(" · ");
    if (pay) { d.heading(t.payment, 9.5); d.facts([["", pay]], 0); }
  }
  if (x.notes) { d.heading(t.notes, 9.5); for (const l of d.wrap(x.notes, d.width)) { d.ensure(12); d.text(l, d.left, d.y); d.y -= 12; } }
}

export function reminderDoc(d: Doc, r: Reminder) {
  const t = L[r.language];
  const top = d.y;
  const y1 = partyBlock(d, r, t, top);
  const y2 = factsBlock(d, [[t.number, String(r.number)], [t.date, r.date]], top);
  d.y = Math.min(y1, y2) - 14;
  for (const l of d.wrap(t.reminderText, d.width)) { d.text(l, d.left, d.y); d.y -= 12; }
  d.y -= 6;
  const rate = (Number(r.interestRateBp) / 100).toLocaleString("sv-SE");
  const rows: [string, string][] = [
    [`${t.invoiceNo} ${r.invoiceNumber}, ${t.due.toLowerCase()} ${r.dueDate}`, ""],
    [t.balance, `${formatOre(r.balance)} SEK`],
    ...(r.interest > 0n ? [[t.interest(rate), `${formatOre(r.interest)} SEK`] as [string, string]] : []),
    ...(r.fee > 0n ? [[t.feeKinds[r.feeKind] ?? r.feeKind, `${formatOre(r.fee)} SEK`] as [string, string]] : []),
  ];
  d.table([{ title: "", width: d.width - 130 }, { title: t.amount, width: 130, align: "right" }], rows.map(([a, b]) => [a, b]), {
    totals: [t.toPay, `${formatOre(r.balance + r.interest + r.fee)} SEK`],
  });
  const s = r.seller;
  const pay = [s.bankgiro && `Bankgiro ${s.bankgiro}`, s.plusgiro && `Plusgiro ${s.plusgiro}`, s.iban && `IBAN ${s.iban}`, s.bic && `BIC ${s.bic}`].filter(Boolean).join(" · ");
  if (pay) { d.heading(t.payment, 9.5); d.facts([["", pay]], 0); }
}

export const salesTitle = (kind: Snapshot["kind"] | "reminder", lang: "sv" | "en") =>
  kind === "reminder" ? L[lang].reminder : kind === "creditNote" ? L[lang].creditNote : kind === "quote" ? L[lang].quote : L[lang].invoice;
