import enJson from "../i18n/en.json";
import svJson from "../i18n/sv.json";

export type Lang = "sv" | "en";
export type Dict = typeof svJson;

// Typed against sv.json so a key missing in en.json fails the typecheck.
const en: Dict = enJson;
const dicts: Record<Lang, Dict> = { sv: svJson, en };

export const SITE_URL = "https://axelkod.eu";
export const DEFAULT_RETENTION_MONTHS = 12;

export const PATHS = {
  home: { sv: "/", en: "/en/" },
  privacy: { sv: "/integritet", en: "/en/privacy" },
  news: { sv: "/nyheter", en: "/en/news" },
} as const;
/** "article" pages have per-article paths (see otherLangPath in seo.ts). */
export type Page = keyof typeof PATHS | "article";

export function langFromPath(pathname: string): Lang {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "sv";
}

export function dict(lang: Lang): Dict {
  return dicts[lang];
}

export function otherLang(lang: Lang): Lang {
  return lang === "sv" ? "en" : "sv";
}

export function fmt(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
