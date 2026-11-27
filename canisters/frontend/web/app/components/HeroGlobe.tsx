// Lazy-loaded (code-split) host for the WebGL hero globe: city tooltips on hover,
// drag to spin, zooms out as the hero scrolls away. Pauses off-screen and in hidden
// tabs, draws one still frame for reduced motion. A theme change rebuilds the
// scene in the new colours (a fresh canvas, so no WebGL state carries over).
import { useEffect, useRef, useState } from "react";
import type { City } from "../lib/globe/cities";
import { CITIES } from "../lib/globe/cities";
import { GlobeScene, themeColors, type HoverInfo } from "../lib/globe/globe";
import { detectQuality } from "../lib/globe/quality";
import type { Lang } from "../lib/i18n";

const HUD: Record<Lang, { status: string; nodes: string }> = {
  sv: { status: "Alla kanaler krypterade", nodes: "Aktiva noder" },
  en: { status: "All channels encrypted", nodes: "Active nodes" },
};

/** 59.33 -> "059°19′ N" */
function fmtCoord(v: number, pos: string, neg: string) {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  return `${d.toString().padStart(3, "0")}°${m.toString().padStart(2, "0")}′ ${v >= 0 ? pos : neg}`;
}
const HEX = "0123456789abcdef";
const randomHash = () => Array.from({ length: 16 }, () => HEX[(Math.random() * 16) | 0]).join("");

type Events = { onHover: (h: HoverInfo | null) => void; onLongitude: (lon: number, lat: number) => void; onArrival: (c: City) => void };

/** The hero's own logo symbol as an SVG data URL, in the current theme's colours (for the globe's core). */
function logoDataUrl(section: Element | null): string | undefined {
  const svg = section?.querySelector<SVGSVGElement>(".hero-logo .animate-float svg");
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", "512");
  clone.setAttribute("height", String(Math.round((512 * svg.viewBox.baseVal.height) / svg.viewBox.baseVal.width)));
  const xml = new XMLSerializer().serializeToString(clone).replaceAll("currentColor", getComputedStyle(svg).color);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

const isLight = () => document.documentElement.getAttribute("data-theme") === "light";

type Look = { size: number; logo: boolean; logoDepth: number; beacon: [number, number] };

function Scene({ size, logo, logoDepth, beacon, onHover, onLongitude, onArrival }: Events & Look) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = ref.current!;
    // The hero section receives the pointer; the canvas itself sits behind the content.
    const surface = canvas.closest("section") ?? canvas.parentElement!;
    const globe = new GlobeScene(canvas, {
      quality: detectQuality(),
      colors: themeColors(),
      size: size / 100,
      logo: logo ? logoDataUrl(surface) : undefined,
      logoDepth: logoDepth / 100,
      beacon: { lat: beacon[0], lon: beacon[1] },
      logoHeight: () => surface.querySelector(".hero-logo .animate-float svg")?.getBoundingClientRect().height ?? 0,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      onHover,
      onLongitude,
      onArrival,
      onReady: () => setReady(true),
    });
    globe.init("/globe/land.bin", "/globe/coast.bin").catch((e: unknown) => console.warn("[globe]", e));

    const ro = new ResizeObserver(() => globe.resize());
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? globe.start() : globe.stop()));
    io.observe(canvas);
    const onVis = () => (document.hidden ? globe.stop() : globe.start());
    document.addEventListener("visibilitychange", onVis);
    const onScroll = () => {
      const r = surface.getBoundingClientRect();
      globe.setScroll(-r.top / r.height);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Text, links and buttons keep their normal pointer behaviour; dragging starts elsewhere.
    const isInteractive = (t: EventTarget | null) => t instanceof Element && !!t.closest("a,button,input,textarea,select,[data-no-drag]");
    const onMove = (e: PointerEvent) => {
      const r = surface.getBoundingClientRect();
      globe.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
      globe.dragMove(e.clientX, e.clientY);
      if (e.pointerType === "mouse") {
        const c = canvas.getBoundingClientRect();
        globe.hoverAt(e.clientX - c.left, e.clientY - c.top);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (isInteractive(e.target) || e.button !== 0) return;
      globe.dragStart(e.clientX, e.clientY);
    };
    const onUp = () => globe.dragEnd();
    const onLeave = () => {
      globe.setPointer(0, 0);
      onHover(null);
    };
    surface.addEventListener("pointermove", onMove);
    surface.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    surface.addEventListener("pointerleave", onLeave);

    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("scroll", onScroll);
      surface.removeEventListener("pointermove", onMove);
      surface.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      surface.removeEventListener("pointerleave", onLeave);
      onHover(null);
      globe.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas ref={ref} aria-hidden="true"
      className={`hero-globe pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-[1600ms] ${ready ? "" : "opacity-0"}`} />
  );
}

/** `size`: the globe's diameter in % of the screen height. */
/** `logo`: draw the hero logo inside the globe; `beacon`: where the beacon pulses ([lat, lon]). */
export default function HeroGlobe({ lang, size, logo = false, logoDepth = 19, beacon = [57.6554, 12.0138], className = "" }:
  { lang: Lang; size: number; logo?: boolean; logoDepth?: number; beacon?: [number, number]; className?: string }) {
  const [light, setLight] = useState(isLight);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [coords, setCoords] = useState({ lon: 18.07, lat: 59.33 });
  const [arrivals, setArrivals] = useState(0);
  const [lastCity, setLastCity] = useState<City | null>(null);
  const [hash, setHash] = useState("9f86d081884c7d65");
  useEffect(() => {
    const mo = new MutationObserver(() => setLight(isLight()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => mo.disconnect();
    // Live "handshake" hash ticker.
    const id = setInterval(() => !document.hidden && setHash(randomHash()), 1400);
    return () => {
      mo.disconnect();
      clearInterval(id);
    };
  }, []);
  const t = HUD[lang];

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      <Scene key={`${light ? "light" : "dark"}-${size}-${logo}-${logoDepth}-${beacon}`} size={size} logo={logo} logoDepth={logoDepth} beacon={beacon} onHover={setHover} onLongitude={(lon, lat) => setCoords({ lon, lat })}
        onArrival={(c) => { setArrivals((n) => n + 1); setLastCity(c); }} />
      {/* Coordinates facing the viewer, and the network's live status (decorative). */}
      <div className="globe-hud" aria-hidden="true">
        <div className="globe-hud__coords">
          <div>LAT {fmtCoord(coords.lat, "N", "S")}</div>
          <div>LON {fmtCoord(coords.lon, "E", "W")}</div>
        </div>
        <div className="globe-hud__status">
          <span className="globe-hud__dot" />
          {t.status.toUpperCase()}
        </div>
        <div className="globe-hud__net">
          <div>
            {t.nodes.toUpperCase()} <b>{CITIES.length}</b> · PKT <b>{arrivals.toString().padStart(5, "0")}</b>
            {lastCity && <span className="globe-hud__accent"> → {lastCity.code}</span>}
          </div>
          <div>SHA-256 › <span className="globe-hud__accent">{hash}…</span></div>
        </div>
      </div>
      {hover && (
        <div className="globe-tip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
          <div className="globe-tip__city">
            {hover.city.code}-0{(hover.city.code.charCodeAt(0) % 4) + 1} · {hover.city.name}
          </div>
          <div className="globe-tip__meta">{hover.cipher} · {hover.latency} ms</div>
        </div>
      )}
    </div>
  );
}
