import { dict, type Lang } from "../lib/i18n";
import { HeroNetwork } from "./HeroNetwork";
import { IconArrowRight } from "./Icons";
import { LogoSymbol } from "./Logo";

/** Hexagon outline path centred in a 200×200 box. */
const HEX = "M100 8 L180 54 L180 146 L100 192 L20 146 L20 54 Z";

export function Hero({ lang }: { lang: Lang }) {
  const t = dict(lang);
  return (
    <section className="relative isolate flex min-h-[calc(100svh-4rem)] items-center overflow-hidden" aria-labelledby="hero-title">
      <div className="bg-aurora absolute inset-0 -z-20" aria-hidden="true" />
      <div className="bg-grid absolute inset-0 -z-20 opacity-60" aria-hidden="true" />
      <HeroNetwork className="hero-network -z-10 opacity-80" />
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="eyebrow hero-in" data-step="0">{t.hero.eyebrow}</p>
          {/* Pure-CSS entrance so the headline (the LCP element) paints immediately. */}
          <h1 id="hero-title" className="mt-5 text-6xl uppercase sm:text-7xl lg:text-8xl">
            {t.hero.words.map((w, i) => (
              <span key={w} className="hero-word block" data-step={String(i + 1)}>
                <span className={i === 2 ? "text-gradient" : undefined}>{w}</span>
                {i < t.hero.words.length - 1 ? " " : ""}
              </span>
            ))}
          </h1>
          <p className="hero-in mt-6 max-w-xl text-lg text-muted sm:text-xl" data-step="4">{t.hero.subtitle}</p>
          <div className="hero-in mt-9 flex flex-wrap gap-3" data-step="5">
            <a href={`#${t.anchors.contact}`} className="btn btn-primary">
              {t.hero.cta} <IconArrowRight className="h-5 w-5" />
            </a>
            <a href={`#${t.anchors.services}`} className="btn btn-secondary">{t.hero.cta2}</a>
          </div>
        </div>

        <div className="hero-in relative mx-auto aspect-square w-full max-w-[26rem]" data-step="3" aria-hidden="true">
          <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(closest-side,var(--brand-soft),transparent)] blur-2xl" />
          <svg viewBox="0 0 200 200" className="hex-ring absolute inset-0 h-full w-full">
            <path d={HEX} fill="none" stroke="var(--border-strong)" strokeWidth="0.6" strokeDasharray="2 5" />
          </svg>
          <svg viewBox="0 0 200 200" className="hex-ring hex-ring--reverse absolute inset-[9%] h-[82%] w-[82%]">
            <path d={HEX} fill="none" stroke="var(--brand)" strokeOpacity="0.5" strokeWidth="0.8" strokeDasharray="30 12 4 12" />
          </svg>
          <div className="animate-float absolute inset-[24%] grid place-items-center">
            <LogoSymbol className="h-full w-auto text-fg drop-shadow-[0_0_30px_rgb(5_163_144/0.45)]" />
          </div>
        </div>
      </div>
      <a href={`#${t.anchors.services}`} className="scroll-cue absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-muted no-underline sm:block" aria-label={t.hero.scroll}>
        <span className="block h-10 w-6 rounded-full border border-border-strong p-1" aria-hidden="true">
          <span className="scroll-cue__dot block h-2 w-1 rounded-full bg-[var(--accent)] mx-auto" />
        </span>
      </a>
    </section>
  );
}
