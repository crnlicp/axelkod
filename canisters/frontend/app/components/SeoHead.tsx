import { useLocation } from "react-router";
import { langFromPath } from "../lib/i18n";
import { currentSeoData, PAGE_TEXTS } from "../lib/seo";
import { seoTags, type HeadTag, type SeoPage } from "../lib/seo-head";

function pageFromPath(pathname: string): SeoPage | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/" || p === "/en") return "home";
  if (p === "/integritet" || p === "/en/privacy") return "privacy";
  if (p === "/nyheter" || p === "/en/news") return "news";
  if (/^\/(nyheter|en\/news)\/[^/]+$/.test(p)) return "article";
  return null;
}

function Tag({ t }: { t: HeadTag }) {
  switch (t.tag) {
    case "title":
      return <title>{t.text}</title>;
    case "meta":
      return <meta {...t.attrs} />;
    case "link":
      return <link {...t.attrs} />;
    case "script":
      return <script {...t.attrs} dangerouslySetInnerHTML={{ __html: t.json }} />;
  }
}

/** SEO tags for public pages, between markers the bake and Publish replace. */
export function SeoHead() {
  const { pathname } = useLocation();
  const page = pageFromPath(pathname);
  if (!page) return null;
  const tags = seoTags(currentSeoData(), page, langFromPath(pathname), PAGE_TEXTS);
  return (
    <>
      <meta name="x-seo" content="start" />
      {tags.map((t, i) => <Tag key={i} t={t} />)}
      <meta name="x-seo" content="end" />
    </>
  );
}
