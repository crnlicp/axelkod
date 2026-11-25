// Safe Markdown subset for news bodies. Pure and import-free (used by React, the
// deploy bake and Publish). Supported: paragraphs, ## / ### headings, - and 1.
// lists, > quotes, **bold**, *italic*, `code`, [text](https://… or /path).
// Raw HTML is never interpreted: everything is text unless it matches a rule.

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong" | "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "h2" | "h3" | "p" | "quote"; c: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] };

/** Only https:// links and same-site paths ("/..."; not "//host"). */
export function safeHref(href: string): string | null {
  if (/^https:\/\/[^\s"<>]+$/.test(href)) return href;
  if (/^\/(?!\/)[^\s"<>]*$/.test(href)) return href;
  return null;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => { if (text) { out.push({ t: "text", v: text }); text = ""; } };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\*\*(.+?)\*\*/))) { flush(); out.push({ t: "strong", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^\*([^*]+?)\*/))) { flush(); out.push({ t: "em", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^`([^`]+)`/))) { flush(); out.push({ t: "code", v: m[1] }); i += m[0].length; continue; }
    if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
      const href = safeHref(m[2]);
      if (href) { flush(); out.push({ t: "link", href, c: parseInline(m[1]) }); i += m[0].length; continue; }
    }
    text += src[i];
    i += 1;
  }
  flush();
  return out;
}

export function parse(body: string): Block[] {
  const blocks: Block[] = [];
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  const flushPara = () => { if (para.length) { blocks.push({ t: "p", c: parseInline(para.join(" ")) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) { flushPara(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{2,3})\s+(.+)$/))) { flushPara(); blocks.push({ t: m[1].length === 2 ? "h2" : "h3", c: parseInline(m[2]) }); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); blocks.push({ t: "quote", c: parseInline(m[1]) }); continue; }
    const ul = /^[-*]\s+(.+)$/;
    const ol = /^\d+[.)]\s+(.+)$/;
    if (ul.test(line) || ol.test(line)) {
      flushPara();
      const kind = ul.test(line) ? "ul" : "ol";
      const re = kind === "ul" ? ul : ol;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i].trimEnd())) {
        items.push(parseInline(lines[i].trimEnd().match(re)![1]));
        i++;
      }
      i--;
      blocks.push({ t: kind, items });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inlineHtml(c: Inline[]): string {
  return c
    .map((n) => {
      switch (n.t) {
        case "text": return esc(n.v);
        case "code": return `<code>${esc(n.v)}</code>`;
        case "strong": return `<strong>${inlineHtml(n.c)}</strong>`;
        case "em": return `<em>${inlineHtml(n.c)}</em>`;
        case "link": {
          const ext = n.href.startsWith("https://");
          return `<a href="${esc(n.href)}"${ext ? ' rel="noopener noreferrer"' : ""}>${inlineHtml(n.c)}</a>`;
        }
      }
    })
    .join("");
}

/** HTML string for baking; must match what <Markdown> renders. */
export function toHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case "ul":
        case "ol": return `<${b.t}>${b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join("")}</${b.t}>`;
        case "quote": return `<blockquote>${inlineHtml(b.c)}</blockquote>`;
        default: return `<${b.t}>${inlineHtml(b.c)}</${b.t}>`;
      }
    })
    .join("");
}

/** Plain text (for search previews and reading time). */
export function plainText(body: string): string {
  const walk = (c: Inline[]): string => c.map((n) => ("v" in n ? n.v : walk(n.c))).join("");
  return parse(body).map((b) => ("items" in b ? b.items.map(walk).join(" ") : walk(b.c))).join(" ");
}
