import { useEffect, useState } from "react";
import { Link } from "react-router";
import { dict, otherLang, PATHS, type Lang, type Page } from "../lib/i18n";
import { useOtherLangPath } from "../lib/seo";
import { LogoSymbol } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { ThemeToggle } from "./ThemeToggle";

/** Sections in the main navigation (ones that exist on the landing page). */
export const NAV_SECTIONS = ["services", "security", "industries", "news", "contact"] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

/** Tracks which landing-page section is in view (for the active indicator). */
function useActiveSection(ids: string[], enabled: boolean) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5] },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids.join(","), enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

export function SiteHeader({ lang, page }: { lang: Lang; page: Page | null }) {
  const t = dict(lang);
  const other = otherLang(lang);
  const switchTo = useOtherLangPath(page, other);
  const home = PATHS.home[lang];
  const anchor = (id: string) => (page === "home" ? `#${id}` : `${home}#${id}`);
  const ids = NAV_SECTIONS.map((k) => t.anchors[k]);
  const active = useActiveSection(ids, page === "home");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = NAV_SECTIONS.map((k) => ({ key: k, href: anchor(t.anchors[k]), label: t.nav[k], current: active === t.anchors[k] }));

  return (
    <header className="site-header sticky top-0 z-40" data-scrolled={scrolled ? "" : undefined}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5">
        <Link to={home} className="group flex items-center gap-2.5 text-fg no-underline" aria-label={t.nav.home}>
          <LogoSymbol className="h-9 w-auto transition-transform duration-500 group-hover:rotate-[8deg]" />
          <span className="font-display text-2xl font-bold uppercase tracking-wide">Axelkod</span>
        </Link>
        <nav aria-label={t.nav.label} className="flex items-center gap-2">
          <ul className="hidden items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-1 backdrop-blur md:flex">
            {links.map((l) => (
              <li key={l.key}>
                <a href={l.href} aria-current={l.current ? "location" : undefined}
                  className="nav-link relative block rounded-full px-4 py-1.5 text-sm font-medium text-fg no-underline transition-colors hover:text-accent">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <ThemeToggle lang={lang} />
          <Link to={switchTo} reloadDocument={page === "article"} hrefLang={other} lang={other}
            className="grid h-10 min-w-10 place-items-center rounded-full border border-border bg-surface px-3 text-sm font-semibold text-fg no-underline transition-colors hover:border-accent hover:text-accent">
            {t.langSwitch.short}
            <span className="sr-only"> – {t.langSwitch.label}</span>
          </Link>
          <MobileMenu lang={lang} links={links} />
        </nav>
      </div>
    </header>
  );
}
