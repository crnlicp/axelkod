// Home-page section HTML (Services, Security layers, Industries), shared by the
// deploy-time bake, Publish and the client fallback, like news-render.ts. Pure and
// import-light so Node can load it. Interactivity (security layers, spotlight,
// reveals) is attached to this markup by the React components after load.
import { iconSvg } from "./home-icons.ts";

export type Lang = "sv" | "en";
export type HomeText = { title: string; text: string };
export type HomeItem = { icon: string; visual: string; sv: HomeText; en: HomeText };
export type HomeHead = { eyebrow: string; title: string; intro: string };
export type HomeSection = { sv: HomeHead; en: HomeHead; items: HomeItem[] };
export type HeroLang = { eyebrow: string; words: string[]; subtitle: string; cta: string; cta2: string };
export type HomeHero = { sv: HeroLang; en: HeroLang; highlight: bigint | number; trust: HomeItem[] };
export type HomeContent = { hero: HomeHero; services: HomeSection; security: HomeSection; industries: HomeSection };
/** Baked regions: the hero text, the trust strip and the three sections. */
export type HomeKey = "hero" | "trust" | "services" | "security" | "industries";

export const HOME_KEYS: HomeKey[] = ["hero", "trust", "services", "security", "industries"];
export const homeRegion = (key: HomeKey, lang: Lang) => `home-${key}-${lang}`;

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (i: number) => String(i + 1).padStart(2, "0");

function head(h: HomeHead, id: string, cls = ""): string {
  return `<div data-reveal class="${cls}"><p class="eyebrow">${esc(h.eyebrow)}</p><h2 id="${id}" class="mt-3 text-5xl uppercase sm:text-6xl">${esc(h.title)}</h2>${
    h.intro ? `<p class="mt-4 text-lg text-muted">${esc(h.intro)}</p>` : ""
  }</div>`;
}

// ── Hero ──────────────────────────────────────────────────────────────────────
const ANCHOR: Record<Lang, { contact: string; services: string }> = {
  sv: { contact: "kontakt", services: "tjanster" },
  en: { contact: "contact", services: "services" },
};
const ARROW = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true" class="h-5 w-5"><path d="M4,12 H19"/><path d="M13.5,6.5 L19,12 L13.5,17.5"/></svg>';

/** Text column of the hero. Pure-CSS entrance (data-step) so the h1, the LCP element, paints at once. */
export function heroHtml(h: HomeHero, lang: Lang): string {
  const l = h[lang];
  const hi = Number(h.highlight);
  const words = l.words
    .map((w, i) => `<span class="hero-word block" data-step="${Math.min(i + 1, 4)}"><span${i === hi ? ' class="text-gradient"' : ""}>${esc(w)}</span>${i < l.words.length - 1 ? " " : ""}</span>`)
    .join("");
  return `<p class="eyebrow hero-in" data-step="0">${esc(l.eyebrow)}</p><h1 id="hero-title" class="mt-5 text-6xl uppercase sm:text-7xl lg:text-8xl">${words}</h1><p class="hero-in mt-6 max-w-xl text-lg text-muted sm:text-xl" data-step="4">${esc(l.subtitle)}</p><div class="hero-in mt-9 flex flex-wrap gap-3" data-step="5"><a href="#${ANCHOR[lang].contact}" class="btn btn-primary">${esc(l.cta)} ${ARROW}</a><a href="#${ANCHOR[lang].services}" class="btn btn-secondary">${esc(l.cta2)}</a></div>`;
}

/** Trust points under the hero; columns follow the count (at most 4 per row). */
export function trustHtml(h: HomeHero, lang: Lang): string {
  const n = h.trust.length;
  const cols = n <= 1 ? "" : n === 2 ? "sm:grid-cols-2" : n % 3 === 0 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";
  const items = h.trust.map((it) => {
    const t = it[lang];
    return `<li data-reveal class="flex items-start gap-3 py-6 lg:px-4"><span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-accent">${iconSvg(it.icon, "h-5 w-5")}</span><span><span class="block font-semibold">${esc(t.title)}</span><span class="block text-sm text-muted">${esc(t.text)}</span></span></li>`;
  });
  return `<ul class="mx-auto grid max-w-7xl gap-px px-5 ${cols}">${items.join("")}</ul>`;
}

// ── Services ──────────────────────────────────────────────────────────────────
const GEAR = `<svg viewBox="0 0 200 200" class="service-gear pointer-events-none absolute -bottom-16 -right-12 h-72 w-72 text-accent opacity-25" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2"><path d="M100 30 l9 0 4 16 a56 56 0 0 1 14 6 l14 -9 12 12 -9 14 a56 56 0 0 1 6 14 l16 4 0 18 -16 4 a56 56 0 0 1 -6 14 l9 14 -12 12 -14 -9 a56 56 0 0 1 -14 6 l-4 16 -18 0 -4 -16 a56 56 0 0 1 -14 -6 l-14 9 -12 -12 9 -14 a56 56 0 0 1 -6 -14 l-16 -4 0 -18 16 -4 a56 56 0 0 1 6 -14 l-9 -14 12 -12 14 9 a56 56 0 0 1 14 -6 l4 -16z"/><path d="M100 76 l21 12 0 24 -21 12 -21 -12 0 -24z"/></g></svg>`;

function codeVisual(): string {
  const lines = ["axelkod.build({", "  secure: true,", "  fast: true,", '  made_in: "SE",', "});"];
  // Literal class names so the CSS build finds them.
  const dots = ["bg-[#ff5f57]/70", "bg-[#febc2e]/70", "bg-[#28c840]/70"].map((c) => `<span class="h-2.5 w-2.5 rounded-full ${c}"></span>`).join("");
  return `<div class="code-window mt-6 rounded-xl border border-border bg-bg/70 p-4 font-mono text-sm" aria-hidden="true"><div class="mb-3 flex gap-1.5">${dots}</div>${lines
    .map((l, i) => `<div class="code-line overflow-hidden whitespace-pre text-muted" data-line="${i}"><span${i === 0 || i === 4 ? ' class="text-accent"' : ""}>${esc(l)}</span></div>`)
    .join("")}</div>`;
}

function shieldVisual(id: string): string {
  const d = "M60 6 C45 16 28 21 10 22 V64 C10 96 31 120 60 134 C89 120 110 96 110 64 V22 C92 21 75 16 60 6Z";
  return `<div class="pointer-events-none absolute -right-6 bottom-0 top-0 hidden w-56 items-center sm:flex" aria-hidden="true"><svg viewBox="0 0 120 140" class="h-48 w-full text-accent"><defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs><path d="${d}" fill="var(--brand-soft)" stroke="currentColor" stroke-width="1.5"/><g clip-path="url(#${id})"><rect class="shield-scan" x="0" y="0" width="120" height="3" fill="var(--glow)" opacity="0.8"/></g><path d="M44 70 l11 11 22 -24" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
}

// The first three cards keep the featured bento slots; the rest are standard cards.
const SLOTS = ["min-h-64 lg:col-span-2", "lg:row-span-2", "min-h-64 lg:col-span-2"];
const TILE = "grid h-12 w-12 place-items-center rounded-2xl border border-border-strong bg-surface-strong text-accent shadow-[0_0_30px_-8px_var(--brand)]";

export function servicesHtml(s: HomeSection, lang: Lang): string {
  const cards = s.items.map((it, i) => {
    const t = it[lang];
    const aside = it.visual === "gear" || it.visual === "shield";
    const visual = it.visual === "gear" ? GEAR : it.visual === "shield" ? shieldVisual(`shield-clip-${lang}-${i}`) : "";
    return `<li data-reveal class="spotlight glass relative overflow-hidden p-7 ${SLOTS[i] ?? ""}">${visual}<span class="${TILE}">${iconSvg(it.icon, "h-6 w-6")}</span><h3 class="mt-6 text-3xl uppercase">${esc(t.title)}</h3><p class="mt-2 text-muted${aside ? " max-w-md" : ""}">${esc(t.text)}</p>${it.visual === "code" ? codeVisual() : ""}</li>`;
  });
  return `${head(s[lang], "services-title", "max-w-2xl")}<ul class="mt-12 grid gap-5 lg:grid-cols-3">${cards.join("")}</ul>`;
}

// ── Security layers ───────────────────────────────────────────────────────────
const LAYER_HINT: Record<Lang, string> = { sv: "Välj ett lager", en: "Choose a layer" };
/** Hexagon of radius r centred in a 400×400 box. */
function hex(r: number): string {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k - Math.PI / 2;
    return `${(200 + r * Math.cos(a)).toFixed(1)},${(200 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

/** Ring radii, innermost first, spread between the logo and the box edge. */
export function ringRadii(n: number): number[] {
  if (n <= 1) return [130];
  const inner = 70, outer = 190;
  return Array.from({ length: n }, (_, i) => Math.round(inner + ((outer - inner) * i) / (n - 1)));
}

/**
 * Layer list, detail text and hexagon rings. Layer 0 starts active; the component
 * switches layers on hover/focus/click of a button ([data-layer]) or a ring.
 */
export function securityHtml(s: HomeSection, lang: Lang): string {
  const buttons = s.items.map((it, i) => {
    const t = it[lang];
    return `<li data-reveal><button type="button" data-layer="${i}" data-text="${esc(t.text)}" aria-pressed="${i === 0}" aria-controls="security-panel" class="layer-btn group flex w-full items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 text-left transition-all aria-pressed:border-accent aria-pressed:bg-surface-strong"><span class="font-mono text-sm text-muted group-aria-pressed:text-accent">${num(i)}</span><span class="font-display text-2xl uppercase">${esc(t.title)}</span><span class="ml-auto h-2 w-2 rounded-full bg-border-strong transition-all group-aria-pressed:bg-[var(--accent)] group-aria-pressed:shadow-[0_0_12px_var(--accent)]" aria-hidden="true"></span></button></li>`;
  });
  const radii = ringRadii(s.items.length);
  // Outermost drawn first so each inner ring sits on top and owns its band for hover.
  const rings = radii
    .map((r, i) => ({ r, i }))
    .reverse()
    .map(({ r, i }) => `<polygon points="${hex(r)}" class="layer-ring" data-layer="${i}"${i === 0 ? ' data-active=""' : ""}></polygon>`)
    .join("");
  const first = s.items[0]?.[lang].text ?? "";
  return `<div class="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2"><div>${head(s[lang], "security-title")}<ul class="mt-10 space-y-3" aria-label="${LAYER_HINT[lang]}">${buttons.join("")}</ul><p id="security-panel" aria-live="polite" class="layer-text mt-6 min-h-14 text-lg">${esc(first)}</p></div><div class="relative mx-auto aspect-square w-full max-w-[30rem]" aria-hidden="true"><svg viewBox="0 0 400 400" class="h-full w-full">${rings}</svg><div data-logo class="pointer-events-none absolute inset-[40%] grid place-items-center"></div></div></div>`;
}

// ── Industries ────────────────────────────────────────────────────────────────
/** Columns that fill evenly for the item count, at most 4 on wide screens. */
export function industryCols(n: number): string {
  if (n <= 1) return "max-w-md";
  if (n === 2) return "sm:grid-cols-2";
  if (n % 4 === 0) return "sm:grid-cols-2 lg:grid-cols-4";
  if (n % 3 === 0) return "sm:grid-cols-2 lg:grid-cols-3";
  return "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
}

export function industriesHtml(s: HomeSection, lang: Lang): string {
  const tiles = s.items.map((it, i) => {
    const t = it[lang];
    return `<li data-reveal class="spotlight gradient-border glass group relative overflow-hidden p-6 transition-transform duration-500 hover:-translate-y-1"><div class="flex items-start justify-between">${iconSvg(it.icon, "h-9 w-9 text-accent transition-transform duration-500 group-hover:scale-110")}<span class="font-mono text-sm text-muted">${num(i)}</span></div><h3 class="mt-10 text-2xl uppercase">${esc(t.title)}</h3><p class="mt-2 text-muted">${esc(t.text)}</p></li>`;
  });
  return `${head(s[lang], "industries-title")}<ul class="mt-12 grid gap-5 ${industryCols(s.items.length)}">${tiles.join("")}</ul>`;
}

/** Inner HTML of a section's region. */
export function homeHtml(c: HomeContent, key: HomeKey, lang: Lang): string {
  if (key === "hero") return heroHtml(c.hero, lang);
  if (key === "trust") return trustHtml(c.hero, lang);
  if (key === "services") return servicesHtml(c.services, lang);
  if (key === "security") return securityHtml(c.security, lang);
  return industriesHtml(c.industries, lang);
}
