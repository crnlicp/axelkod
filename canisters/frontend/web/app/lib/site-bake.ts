// Everything baked into the static site from backend data, in one pure function:
// used by the deploy-time bake (scripts/presync.mjs) and by Publish in the admin.
import { HOME_KEYS, homeHtml, homeRegion, type HomeContent } from "./home-render.ts";
import { articleDoc, articleHtml, articleKey, cardsHtml, forLang, listDoc, NEWS_LIST, replaceRegion, type Lang, type NewsJson } from "./news-render.ts";
import { PAGE_FILES, replaceSeoRegion, robotsTxt, sitemapXml, type PageTexts, type SeoData, type SeoPage } from "./seo-head.ts";

/** Pages that exist in every build, fetched/read by key. */
export const SITE_PAGES: Array<{ page: SeoPage; lang: Lang; url: string; key: string }> = [
  ...PAGE_FILES,
  { page: "news", lang: "sv", url: NEWS_LIST.sv, key: `${NEWS_LIST.sv}.html` },
  { page: "news", lang: "en", url: NEWS_LIST.en, key: `${NEWS_LIST.en}.html` },
];

export type BakeInput = {
  data: SeoData;
  news: NewsJson[];
  home: HomeContent;
  texts: PageTexts;
  today: string; // YYYY-MM-DD
  pages: Record<string, string>; // SITE_PAGES key -> current HTML
  templates: Record<Lang, string>; // article template HTML
};

export type BakedFile = { key: string; html: string; article: boolean };

export function bakeSite(i: BakeInput): { files: BakedFile[]; sitemap: string; robots: string } {
  const files: BakedFile[] = [];
  for (const p of SITE_PAGES) {
    const source = i.pages[p.key];
    if (source === undefined) throw new Error(`bake: page ${p.key} missing`);
    const data = p.page === "news" ? { ...i.data, doc: listDoc(p.lang) } : i.data;
    let html = replaceSeoRegion(source, data, p.page, p.lang, i.texts);
    if (p.page === "home") {
      html = replaceRegion(html, `news-cards-${p.lang}`, cardsHtml(i.news, p.lang, 3));
      for (const key of HOME_KEYS) html = replaceRegion(html, homeRegion(key, p.lang), homeHtml(i.home, key, p.lang));
    }
    if (p.page === "news") html = replaceRegion(html, `news-list-${p.lang}`, cardsHtml(i.news, p.lang));
    files.push({ key: p.key, html, article: false });
  }
  for (const lang of ["sv", "en"] as const) {
    for (const n of forLang(i.news, lang)) {
      const data = { ...i.data, doc: articleDoc(n, lang, i.data[lang].canonicalBaseUrl) };
      let html = replaceSeoRegion(i.templates[lang], data, "article", lang, i.texts);
      html = replaceRegion(html, "article", articleHtml(n, lang));
      files.push({ key: articleKey(lang, n.slug), html, article: true });
    }
  }
  const extra = [
    { paths: { sv: NEWS_LIST.sv, en: NEWS_LIST.en } },
    ...i.news.map((n) => ({
      paths: { sv: `${NEWS_LIST.sv}/${n.slug}`, ...(n.en ? { en: `${NEWS_LIST.en}/${n.slug}` } : {}) },
      lastmod: new Date(n.publishedAt).toISOString().slice(0, 10),
    })),
  ];
  return { files, sitemap: sitemapXml(i.data, i.today, extra), robots: robotsTxt(i.data) };
}
