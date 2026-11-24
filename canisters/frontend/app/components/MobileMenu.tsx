import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { dict, type Lang } from "../lib/i18n";
import type { LinkItem } from "./MobileMenuPanel";

const Panel = lazy(() => import("./MobileMenuPanel"));

export function MobileMenu({ lang, links }: { lang: Lang; links: LinkItem[] }) {
  const t = dict(lang).nav;
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); button.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button ref={button} type="button" aria-expanded={open} aria-controls="mobile-menu"
        onClick={() => { setLoaded(true); setOpen(!open); }}
        aria-label={open ? t.closeMenu : t.menu}
        className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-fg">
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
        </svg>
      </button>
      {loaded && (
        <Suspense fallback={null}>
          <Panel ref={panel} open={open} links={links} onNavigate={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
