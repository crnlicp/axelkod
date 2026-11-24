import { Link } from "react-router";
import { dict, otherLang, PATHS, type Lang, type Page } from "../lib/i18n";
import { LogoSymbol } from "./Logo";

export function SiteHeader({ lang, page }: { lang: Lang; page: Page | null }) {
  const t = dict(lang);
  const other = otherLang(lang);
  const home = PATHS.home[lang];
  // Anchors work from every page: off the home page they link back to it.
  const anchor = (id: string) => (page === "home" ? `#${id}` : `${home}#${id}`);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link to={home} className="flex items-center gap-2.5 text-fg no-underline" aria-label={t.nav.home}>
          <LogoSymbol className="h-10 w-auto" />
          <span className="font-display text-2xl font-bold uppercase tracking-wide">Axelkod</span>
        </Link>
        <nav aria-label={t.nav.label} className="flex items-center gap-1 sm:gap-2">
          <ul className="hidden items-center gap-1 md:flex">
            {(["services", "why", "contact"] as const).map((k) => (
              <li key={k}>
                <a href={anchor(t.anchors[k])} className="rounded px-3 py-2 font-medium text-fg no-underline hover:text-accent">
                  {t.nav[k]}
                </a>
              </li>
            ))}
          </ul>
          <Link
            to={PATHS[page ?? "home"][other]}
            hrefLang={other}
            lang={other}
            className="rounded border border-border px-3 py-1.5 text-sm font-semibold text-fg no-underline hover:border-accent hover:text-accent"
          >
            {t.langSwitch.short}
            <span className="sr-only"> – {t.langSwitch.label}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
