// Minimal text extraction for the PDFs we generate (pdf-lib, Type0 fonts with
// ToUnicode maps, `<hex> Tj` operators). Enough to assert what a page shows.
import { inflateSync } from "node:zlib";

function streams(pdf: Buffer): Map<number, Buffer> {
  const out = new Map<number, Buffer>();
  const s = pdf.toString("latin1");
  const head = /(\d+) 0 obj/g;
  for (let m; (m = head.exec(s)); ) {
    const objEnd = s.indexOf("endobj", m.index);
    const kw = s.indexOf("stream", m.index);
    if (kw < 0 || kw > objEnd) continue;
    const dict = s.slice(m.index, kw);
    const start = kw + (s[kw + 6] === "\r" ? 8 : 7);
    let body = pdf.subarray(start, s.lastIndexOf("endstream", objEnd));
    if (/FlateDecode/.test(dict)) { try { body = inflateSync(body); } catch { continue; } }
    out.set(Number(m[1]), body);
    head.lastIndex = objEnd;
  }
  return out;
}

function cmap(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const u = (h: string) => String.fromCodePoint(...(h.match(/.{4}/g) ?? []).map((x) => parseInt(x, 16)));
  for (const [, block] of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, g, v] of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(g, 16), u(v));
  for (const [, block] of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const [, a, b, v] of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g))
      for (let g = parseInt(a, 16), c = parseInt(v, 16); g <= parseInt(b, 16); g++, c++) map.set(g, String.fromCodePoint(c));
  return map;
}

/** All text drawn in the PDF, one string per Tj, in drawing order. */
export function pdfText(bytes: Uint8Array): string[] {
  const pdf = Buffer.from(bytes);
  const all = streams(pdf);
  const src = pdf.toString("latin1");
  // Font resource name -> ToUnicode map, via the font objects.
  const fonts = new Map<string, Map<number, string>>();
  for (const [, name, obj] of src.matchAll(/\/([A-Za-z][\w-]*)\s+(\d+) 0 R/g)) {
    const at = src.indexOf(`\n${obj} 0 obj`);
    const font = at < 0 ? null : /\/ToUnicode (\d+) 0 R/.exec(src.slice(at, src.indexOf("endobj", at)));
    const tu = font && all.get(Number(font[1]));
    if (tu) fonts.set(name, cmap(tu.toString("latin1")));
  }
  const out: string[] = [];
  for (const body of all.values()) {
    const s = body.toString("latin1");
    if (!/\bTj\b/.test(s)) continue;
    let current: Map<number, string> | undefined;
    for (const [, font, hex] of s.matchAll(/\/(\S+) [\d.]+ Tf|<([0-9a-fA-F]*)> Tj/g)) {
      if (font) current = fonts.get(font);
      else if (hex && current) out.push((hex.match(/.{4}/g) ?? []).map((g) => current!.get(parseInt(g, 16)) ?? "?").join(""));
    }
  }
  return out;
}
