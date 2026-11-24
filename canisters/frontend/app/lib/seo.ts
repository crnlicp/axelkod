// Default head tags per page and language. Phase 5c replaces the defaults with
// the SEO settings stored in the backend (baked in at deploy and on Publish).
import type { MetaDescriptor } from "react-router";
import { dict, PATHS, SITE_URL, type Lang, type Page } from "./i18n";

const OG_IMAGE = `${SITE_URL}/og-image.png`;

export function pageMeta(page: Page, lang: Lang): MetaDescriptor[] {
  const t = dict(lang);
  const title = page === "home" ? t.seo.homeTitle : t.seo.privacyTitle;
  const description = page === "home" ? t.seo.homeDescription : t.seo.privacyDescription;
  const url = SITE_URL + PATHS[page][lang];

  const tags: MetaDescriptor[] = [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { tagName: "link", rel: "alternate", hrefLang: "sv", href: SITE_URL + PATHS[page].sv },
    { tagName: "link", rel: "alternate", hrefLang: "en", href: SITE_URL + PATHS[page].en },
    { tagName: "link", rel: "alternate", hrefLang: "x-default", href: SITE_URL + PATHS[page].sv },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Axelkod AB" },
    { property: "og:locale", content: t.locale },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: OG_IMAGE },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: "Axelkod AB" },
    { name: "twitter:card", content: "summary_large_image" },
  ];

  if (page === "home") {
    // JSON-LD is a data block, not executable script, so the CSP does not apply.
    tags.push({
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Axelkod AB",
        url: SITE_URL + "/",
        logo: `${SITE_URL}/icon-512.png`,
        address: { "@type": "PostalAddress", addressLocality: "Mölndal", addressCountry: "SE" },
      },
    });
  }
  return tags;
}
