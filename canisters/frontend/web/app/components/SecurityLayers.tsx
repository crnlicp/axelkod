import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { homeHtml, homeRegion } from "../lib/home-render";
import { loadHome } from "../lib/homeData";
import { dict, type Lang } from "../lib/i18n";
import { LogoSymbol } from "./Logo";
import { Region, type Enhance } from "./Region";

/**
 * Switches the active layer in the baked markup: buttons and hexagon rings share
 * data-layer indexes, so hovering, focusing or clicking either one highlights both.
 */
function wireLayers(el: HTMLElement): () => void {
  const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button[data-layer]"));
  const rings = Array.from(el.querySelectorAll<SVGPolygonElement>("polygon[data-layer]"));
  const panel = el.querySelector<HTMLElement>("#security-panel");
  let active = 0;
  const activate = (i: number) => {
    if (i === active) return;
    active = i;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.layer) === i)));
    rings.forEach((r) => {
      const j = Number(r.dataset.layer);
      r.toggleAttribute("data-active", j === i);
      r.toggleAttribute("data-inner", j < i);
    });
    if (panel) {
      panel.textContent = buttons.find((b) => Number(b.dataset.layer) === i)?.dataset.text ?? "";
      // Restart the fade-in for the new text.
      panel.classList.remove("layer-text");
      void panel.offsetWidth;
      panel.classList.add("layer-text");
    }
  };
  const on = (e: Event) => activate(Number((e.currentTarget as HTMLElement).dataset.layer));
  const targets: Array<[Element, string]> = [
    ...buttons.flatMap((b) => ["mouseenter", "focus", "click"].map((ev) => [b, ev] as [Element, string])),
    ...rings.map((r) => [r, "mouseenter"] as [Element, string]),
  ];
  targets.forEach(([t, ev]) => t.addEventListener(ev, on));
  return () => targets.forEach(([t, ev]) => t.removeEventListener(ev, on));
}

/** "Security in every layer": editable layers (admin → Home page), baked at deploy/Publish. */
export function SecurityLayers({ lang }: { lang: Lang }) {
  const t = dict(lang);
  // The logo is a React component; it is mounted into the baked hexagon's centre.
  const [logoSlot, setLogoSlot] = useState<HTMLElement | null>(null);
  const enhance = useCallback<Enhance>((el) => {
    setLogoSlot(el.querySelector<HTMLElement>("[data-logo]"));
    const off = wireLayers(el);
    return () => { off(); setLogoSlot(null); };
  }, []);
  return (
    <section id={t.anchors.security} className="relative overflow-hidden px-5 py-28" aria-labelledby="security-title">
      <div className="bg-aurora absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
      <Region name={homeRegion("security", lang)} enhance={enhance}
        load={async () => homeHtml(await loadHome(), "security", lang)} />
      {logoSlot && createPortal(<LogoSymbol className="h-full w-auto text-fg" />, logoSlot)}
    </section>
  );
}
