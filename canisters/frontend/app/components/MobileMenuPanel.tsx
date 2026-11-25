// Loaded on first open (React.lazy), so Motion's React runtime never weighs on
// the initial page load. Renders only client-side: no animation styles in the HTML.
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { forwardRef } from "react";
import { EASE_OUT_EXPO } from "../lib/reveal";

export type LinkItem = { key: string; href: string; label: string; current: boolean };

const MobileMenuPanel = forwardRef<HTMLDivElement, { open: boolean; links: LinkItem[]; onNavigate: () => void }>(
  function MobileMenuPanel({ open, links, onNavigate }, ref) {
    return (
      <LazyMotion features={domAnimation} strict>
        <AnimatePresence>
          {open && (
            <m.div ref={ref} id="mobile-menu" key="menu"
              initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
              className="absolute inset-x-3 top-[4.25rem] z-50 rounded-2xl border border-border-strong bg-bg-elev/95 p-3 shadow-2xl backdrop-blur-xl">
              {/* Focus the first link once the (lazily loaded) panel is in the DOM. */}
              <ul className="space-y-1" ref={(el) => { el?.querySelector<HTMLElement>("a")?.focus(); }}>
                {links.map((l, i) => (
                  <m.li key={l.key} data-nav={l.key} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i + 0.05 }}>
                    <a href={l.href} onClick={onNavigate} aria-current={l.current ? "location" : undefined}
                      className="block rounded-xl px-4 py-3 text-lg font-medium text-fg no-underline hover:bg-surface-strong aria-[current=location]:text-accent">
                      {l.label}
                    </a>
                  </m.li>
                ))}
              </ul>
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>
    );
  },
);
export default MobileMenuPanel;
