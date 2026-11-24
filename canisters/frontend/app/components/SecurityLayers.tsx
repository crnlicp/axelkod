import { useState } from "react";
import { dict, type Lang } from "../lib/i18n";
import { LogoSymbol } from "./Logo";
import { Reveal } from "./Reveal";

/** Hexagon of radius r centred in a 400×400 box. */
function hex(r: number) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k - Math.PI / 2;
    return `${200 + r * Math.cos(a)},${200 + r * Math.sin(a)}`;
  }).join(" ");
}

// Innermost first: code, infrastructure, people, supply chain.
const RADII = [70, 110, 150, 190];

export function SecurityLayers({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const s = t.security;
  const [active, setActive] = useState(0);
  return (
    <section id={t.anchors.security} className="relative overflow-hidden px-5 py-28" aria-labelledby="security-title">
      <div className="bg-aurora absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
        <div>
          <Reveal self>
            <p className="eyebrow">{s.eyebrow}</p>
            <h2 id="security-title" className="mt-3 text-5xl uppercase sm:text-6xl">{s.title}</h2>
            <p className="mt-4 text-lg text-muted">{s.intro}</p>
          </Reveal>
          <Reveal as="ul" className="mt-10 space-y-3" aria-label={s.hint}>
            {s.layers.map((layer, i) => (
              <li key={layer.title} data-reveal>
                <button type="button" aria-pressed={active === i} aria-controls="security-panel"
                  onClick={() => setActive(i)} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}
                  className="layer-btn group flex w-full items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 text-left transition-all aria-pressed:border-accent aria-pressed:bg-surface-strong">
                  <span className="font-mono text-sm text-muted group-aria-pressed:text-accent">0{i + 1}</span>
                  <span className="font-display text-2xl uppercase">{layer.title}</span>
                  <span className="ml-auto h-2 w-2 rounded-full bg-border-strong transition-all group-aria-pressed:bg-[var(--accent)] group-aria-pressed:shadow-[0_0_12px_var(--accent)]" aria-hidden="true" />
                </button>
              </li>
            ))}
          </Reveal>
          <p id="security-panel" aria-live="polite" className="layer-text mt-6 min-h-14 text-lg" key={active}>
            {s.layers[active].text}
          </p>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[30rem]" aria-hidden="true">
          <svg viewBox="0 0 400 400" className="h-full w-full">
            {RADII.map((r, i) => (
              <polygon key={r} points={hex(r)} className="layer-ring" data-active={active === i ? "" : undefined}
                data-inner={i < active ? "" : undefined} onMouseEnter={() => setActive(i)} />
            ))}
          </svg>
          <div className="absolute inset-[40%] grid place-items-center">
            <LogoSymbol className="h-full w-auto text-fg" />
          </div>
        </div>
      </div>
    </section>
  );
}
