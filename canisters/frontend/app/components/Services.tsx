import { useRef, type ReactNode } from "react";
import { dict, type Lang } from "../lib/i18n";
import { useSpotlight } from "../lib/spotlight";
import { IconCode, IconParts, IconShield } from "./Icons";
import { Reveal } from "./Reveal";

function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  useSpotlight(ref);
  return (
    <li ref={ref} data-reveal className={`spotlight glass relative overflow-hidden p-7 ${className}`}>
      {children}
    </li>
  );
}

/** Decorative visuals, one per area (aria-hidden; CSS animations, off for reduced motion). */
function GearVisual() {
  return (
    <svg viewBox="0 0 200 200" className="service-gear pointer-events-none absolute -bottom-16 -right-12 h-72 w-72 text-accent opacity-25" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M100 30 l9 0 4 16 a56 56 0 0 1 14 6 l14 -9 12 12 -9 14 a56 56 0 0 1 6 14 l16 4 0 18 -16 4 a56 56 0 0 1 -6 14 l9 14 -12 12 -14 -9 a56 56 0 0 1 -14 6 l-4 16 -18 0 -4 -16 a56 56 0 0 1 -14 -6 l-14 9 -12 -12 9 -14 a56 56 0 0 1 -6 -14 l-16 -4 0 -18 16 -4 a56 56 0 0 1 6 -14 l-9 -14 12 -12 14 9 a56 56 0 0 1 14 -6 l4 -16z" />
        <path d="M100 76 l21 12 0 24 -21 12 -21 -12 0 -24z" />
      </g>
    </svg>
  );
}

function CodeVisual() {
  const lines = ["axelkod.build({", "  secure: true,", "  fast: true,", "  made_in: \"SE\",", "});"];
  return (
    <div className="code-window mt-6 rounded-xl border border-border bg-bg/70 p-4 font-mono text-sm" aria-hidden="true">
      <div className="mb-3 flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
      </div>
      {lines.map((l, i) => (
        <div key={l} className="code-line overflow-hidden whitespace-pre text-muted" data-line={String(i)}>
          <span className={i === 0 || i === 4 ? "text-accent" : undefined}>{l}</span>
        </div>
      ))}
    </div>
  );
}

function ShieldVisual() {
  return (
    <div className="pointer-events-none absolute -right-6 bottom-0 top-0 hidden w-56 items-center sm:flex" aria-hidden="true">
      <svg viewBox="0 0 120 140" className="h-48 w-full text-accent">
        <defs>
          <clipPath id="shield-clip"><path d="M60 6 C45 16 28 21 10 22 V64 C10 96 31 120 60 134 C89 120 110 96 110 64 V22 C92 21 75 16 60 6Z" /></clipPath>
        </defs>
        <path d="M60 6 C45 16 28 21 10 22 V64 C10 96 31 120 60 134 C89 120 110 96 110 64 V22 C92 21 75 16 60 6Z" fill="var(--brand-soft)" stroke="currentColor" strokeWidth="1.5" />
        <g clipPath="url(#shield-clip)">
          <rect className="shield-scan" x="0" y="0" width="120" height="3" fill="var(--glow)" opacity="0.8" />
        </g>
        <path d="M44 70 l11 11 22 -24" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Services({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const [parts, software, security] = t.services.items;
  const tile = "grid h-12 w-12 place-items-center rounded-2xl border border-border-strong bg-surface-strong text-accent shadow-[0_0_30px_-8px_var(--brand)]";
  return (
    <section id={t.anchors.services} className="relative px-5 py-28" aria-labelledby="services-title">
      <div className="mx-auto max-w-7xl">
        <Reveal self className="max-w-2xl">
          <p className="eyebrow">{t.nav.services}</p>
          <h2 id="services-title" className="mt-3 text-5xl uppercase sm:text-6xl">{t.services.title}</h2>
          <p className="mt-4 text-lg text-muted">{t.services.intro}</p>
        </Reveal>
        <Reveal as="ul" className="mt-12 grid gap-5 lg:grid-cols-3 lg:grid-rows-[auto_auto]">
          <Card className="min-h-64 lg:col-span-2">
            <GearVisual />
            <span className={tile}><IconParts className="h-6 w-6" /></span>
            <h3 className="mt-6 text-3xl uppercase">{parts.title}</h3>
            <p className="mt-2 max-w-md text-muted">{parts.text}</p>
          </Card>
          <Card className="lg:row-span-2">
            <span className={tile}><IconCode className="h-6 w-6" /></span>
            <h3 className="mt-6 text-3xl uppercase">{software.title}</h3>
            <p className="mt-2 text-muted">{software.text}</p>
            <CodeVisual />
          </Card>
          <Card className="min-h-64 lg:col-span-2">
            <ShieldVisual />
            <span className={tile}><IconShield className="h-6 w-6" /></span>
            <h3 className="mt-6 text-3xl uppercase">{security.title}</h3>
            <p className="mt-2 max-w-sm text-muted">{security.text}</p>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
