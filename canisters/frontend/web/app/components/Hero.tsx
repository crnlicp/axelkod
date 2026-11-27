import { lazy, Suspense, useEffect, useState } from "react";
import { enhanceCipher } from "../lib/cipher";
import { supportsWebGL2 } from "../lib/globe/webgl";
import { homeHtml, homeRegion } from "../lib/home-render";
import { loadHome } from "../lib/homeData";
import { dict, type Lang } from "../lib/i18n";
import { HeroNetwork } from "./HeroNetwork";
import { LogoSymbol } from "./Logo";
import { Region } from "./Region";

/** Hexagon outline path centred in a 200×200 box. */
const HEX = "M100 8 L180 54 L180 146 L100 192 L20 146 L20 54 Z";
const HeroGlobe = lazy(() => import("./HeroGlobe"));

export function Hero({ lang }: { lang: Lang }) {
  const t = dict(lang);
  // The visual layers are baked into the hero text (h1 data-*) and read once it is in
  // the DOM, so nothing animates until we know which ones. No WebGL2: no globe. The logo
  // column is hidden by CSS from the same attribute, so it never flashes.
  const [layers, setLayers] = useState<{ network: boolean; globe: boolean; size: number; logoCore: boolean; logoDepth: number; beacon: [number, number]; fallback: boolean } | null>(null);
  const enhance = (el: HTMLElement) => {
    const d = el.querySelector<HTMLElement>("h1[data-globe]")?.dataset;
    const globe = d?.globe === "1" && supportsWebGL2();
    const logoCore = d?.logo === "1" && d?.logoCore === "1";
    setLayers({
      network: d ? d.network === "1" : true,
      globe,
      size: Number(d?.globeSize) || 70,
      logoCore: globe && logoCore,
      logoDepth: Number(d?.logoDepth ?? 19),
      beacon: (d?.beacon?.split(",").map(Number) as [number, number] | undefined) ?? [57.6554, 12.0138],
      // CSS hid the logo column for the globe; without WebGL2 there is no globe to hold it.
      fallback: d?.globe === "1" && logoCore && !globe,
    });
    return enhanceCipher(el);
  };
  const network = !!layers?.network;
  const globe = !!layers?.globe;
  // The 3D bundle loads after the page has loaded and the main thread is idle, so the
  // headline and first paint never wait for it.
  const [showGlobe, setShowGlobe] = useState(false);
  useEffect(() => {
    if (!globe) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    let timer = 0;
    const start = () => {
      timer = window.setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(() => setShowGlobe(true), { timeout: 1000 }) : setShowGlobe(true)), 150);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("load", start);
    };
  }, [globe]);
  return (
    <section className={`relative isolate flex min-h-[calc(100svh-4rem)] items-center overflow-hidden ${globe ? "touch-pan-y" : ""}`} aria-labelledby="hero-title">
      <div className="bg-aurora absolute inset-0 -z-20" aria-hidden="true" />
      <div className="bg-grid absolute inset-0 -z-20 opacity-60" aria-hidden="true" />
      {network && <HeroNetwork className="hero-network -z-10 opacity-80" />}
      {/* Above the network, below the content (the logo column). */}
      {globe && showGlobe && <Suspense fallback={null}><HeroGlobe lang={lang} size={layers!.size} logo={layers!.logoCore} logoDepth={layers!.logoDepth} beacon={layers!.beacon} className="-z-10" /></Suspense>}
      {globe && <div className="hero-scrim pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />}
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.15fr_0.85fr]">
        <div data-no-drag>
          <Region name={homeRegion("hero", lang)} load={async () => homeHtml(await loadHome(), "hero", lang)} enhance={enhance} />
        </div>

        {/* The logo, above the globe; with the logo off the column stays empty for the globe. */}
        <div className={`hero-logo ${layers?.fallback ? "hero-logo--fallback" : ""} hero-in relative mx-auto aspect-square w-full max-w-[26rem]`} data-step="3" aria-hidden="true">
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
