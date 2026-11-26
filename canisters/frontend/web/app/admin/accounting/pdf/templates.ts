// Document templates, versioned by name. A published version never changes: a new
// layout is a new version, so re-rendering an old document gives the same output.
import { formatOre } from "../money";
import { type Assets, type Col, Doc, MUTED } from "./layout";
import { reminderDoc, salesDoc } from "./sales";
import type { Job, PdfVoucher } from "./types";
import { BOX_SV, SECTION_SV, SECTIONS, boxValue } from "../vat";

const debit = (a: bigint) => (a > 0n ? formatOre(a) : "");
const credit = (a: bigint) => (a < 0n ? formatOre(-a) : "");
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

const lineCols = (d: Doc): Col[] => [
  { title: "Konto", width: 46 },
  { title: "Benämning", width: d.width - 46 - 40 - 150 - 80 },
  { title: "Moms", width: 40 },
  { title: "Text", width: 80 },
  { title: "Debet", width: 75, align: "right" },
  { title: "Kredit", width: 75, align: "right" },
];

function voucherBody(d: Doc, v: PdfVoucher) {
  d.facts([
    ["Verifikation", v.ref],
    ["Bokföringsdatum", v.eventDate],
    ["Registrerad", v.registeredAt],
    ["Text", v.description],
    ...(v.counterparty ? [["Motpart", v.counterparty] as [string, string]] : []),
    ["Källa", v.source],
    ["Upprättad av", v.createdBy],
    ...(v.corrects ? [["Rättar", v.corrects] as [string, string]] : []),
    ...(v.correctedBy.length ? [["Rättad genom", v.correctedBy.join(", ")] as [string, string]] : []),
    ["Arkiveras t.o.m.", v.retainUntil],
  ]);
  d.y -= 6;
  d.table(lineCols(d), v.lines.map((l) => [String(l.account), l.name, l.vatCode ?? "", l.text ?? "", debit(l.amount), credit(l.amount)]), {
    totals: ["", "Summa", "", "", formatOre(sum(v.lines.filter((l) => l.amount > 0n).map((l) => l.amount))), formatOre(-sum(v.lines.filter((l) => l.amount < 0n).map((l) => l.amount)))],
  });
  d.heading("Underlag", 10);
  if (!v.attachments.length) d.facts([["", "Inga bifogade underlag."]], 0);
  else d.table([{ title: "Fil", width: d.width - 140 }, { title: "SHA-256 (början)", width: 140 }], v.attachments.map((a) => [a.filename, a.sha]));
}

async function render(job: Job, assets: Assets): Promise<Uint8Array> {
  const d = await Doc.create(assets, { ...job.meta, template: job.template });
  switch (job.template) {
    case "voucher@1":
      voucherBody(d, job.voucher);
      break;
    case "journal@1": {
      const cols: Col[] = [
        { title: "Ver", width: 52 }, { title: "Datum", width: 58 }, { title: "Konto / text", width: d.width - 52 - 58 - 150 },
        { title: "Debet", width: 75, align: "right" }, { title: "Kredit", width: 75, align: "right" },
      ];
      const rows = job.vouchers.flatMap((v) => [
        [{ text: v.ref, bold: true }, v.eventDate, { text: v.description + (v.corrects ? ` (rättar ${v.corrects})` : ""), bold: true }, "", ""],
        ...v.lines.map((l) => ["", "", `${l.account} ${l.name}`, debit(l.amount), credit(l.amount)]),
      ]);
      const all = job.vouchers.flatMap((v) => v.lines.map((l) => l.amount));
      d.table(cols, rows, { totals: ["", "", `Summa ${job.vouchers.length} verifikationer`, formatOre(sum(all.filter((a) => a > 0n))), formatOre(-sum(all.filter((a) => a < 0n)))] });
      break;
    }
    case "ledger@1": {
      const cols: Col[] = [
        { title: "Datum", width: 58 }, { title: "Ver", width: 52 }, { title: "Text", width: d.width - 58 - 52 - 225 },
        { title: "Debet", width: 75, align: "right" }, { title: "Kredit", width: 75, align: "right" }, { title: "Saldo", width: 75, align: "right" },
      ];
      for (const a of job.accounts) {
        d.heading(`${a.number} ${a.name}`, 10);
        let bal = a.opening;
        const rows = [["", "", { text: "Ingående saldo", color: MUTED }, "", "", formatOre(bal)]];
        for (const r of a.rows) { bal += r.amount; rows.push([r.date, r.ref, r.text, debit(r.amount), credit(r.amount), formatOre(bal)]); }
        d.table(cols, rows, { totals: ["", "", "Utgående saldo", formatOre(sum(a.rows.filter((r) => r.amount > 0n).map((r) => r.amount))), formatOre(-sum(a.rows.filter((r) => r.amount < 0n).map((r) => r.amount))), formatOre(bal)] });
      }
      if (!job.accounts.length) d.facts([["", "Inga transaktioner i urvalet."]], 0);
      break;
    }
    case "trial-balance@1": {
      const cols: Col[] = [
        { title: "Konto", width: 46 }, { title: "Benämning", width: d.width - 46 - 255 },
        { title: "Ingående", width: 85, align: "right" }, { title: "Period", width: 85, align: "right" }, { title: "Utgående", width: 85, align: "right" },
      ];
      d.table(cols, job.rows.map((r) => [String(r.number), r.name, formatOre(r.opening), formatOre(r.change), formatOre(r.opening + r.change)]), {
        totals: ["", "Summa", formatOre(sum(job.rows.map((r) => r.opening))), formatOre(sum(job.rows.map((r) => r.change))), formatOre(sum(job.rows.map((r) => r.opening + r.change)))],
      });
      break;
    }
    case "invoice@1":
    case "credit-note@1":
    case "quote@1":
      salesDoc(d, job.snapshot);
      break;
    case "reminder@1":
      reminderDoc(d, job.reminder);
      break;
    case "vat-return@1": {
      d.facts(job.facts);
      const cols: Col[] = [{ title: "Fält", width: 30 }, { title: "", width: d.width - 30 - 90 }, { title: "Kronor", width: 90, align: "right" }];
      for (const [sec, boxes] of SECTIONS) {
        d.heading(`${sec}. ${SECTION_SV[sec]}`, 10);
        d.table(cols, boxes.map((b) => [String(b).padStart(2, "0"), BOX_SV[b], boxValue(job.boxes, b).toString()]));
      }
      break;
    }
    case "payslip@1": {
      d.facts(job.facts);
      d.y -= 6;
      const cols: Col[] = [{ title: "Löneart", width: d.width - 60 - 80 - 90 }, { title: "Antal", width: 60, align: "right" }, { title: "À-pris", width: 80, align: "right" }, { title: "Belopp", width: 90, align: "right" }];
      d.table(cols, job.lines.map((l) => [l.text, l.quantity, l.rate === null ? "" : formatOre(l.rate), formatOre(l.amount)]));
      d.heading("Summering", 10);
      d.table([{ title: "", width: d.width - 120 }, { title: "Kronor", width: 120, align: "right" }], job.totals.map(([k, v]) => [k, formatOre(v)]));
      d.heading("Redovisas till Skatteverket (arbetsgivardeklaration)", 10);
      d.facts(job.agi);
      break;
    }
    case "summary@1": {
      d.facts(job.facts);
      d.y -= 6;
      const w = Math.floor(d.width / job.table.cols.length);
      d.table(job.table.cols.map((title, i) => ({ title, width: w, align: i === 0 ? undefined : "right" as const })), job.table.rows);
      break;
    }
    case "ec-sales@1": {
      d.facts(job.facts);
      const cols: Col[] = [{ title: "Köparens VAT-nummer", width: 110 }, { title: "Köpare", width: d.width - 110 - 210 },
        { title: "Varor", width: 70, align: "right" }, { title: "Trepartshandel", width: 70, align: "right" }, { title: "Tjänster", width: 70, align: "right" }];
      d.table(cols, job.rows.map((r) => [r.vatNr, r.buyer, r.goods.toString(), r.triangulation.toString(), r.services.toString()]), {
        totals: ["", "Summa", job.rows.reduce((a, r) => a + r.goods, 0n).toString(), job.rows.reduce((a, r) => a + r.triangulation, 0n).toString(), job.rows.reduce((a, r) => a + r.services, 0n).toString()],
      });
      break;
    }
  }
  return d.save();
}

export { render };
