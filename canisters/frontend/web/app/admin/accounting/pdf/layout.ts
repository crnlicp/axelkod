// A small layout helper over pdf-lib (C12): A4 pages with the shared header and
// footer, wrapped text, tables with repeated headings and page breaks.
// Output is byte-reproducible: fixed font names, fixed metadata dates.
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { CompanyProfile } from "../../../bindings/accounting";

// pdf-lib only reads `layout(text).glyphs`. fontkit's full OpenType shaping of Inter costs
// ~100 ms per call; a plain cmap lookup is enough for these documents (no ligatures,
// which also keeps copied text exact).
const fastFontkit = {
  create(data: Uint8Array) {
    const font = fontkit.create(data) as unknown as { glyphsForString: (s: string) => unknown[]; layout: unknown };
    font.layout = (text: string) => ({ glyphs: font.glyphsForString(text) });
    return font;
  },
} as unknown as typeof fontkit;

export type Assets = { regular: ArrayBuffer; bold: ArrayBuffer; logo: ArrayBuffer };

export type DocMeta = {
  /** Printed as the document heading, e.g. "Verifikation" or "Grundbok". */
  title: string;
  /** Short reference for the footer, e.g. "A-12" or "2026-01-01 – 2026-12-31". */
  ref: string;
  /** Lines under the heading (period, selection). */
  subtitle?: string[];
  company: CompanyProfile;
  /** "2026-11-25 14:02"; printed in the footer. */
  generatedAt: string;
  /** Document date: stored as the PDF's creation and modification date. */
  date: Date;
  /** Short content hash shown in the footer, when the document has one. */
  hash?: string;
  template: string;
  /** Language of the fixed header and footer words (default Swedish). */
  lang?: "sv" | "en";
};

const WORDS = {
  sv: { orgNr: "Org.nr", vatNr: "Momsreg.nr", office: "Säte", fSkatt: "Godkänd för F-skatt", generated: "Genererad", page: "Sida", orgNrShort: "org.nr" },
  en: { orgNr: "Reg. no", vatNr: "VAT reg. no", office: "Registered office", fSkatt: "Approved for F-tax (Godkänd för F-skatt)", generated: "Generated", page: "Page", orgNrShort: "reg. no" },
};

export const INK = rgb(0.06, 0.12, 0.2);
export const MUTED = rgb(0.38, 0.43, 0.49);
export const RULE = rgb(0.8, 0.83, 0.86);
const PAGE: [number, number] = [595.28, 841.89];
const M = 42;
const FOOTER = 40;

export type Col = { title: string; width: number; align?: "left" | "right" };
export type Cell = string | { text: string; bold?: boolean; color?: ReturnType<typeof rgb> };

export class Doc {
  private pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  readonly width = PAGE[0] - 2 * M;
  readonly left = M;

  private constructor(readonly pdf: PDFDocument, readonly regular: PDFFont, readonly bold: PDFFont, private logo: PDFImage, readonly meta: DocMeta) {}

  static async create(assets: Assets, meta: DocMeta): Promise<Doc> {
    const pdf = await PDFDocument.create({ updateMetadata: false });
    pdf.registerFontkit(fastFontkit);
    const [regular, bold, logo] = await Promise.all([
      pdf.embedFont(assets.regular, { subset: true, customName: "AXELKD+Inter-Regular" }),
      pdf.embedFont(assets.bold, { subset: true, customName: "AXELKD+Inter-Bold" }),
      pdf.embedPng(assets.logo),
    ]);
    pdf.setTitle(`${meta.title} ${meta.ref}`.trim());
    pdf.setAuthor(meta.company.legalName);
    pdf.setCreator(meta.template);
    pdf.setProducer("Axelkod Ekonomi");
    pdf.setCreationDate(meta.date);
    pdf.setModificationDate(meta.date);
    const doc = new Doc(pdf, regular, bold, logo, meta);
    doc.newPage();
    return doc;
  }

  private widths = new Map<PDFFont, Map<string, number>>();

  /** Width as pdf-lib draws it (glyph advances, no kerning), from cached per-character widths. */
  measure(s: string, size: number, f: PDFFont = this.regular): number {
    let m = this.widths.get(f);
    if (!m) this.widths.set(f, (m = new Map()));
    let w = 0;
    for (const ch of s) {
      let cw = m.get(ch);
      if (cw === undefined) m.set(ch, (cw = f.widthOfTextAtSize(ch, 1000)));
      w += cw;
    }
    return (w * size) / 1000;
  }

  font(bold?: boolean) {
    return bold ? this.bold : this.regular;
  }

  text(s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right"; width?: number } = {}) {
    const size = o.size ?? 9;
    const f = this.font(o.bold);
    const fitted = o.width ? this.fit(s, o.width, size, f) : s;
    const dx = o.align === "right" && o.width ? o.width - this.measure(fitted, size, f) : 0;
    this.page.drawText(fitted, { x: x + dx, y, size, font: f, color: o.color ?? INK });
  }

  /** Cuts a single line to the width with an ellipsis. */
  fit(s: string, width: number, size: number, f: PDFFont = this.regular): string {
    if (this.measure(s, size, f) <= width) return s;
    const chars = [...s];
    let lo = 0, hi = chars.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.measure(`${chars.slice(0, mid).join("")}…`, size, f) <= width) lo = mid; else hi = mid - 1; }
    return `${chars.slice(0, lo).join("").trimEnd()}…`;
  }

  wrap(s: string, width: number, size = 9, f: PDFFont = this.regular): string[] {
    const out: string[] = [];
    for (const para of s.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (this.measure(next, size, f) <= width || !line) line = next;
        else { out.push(line); line = word; }
      }
      out.push(line);
    }
    return out.map((l) => this.fit(l, width, size, f));
  }

  /** Starts a new page when less than `h` points are left. Returns true if it did. */
  ensure(h: number): boolean {
    if (this.y - h >= M + FOOTER) return false;
    this.newPage();
    return true;
  }

  rule(y = this.y, color = RULE) {
    this.page.drawLine({ start: { x: M, y }, end: { x: PAGE[0] - M, y }, thickness: 0.6, color });
  }

  /** Label/value pairs in two columns. */
  facts(rows: [string, string][], labelWidth = 110) {
    for (const [k, v] of rows) {
      const lines = this.wrap(v, this.width - labelWidth, 9);
      this.ensure(12 * lines.length + 2);
      this.text(k, M, this.y, { color: MUTED });
      lines.forEach((l, i) => this.text(l, M + labelWidth, this.y - 12 * i));
      this.y -= 12 * lines.length + 2;
    }
  }

  heading(s: string, size = 11) {
    this.ensure(size + 30);
    this.y -= 6;
    this.text(s, M, this.y, { size, bold: true });
    this.y -= size + 6;
  }

  table(cols: Col[], rows: Cell[][], o: { totals?: Cell[] } = {}) {
    const size = 8.5;
    const rowH = 13;
    const head = () => {
      let x = M;
      for (const c of cols) { this.text(c.title, x, this.y, { size: 8, bold: true, color: MUTED, align: c.align, width: c.width - 4 }); x += c.width; }
      this.y -= 5;
      this.rule();
      this.y -= rowH - 2;
    };
    const draw = (r: Cell[], bold = false) => {
      let x = M;
      r.forEach((cell, i) => {
        const c = typeof cell === "string" ? { text: cell } : cell;
        this.text(c.text, x, this.y, { size, bold: bold || c.bold, color: c.color, align: cols[i].align, width: cols[i].width - 4 });
        x += cols[i].width;
      });
      this.y -= rowH;
    };
    this.ensure(3 * rowH);
    head();
    for (const r of rows) {
      if (this.ensure(rowH)) head();
      draw(r);
    }
    if (o.totals) {
      this.ensure(rowH + 6);
      this.rule(this.y + rowH - 3, INK);
      draw(o.totals, true);
    }
    this.y -= 4;
  }

  private newPage() {
    this.page = this.pdf.addPage(PAGE);
    this.pages.push(this.page);
    this.y = PAGE[1] - M;
    this.header();
  }

  /** Shared header (spec §11): logo, legal identity and contact on every page. */
  private header() {
    const c = this.meta.company;
    const top = PAGE[1] - M;
    const h = 46;
    this.page.drawImage(this.logo, { x: M, y: top - h + 4, width: (h * 210) / 245, height: h });
    const x = M + 50;
    this.text(c.legalName, x, top - 8, { size: 12, bold: true });
    const addr = `${c.street}, ${c.postalCode} ${c.city}${c.country !== "SE" ? `, ${c.country}` : ""}`;
    const w = WORDS[this.meta.lang ?? "sv"];
    const ids = [`${w.orgNr} ${c.orgNr}`, `${w.vatNr} ${c.vatNr}`, `${w.office} ${c.registeredOffice}`].join(" · ");
    const contact = [c.phone, c.email, c.web].filter(Boolean).join(" · ");
    const pay = [c.bankgiro && `Bankgiro ${c.bankgiro}`, c.plusgiro && `Plusgiro ${c.plusgiro}`, c.iban && `IBAN ${c.iban}`, c.bic && `BIC ${c.bic}`, c.fSkatt ? w.fSkatt : ""]
      .filter(Boolean).join(" · ");
    [addr, ids, contact, pay].filter(Boolean).forEach((l, i) => this.text(l, x, top - 21 - 10 * i, { size: 7.5, color: MUTED, width: 300 }));
    const rx = PAGE[0] - M - 180;
    this.text(this.meta.title, rx, top - 8, { size: 13, bold: true, align: "right", width: 180 });
    (this.meta.subtitle ?? []).forEach((l, i) => this.text(l, rx, top - 22 - 10 * i, { size: 8, color: MUTED, align: "right", width: 180 }));
    this.y = top - h - 10;
    this.rule(this.y, INK);
    this.y -= 18;
  }

  /** Footer on every page: document, page x/y, generated at, hash, issuer. */
  async save(): Promise<Uint8Array> {
    const n = this.pages.length;
    const c = this.meta.company;
    const w = WORDS[this.meta.lang ?? "sv"];
    this.pages.forEach((p, i) => {
      this.page = p;
      this.rule(M + 14);
      const left = [`${this.meta.title} ${this.meta.ref}`.trim(), `${w.generated} ${this.meta.generatedAt}`, this.meta.hash ? `Hash ${this.meta.hash}` : ""].filter(Boolean).join(" · ");
      this.text(left, M, M + 2, { size: 7, color: MUTED, width: 330 });
      this.text(`${c.legalName}, ${w.orgNrShort} ${c.orgNr} · ${w.page} ${i + 1}/${n}`, PAGE[0] - M - 200, M + 2, { size: 7, color: MUTED, align: "right", width: 200 });
    });
    return this.pdf.save({ useObjectStreams: false });
  }
}
