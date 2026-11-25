// News HTML shared by React (client fallback), the deploy-time bake and Publish.
// Output goes into marked regions (<!--region:x--> … <!--/region:x-->) that React
// renders with dangerouslySetInnerHTML, so baked HTML and the client never diverge.
import { parse, toHtml } from "./md.ts";

export type Lang = "sv" | "en";
export type NewsLangJson = { title: string; excerpt: string; body: string; coverAlt: string };
export type NewsJson = {
  slug: string;
  publishedAt: number; // ms
  area?: "parts" | "software" | "security" | "company";
  coverUrl?: string;
  sv: NewsLangJson;
  en?: NewsLangJson;
};

export const NEWS_LIST: Record<Lang, string> = { sv: "/nyheter", en: "/en/news" };
export const articlePath = (lang: Lang, slug: string) => `${NEWS_LIST[lang]}/${slug}`;
export const articleKey = (lang: Lang, slug: string) => `${articlePath(lang, slug)}.html`;
/** Prerendered article templates (copied per article). */
export const TEMPLATE: Record<Lang, { url: string; key: string }> = {
  sv: { url: "/_tpl/article-sv", key: "/_tpl/article-sv.html" },
  en: { url: "/_tpl/article-en", key: "/_tpl/article-en.html" },
};

const T = {
  sv: {
    readMore: "Läs mer", all: "Alla nyheter", empty: "Inga nyheter ännu.", back: "Alla nyheter", other: "Read in English",
    months: ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"],
    areas: { parts: "Fordonsdelar", software: "Mjukvara", security: "Cybersäkerhet", company: "Företaget" },
  },
  en: {
    readMore: "Read more", all: "All news", empty: "No news yet.", back: "All news", other: "Läs på svenska",
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    areas: { parts: "Vehicle parts", software: "Software", security: "Cyber security", company: "Company" },
  },
} as const;

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Same text in Node and every browser (no Intl differences). UTC date. */
export function formatDate(ms: number, lang: Lang): string {
  const d = new Date(ms);
  const m = T[lang].months[d.getUTCMonth()];
  return lang === "sv" ? `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}`;
}
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Articles visible in `lang`, newest first. */
export function forLang(items: NewsJson[], lang: Lang): Array<NewsJson & { l: NewsLangJson }> {
  return items
    .filter((n) => lang === "sv" || !!n.en)
    .map((n) => ({ ...n, l: (lang === "sv" ? n.sv : n.en)! }))
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

/** Deterministic hexagon artwork for articles without a cover image. */
function coverArt(slug: string): string {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hexes: string[] = [];
  for (let i = 0; i < 7; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const x = 40 + (h % 520);
    const y = 30 + ((h >>> 8) % 250);
    const r = 18 + ((h >>> 16) % 46);
    const pts = Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 3) * k + Math.PI / 6;
      return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
    hexes.push(`<polygon points="${pts}" fill="none" stroke="var(--brand)" stroke-opacity="${(0.25 + (i % 3) * 0.2).toFixed(2)}" stroke-width="1.5"/>`);
  }
  const angle = h % 360;
  return `<svg class="news-art" viewBox="0 0 600 315" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="g-${esc(slug)}" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="var(--brand)" stop-opacity=".35"/><stop offset="1" stop-color="var(--glow)" stop-opacity=".12"/></linearGradient></defs><rect width="600" height="315" fill="url(#g-${esc(slug)})"/>${hexes.join("")}</svg>`;
}

function media(n: NewsJson, alt: string): string {
  return n.coverUrl
    ? `<img src="${esc(n.coverUrl)}" alt="${esc(alt)}" loading="lazy" decoding="async" class="h-full w-full object-cover"/>`
    : coverArt(n.slug);
}

function card(n: NewsJson & { l: NewsLangJson }, lang: Lang): string {
  const area = n.area ? `<span class="news-chip">${esc(T[lang].areas[n.area])}</span>` : "";
  return `<li data-reveal class="spotlight glass group relative overflow-hidden"><a href="${esc(articlePath(lang, n.slug))}" class="flex h-full flex-col text-fg no-underline"><div class="news-media aspect-[1200/630] overflow-hidden border-b border-border">${media(n, n.l.coverAlt)}</div><div class="flex flex-1 flex-col p-6"><p class="flex flex-wrap items-center gap-2 text-sm text-muted"><time datetime="${isoDate(n.publishedAt)}">${formatDate(n.publishedAt, lang)}</time>${area}</p><h3 class="mt-3 text-2xl uppercase">${esc(n.l.title)}</h3><p class="mt-2 flex-1 text-muted">${esc(n.l.excerpt)}</p><span class="mt-5 inline-flex items-center gap-2 font-semibold text-accent">${T[lang].readMore}<span aria-hidden="true" class="transition-transform group-hover:translate-x-1">→</span></span></div></a></li>`;
}

export function cardsHtml(items: NewsJson[], lang: Lang, limit?: number): string {
  const list = forLang(items, lang).slice(0, limit);
  if (list.length === 0) return `<p class="news-empty card text-muted">${T[lang].empty}</p>`;
  return `<ul class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">${list.map((n) => card(n, lang)).join("")}</ul>`;
}

export function articleHtml(n: NewsJson, lang: Lang): string {
  const l = (lang === "sv" ? n.sv : n.en)!;
  const other: Lang = lang === "sv" ? "en" : "sv";
  const hasOther = other === "sv" || !!n.en;
  const area = n.area ? `<span class="news-chip">${esc(T[lang].areas[n.area])}</span>` : "";
  const otherLink = hasOther ? `<a href="${esc(articlePath(other, n.slug))}" hreflang="${other}" lang="${other}">${T[lang].other}</a>` : "";
  return `<article class="mx-auto max-w-3xl px-5 py-16"><p><a href="${NEWS_LIST[lang]}" class="text-sm font-semibold no-underline">← ${T[lang].back}</a></p><p class="mt-8 flex flex-wrap items-center gap-2 text-sm text-muted"><time datetime="${isoDate(n.publishedAt)}">${formatDate(n.publishedAt, lang)}</time>${area}</p><h1 class="mt-3 text-5xl uppercase sm:text-6xl">${esc(l.title)}</h1><p class="mt-5 text-xl text-muted">${esc(l.excerpt)}</p><div class="news-media glass mt-10 aspect-[1200/630] overflow-hidden">${media(n, l.coverAlt)}</div><div class="prose-ax mt-10">${toHtml(parse(l.body))}</div>${otherLink ? `<p class="mt-12 border-t border-border pt-6">${otherLink}</p>` : ""}</article>`;
}

/** Body for an article that was removed or unpublished (until the next deploy). */
export function goneHtml(lang: Lang): string {
  const t = lang === "sv"
    ? { h: "Sidan hittades inte", p: "Nyheten finns inte längre." }
    : { h: "Page not found", p: "This news item is no longer available." };
  return `<article class="mx-auto max-w-3xl px-5 py-24 text-center"><h1 class="text-4xl uppercase">${t.h}</h1><p class="mt-4 text-muted">${t.p}</p><p class="mt-8"><a href="${NEWS_LIST[lang]}" class="btn btn-primary">${T[lang].all}</a></p></article>`;
}

const START = (name: string) => `<!--region:${name}-->`;
const END = (name: string) => `<!--/region:${name}-->`;
export const emptyRegion = (name: string) => START(name) + END(name);
export const region = (name: string, inner: string) => START(name) + inner + END(name);

/** Replaces a region's content in a page; throws when the region is missing. */
export function replaceRegion(html: string, name: string, inner: string): string {
  const a = html.indexOf(START(name));
  const b = html.indexOf(END(name));
  if (a < 0 || b < a) throw new Error(`region ${name} not found`);
  return html.slice(0, a) + START(name) + inner + html.slice(b);
}

/** Converts the backend's News (bigint ns, optional fields) to the plain JSON form. */
export function fromBackend(n: { slug: string; publishedAt: bigint; area?: string; coverUrl?: string; sv: NewsLangJson; en?: NewsLangJson }): NewsJson {
  return {
    slug: n.slug,
    publishedAt: Number(n.publishedAt / 1_000_000n),
    ...(n.area ? { area: n.area as NewsJson["area"] } : {}),
    ...(n.coverUrl ? { coverUrl: n.coverUrl } : {}),
    sv: n.sv,
    ...(n.en ? { en: n.en } : {}),
  };
}

/** SEO description of one news page (for seo-head's `doc`). */
export function articleDoc(n: NewsJson, lang: Lang, baseUrl: string) {
  const l = (lang === "sv" ? n.sv : n.en)!;
  const paths: Partial<Record<Lang, string>> = { sv: articlePath("sv", n.slug) };
  if (n.en) paths.en = articlePath("en", n.slug);
  const image = n.coverUrl ? (n.coverUrl.startsWith("/") ? baseUrl.replace(/\/+$/, "") + n.coverUrl : n.coverUrl) : undefined;
  return { kind: "article" as const, title: l.title, description: l.excerpt, paths, publishedAt: new Date(n.publishedAt).toISOString(), ...(image ? { image } : {}) };
}

export function listDoc(lang: Lang) {
  return {
    kind: "list" as const,
    title: lang === "sv" ? "Nyheter" : "News",
    description: lang === "sv" ? "Nyheter från Axelkod AB." : "News from Axelkod AB.",
    paths: { sv: NEWS_LIST.sv, en: NEWS_LIST.en },
  };
}
