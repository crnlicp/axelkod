// SEO <head> renderer shared by React (prerender + hydration), the deploy-time bake
// (scripts/presync.mjs) and the admin's Publish. Pure and import-free so Node can
// load it directly. Its output sits between two marker tags; the bake and Publish
// replace exactly that region, and the embedded JSON lets the client hydrate with
// the same values the HTML was baked with.

export type Lang = "sv" | "en";
export type SeoPage = "home" | "privacy" | "news" | "article";

/** A news list or article page: its own title/description/paths (baked per file). */
export type SeoDoc = {
  kind: "list" | "article";
  title: string;
  description: string;
  paths: Partial<Record<Lang, string>>;
  publishedAt?: string;
  image?: string;
};

export type SeoLangData = {
  title: string;
  metaDescription: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl: string;
  canonicalBaseUrl: string;
  indexable: boolean;
};

export type SeoData = {
  sv: SeoLangData;
  en: SeoLangData;
  organisationName: string;
  logoUrl: string;
  sameAs: string[];
  googleVerification?: string;
  bingVerification?: string;
  contact: { email?: string; phone?: string; street?: string; postalCode?: string; city: string };
  doc?: SeoDoc;
};

/** Fixed per-page texts that are not admin-editable (from the i18n files). */
export type PageTexts = Record<Lang, { privacyTitle: string; privacyDescription: string; locale: string }>;

export type HeadTag =
  | { tag: "title"; text: string }
  | { tag: "meta"; attrs: Record<string, string> }
  | { tag: "link"; attrs: Record<string, string> }
  | { tag: "script"; attrs: { type: string; id?: string }; json: string };

export const PATHS: Record<"home" | "privacy", Record<Lang, string>> = {
  home: { sv: "/", en: "/en/" },
  privacy: { sv: "/integritet", en: "/en/privacy" },
};

/** Files Publish rewrites, keyed by the URL they are fetched from. */
export const PAGE_FILES: Array<{ page: SeoPage; lang: Lang; url: string; key: string }> = [
  { page: "home", lang: "sv", url: "/", key: "/index.html" },
  { page: "home", lang: "en", url: "/en/", key: "/en/index.html" },
  { page: "privacy", lang: "sv", url: "/integritet", key: "/integritet.html" },
  { page: "privacy", lang: "en", url: "/en/privacy", key: "/en/privacy.html" },
];

export const START = '<meta name="x-seo" content="start"/>';
export const END = '<meta name="x-seo" content="end"/>';
export const DATA_ID = "seo-data";

/** JSON safe inside <script>: no "</script>", no HTML comment or line-separator tricks. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const url = (base: string, path: string) => base.replace(/\/+$/, "") + path;

export function seoTags(data: SeoData, page: SeoPage, lang: Lang, texts: PageTexts): HeadTag[] {
  if (page === "news" || page === "article") return docTags(data, lang, texts);
  const s = data[lang];
  const isHome = page === "home";
  const title = isHome ? s.title : texts[lang].privacyTitle;
  const description = isHome ? s.metaDescription : texts[lang].privacyDescription;
  const canonical = url(s.canonicalBaseUrl, PATHS[page][lang]);
  const meta = (attrs: Record<string, string>): HeadTag => ({ tag: "meta", attrs });

  const tags: HeadTag[] = [
    { tag: "title", text: title },
    meta({ name: "description", content: description }),
  ];
  if (isHome && s.keywords) tags.push(meta({ name: "keywords", content: s.keywords }));
  tags.push(meta({ name: "robots", content: s.indexable ? "index, follow" : "noindex, nofollow" }));
  if (data.googleVerification) tags.push(meta({ name: "google-site-verification", content: data.googleVerification }));
  if (data.bingVerification) tags.push(meta({ name: "msvalidate.01", content: data.bingVerification }));
  tags.push(
    { tag: "link", attrs: { rel: "canonical", href: canonical } },
    { tag: "link", attrs: { rel: "alternate", hrefLang: "sv", href: url(data.sv.canonicalBaseUrl, PATHS[page].sv) } },
    { tag: "link", attrs: { rel: "alternate", hrefLang: "en", href: url(data.en.canonicalBaseUrl, PATHS[page].en) } },
    { tag: "link", attrs: { rel: "alternate", hrefLang: "x-default", href: url(data.sv.canonicalBaseUrl, PATHS[page].sv) } },
    meta({ property: "og:type", content: "website" }),
    meta({ property: "og:site_name", content: data.organisationName }),
    meta({ property: "og:locale", content: texts[lang].locale }),
    meta({ property: "og:title", content: (isHome && s.ogTitle) || title }),
    meta({ property: "og:description", content: (isHome && s.ogDescription) || description }),
    meta({ property: "og:url", content: canonical }),
    meta({ property: "og:image", content: s.ogImageUrl }),
    meta({ property: "og:image:alt", content: data.organisationName }),
    meta({ name: "twitter:card", content: "summary_large_image" }),
  );
  if (isHome) {
    const c = data.contact;
    const ld: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: data.organisationName,
      url: url(s.canonicalBaseUrl, "/"),
      logo: data.logoUrl,
      address: {
        "@type": "PostalAddress",
        ...(c.street ? { streetAddress: c.street } : {}),
        ...(c.postalCode ? { postalCode: c.postalCode } : {}),
        addressLocality: c.city,
        addressCountry: "SE",
      },
    };
    if (data.sameAs.length) ld.sameAs = data.sameAs;
    if (c.email) ld.email = c.email;
    if (c.phone) ld.telephone = c.phone;
    tags.push({ tag: "script", attrs: { type: "application/ld+json" }, json: scriptJson(ld) });
  }
  tags.push({ tag: "script", attrs: { type: "application/json", id: DATA_ID }, json: scriptJson(data) });
  return tags;
}

function docTags(data: SeoData, lang: Lang, texts: PageTexts): HeadTag[] {
  const s = data[lang];
  const d = data.doc;
  const meta = (attrs: Record<string, string>): HeadTag => ({ tag: "meta", attrs });
  // The unbaked template has no doc: keep it out of search results.
  if (!d) return [{ tag: "title", text: data.organisationName }, meta({ name: "robots", content: "noindex" }), { tag: "script", attrs: { type: "application/json", id: DATA_ID }, json: scriptJson(data) }];
  const title = `${d.title} – ${data.organisationName}`;
  const canonical = url(s.canonicalBaseUrl, d.paths[lang] ?? "/");
  const tags: HeadTag[] = [
    { tag: "title", text: title },
    meta({ name: "description", content: d.description }),
    meta({ name: "robots", content: s.indexable ? "index, follow" : "noindex, nofollow" }),
    { tag: "link", attrs: { rel: "canonical", href: canonical } },
  ];
  for (const l of ["sv", "en"] as const) {
    const p = d.paths[l];
    if (p) tags.push({ tag: "link", attrs: { rel: "alternate", hrefLang: l, href: url(data[l].canonicalBaseUrl, p) } });
  }
  if (d.paths.sv) tags.push({ tag: "link", attrs: { rel: "alternate", hrefLang: "x-default", href: url(data.sv.canonicalBaseUrl, d.paths.sv) } });
  tags.push(
    meta({ property: "og:type", content: d.kind === "article" ? "article" : "website" }),
    meta({ property: "og:site_name", content: data.organisationName }),
    meta({ property: "og:locale", content: texts[lang].locale }),
    meta({ property: "og:title", content: d.title }),
    meta({ property: "og:description", content: d.description }),
    meta({ property: "og:url", content: canonical }),
    meta({ property: "og:image", content: d.image ?? s.ogImageUrl }),
    meta({ property: "og:image:alt", content: d.title }),
    meta({ name: "twitter:card", content: "summary_large_image" }),
  );
  if (d.kind === "article" && d.publishedAt) {
    tags.push(meta({ property: "article:published_time", content: d.publishedAt }));
    tags.push({
      tag: "script",
      attrs: { type: "application/ld+json" },
      json: scriptJson({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: d.title,
        description: d.description,
        datePublished: d.publishedAt,
        image: [d.image ?? s.ogImageUrl],
        mainEntityOfPage: canonical,
        inLanguage: lang,
        publisher: { "@type": "Organization", name: data.organisationName, logo: { "@type": "ImageObject", url: data.logoUrl } },
      }),
    });
  }
  tags.push({ tag: "script", attrs: { type: "application/json", id: DATA_ID }, json: scriptJson(data) });
  return tags;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attrName = (k: string) => (k === "hrefLang" ? "hreflang" : k);

export function renderTags(tags: HeadTag[]): string {
  return tags
    .map((t) => {
      if (t.tag === "title") return `<title>${esc(t.text)}</title>`;
      if (t.tag === "script") {
        const a = Object.entries(t.attrs).map(([k, v]) => ` ${k}="${esc(v!)}"`).join("");
        return `<script${a}>${t.json}</script>`;
      }
      const a = Object.entries(t.attrs).map(([k, v]) => ` ${attrName(k)}="${esc(v)}"`).join("");
      return `<${t.tag}${a}/>`;
    })
    .join("");
}

const scriptRe = (type: string, id?: string) =>
  new RegExp(`<script type="${type.replace("+", "\\+")}"${id ? ` id="${id}"` : ""}>[\\s\\S]*?</script>`);

/**
 * Rewrites a prerendered page's SEO tags. Meta and link tags live between the
 * markers; React 19 moves inline <script> elements to the end of <head>, so the
 * JSON-LD and data blocks are replaced where they are. Throws if anything is missing.
 */
export function replaceSeoRegion(html: string, data: SeoData, page: SeoPage, lang: Lang, texts: PageTexts): string {
  const tags = seoTags(data, page, lang, texts);
  // React may write the markers as <meta .../> or <meta ...>; accept both.
  const start = /<meta name="x-seo" content="start"\s*\/?>/.exec(html);
  const end = /<meta name="x-seo" content="end"\s*\/?>/.exec(html);
  if (!start || !end || end.index < start.index) throw new Error("SEO markers not found");
  let out = html.slice(0, start.index) + START + renderTags(tags.filter((t) => t.tag !== "script")) + html.slice(end.index);
  for (const t of tags) {
    if (t.tag !== "script") continue;
    const re = scriptRe(t.attrs.type, t.attrs.id);
    if (re.test(out)) {
      out = out.replace(re, () => renderTags([t]));
    } else {
      // A block the page didn't have (e.g. JSON-LD on an article baked from the
      // template): put it right before the data block, where React would.
      const data = scriptRe("application/json", DATA_ID);
      if (t.attrs.id === DATA_ID || !data.test(out)) throw new Error(`SEO script block ${t.attrs.type} not found`);
      out = out.replace(data, (m) => renderTags([t]) + m);
    }
  }
  return out;
}

export type SitemapExtra = { paths: Partial<Record<Lang, string>>; lastmod?: string };

export function sitemapXml(data: SeoData, lastmod: string, extra: SitemapExtra[] = []): string {
  const pages: Array<"home" | "privacy"> = ["home", "privacy"];
  const more = extra.flatMap((e) =>
    (["sv", "en"] as const)
      .filter((lang) => e.paths[lang] && data[lang].indexable)
      .map((lang) => {
        const alt = (["sv", "en"] as const)
          .filter((l) => e.paths[l])
          .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(url(data[l].canonicalBaseUrl, e.paths[l]!))}"/>`)
          .join("\n");
        return `  <url>
    <loc>${esc(url(data[lang].canonicalBaseUrl, e.paths[lang]!))}</loc>
    <lastmod>${e.lastmod ?? lastmod}</lastmod>
${alt}
  </url>`;
      }),
  );
  const urls = pages.flatMap((page) =>
    (["sv", "en"] as const)
      .filter((lang) => data[lang].indexable)
      .map((lang) => {
        const alt = (l: Lang) => url(data[l].canonicalBaseUrl, PATHS[page][l]);
        return `  <url>
    <loc>${esc(alt(lang))}</loc>
    <lastmod>${lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="sv" href="${esc(alt("sv"))}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${esc(alt("en"))}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(alt("sv"))}"/>
  </url>`;
      }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[...urls, ...more].join("\n")}
</urlset>
`;
}

export function robotsTxt(data: SeoData): string {
  const none = !data.sv.indexable && !data.en.indexable;
  return `User-agent: *
${none ? "Disallow: /" : "Allow: /"}
Disallow: /admin
Disallow: /_tpl/

Sitemap: ${url(data.sv.canonicalBaseUrl, "/sitemap.xml")}
`;
}
