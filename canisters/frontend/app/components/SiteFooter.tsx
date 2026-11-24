import { Link } from "react-router";
import { dict, otherLang, PATHS, type Lang, type Page } from "../lib/i18n";
import { useOtherLangPath } from "../lib/seo";
import { usePublicConfig } from "../lib/publicConfig";
import { LogoSymbol } from "./Logo";
import { NAV_SECTIONS } from "./SiteHeader";

// Org. nr, email and phone come from the backend and are shown only when set.
export function SiteFooter({ lang, page }: { lang: Lang; page: Page | null }) {
  const t = dict(lang);
  const other = otherLang(lang);
  const switchTo = useOtherLangPath(page, other);
  const c = usePublicConfig()?.contact;
  const home = PATHS.home[lang];
  const anchor = (id: string) => (page === "home" ? `#${id}` : `${home}#${id}`);
  return (
    <footer className="relative overflow-hidden border-t border-border bg-bg-elev">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--brand),var(--glow),transparent)]" aria-hidden="true" />
      <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-10 pt-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoSymbol className="h-10 w-auto text-fg" />
            <span className="font-display text-2xl font-bold uppercase tracking-wide">Axelkod</span>
          </div>
          <p className="mt-4 max-w-xs text-muted">{t.footer.tagline}</p>
        </div>
        <nav aria-label={t.footer.explore}>
          <h2 className="font-sans text-sm font-semibold uppercase tracking-[0.14em] text-muted">{t.footer.explore}</h2>
          <ul className="mt-4 space-y-2">
            {NAV_SECTIONS.map((k) => (
              <li key={k}><a href={anchor(t.anchors[k])} className="text-fg no-underline hover:text-accent">{t.nav[k]}</a></li>
            ))}
            <li><Link to={PATHS.privacy[lang]} className="text-fg no-underline hover:text-accent">{t.footer.privacy}</Link></li>
            <li><Link to={switchTo} reloadDocument={page === "article"} hrefLang={other} lang={other} className="text-fg no-underline hover:text-accent">{t.langSwitch.label}</Link></li>
          </ul>
        </nav>
        <div>
          <h2 className="font-sans text-sm font-semibold uppercase tracking-[0.14em] text-muted">{t.footer.contactHeading}</h2>
          <ul className="mt-4 space-y-2 text-fg">
            <li>{t.footer.company} · {c?.city ?? t.footer.city}</li>
            {c?.orgNumber && <li>{t.footer.orgNumber} {c.orgNumber}</li>}
            {c?.email && <li><a href={`mailto:${c.email}`}>{c.email}</a></li>}
            {c?.phone && <li><a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a></li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-5 py-5 text-sm text-muted">
          © {new Date().getFullYear()} {t.footer.company}. {t.footer.rights}
        </p>
      </div>
      <p className="pointer-events-none select-none text-center font-display text-[18vw] font-bold uppercase leading-[0.8] text-transparent [-webkit-text-stroke:1px_var(--border-strong)]" aria-hidden="true">
        Axelkod
      </p>
    </footer>
  );
}
