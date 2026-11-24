// SEO data for the shared head renderer (seo-head.ts): build-time defaults (same as
// the backend migration's), page texts from i18n, and mapping from the backend.
import { useEffect, useState } from "react";
import type { PublicConfig, SeoSettings } from "../bindings/backend";
import { dict, PATHS, type Lang, type Page } from "./i18n";
import { DATA_ID, type PageTexts, type SeoData } from "./seo-head";

const base = "https://axelkod.eu";

/** Used for the prerender; the deploy-time bake replaces it with the backend's settings. */
export const DEFAULT_SEO: SeoData = {
  sv: {
    title: dict("sv").seo.homeTitle,
    metaDescription: dict("sv").seo.homeDescription,
    ogImageUrl: `${base}/og-image.png`,
    canonicalBaseUrl: base,
    indexable: true,
  },
  en: {
    title: dict("en").seo.homeTitle,
    metaDescription: dict("en").seo.homeDescription,
    ogImageUrl: `${base}/og-image.png`,
    canonicalBaseUrl: base,
    indexable: true,
  },
  organisationName: "Axelkod AB",
  logoUrl: `${base}/icon-512.png`,
  sameAs: [],
  contact: { city: "Mölndal" },
};

export const PAGE_TEXTS: PageTexts = {
  sv: { privacyTitle: dict("sv").seo.privacyTitle, privacyDescription: dict("sv").seo.privacyDescription, locale: dict("sv").locale },
  en: { privacyTitle: dict("en").seo.privacyTitle, privacyDescription: dict("en").seo.privacyDescription, locale: dict("en").locale },
};

export function toSeoData(seo: SeoSettings, contact: PublicConfig["contact"]): SeoData {
  // Copy field by field: the renderer embeds this object as JSON, so it must hold
  // only plain values (no bigint, no undefined-vs-missing differences).
  const lang = (l: SeoSettings["sv"]) => ({
    title: l.title,
    metaDescription: l.metaDescription,
    ...(l.keywords ? { keywords: l.keywords } : {}),
    ...(l.ogTitle ? { ogTitle: l.ogTitle } : {}),
    ...(l.ogDescription ? { ogDescription: l.ogDescription } : {}),
    ogImageUrl: l.ogImageUrl,
    canonicalBaseUrl: l.canonicalBaseUrl,
    indexable: l.indexable,
  });
  return {
    sv: lang(seo.sv),
    en: lang(seo.en),
    organisationName: seo.organisationName,
    logoUrl: seo.logoUrl,
    sameAs: [...seo.sameAs],
    ...(seo.googleVerification ? { googleVerification: seo.googleVerification } : {}),
    ...(seo.bingVerification ? { bingVerification: seo.bingVerification } : {}),
    contact: {
      ...(contact.email ? { email: contact.email } : {}),
      ...(contact.phone ? { phone: contact.phone } : {}),
      ...(contact.street ? { street: contact.street } : {}),
      ...(contact.postalCode ? { postalCode: contact.postalCode } : {}),
      city: contact.city,
    },
  };
}

let embedded: SeoData | null = null;

/** In the browser: the data the page was baked with; during prerender: the defaults. */
export function currentSeoData(): SeoData {
  if (typeof document === "undefined") return DEFAULT_SEO;
  if (!embedded) {
    const el = document.getElementById(DATA_ID);
    try {
      embedded = el?.textContent ? (JSON.parse(el.textContent) as SeoData) : DEFAULT_SEO;
    } catch {
      embedded = DEFAULT_SEO;
    }
  }
  return embedded;
}

/** Where the language switch goes: an article's other version, else the same page type. */
export function otherLangPath(page: Page | null, other: Lang): string {
  if (page === "article") return currentSeoData().doc?.paths[other] ?? PATHS.news[other];
  return PATHS[page ?? "home"][other];
}

/**
 * otherLangPath as state, corrected after mount: article pages are copies of one
 * prerendered template, and hydration keeps the template's attribute values.
 */
export function useOtherLangPath(page: Page | null, other: Lang): string {
  const [path, setPath] = useState(() => (page === "article" ? PATHS.news[other] : otherLangPath(page, other)));
  useEffect(() => setPath(otherLangPath(page, other)), [page, other]);
  return path;
}
