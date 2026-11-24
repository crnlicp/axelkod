// Renders a baked HTML region (see lib/news-render.ts). In the browser the baked
// HTML already on the page is reused as-is, so hydration never mismatches; after a
// client-side navigation (nothing baked in the DOM) `load` renders it from the backend.
import { useEffect, useRef, useState } from "react";
import { emptyRegion, region } from "../lib/news-render";
import { useReveal } from "../lib/reveal";

function initial(name: string): string | null {
  if (typeof document === "undefined") return emptyRegion(name);
  const html = document.querySelector(`[data-region="${name}"]`)?.innerHTML ?? null;
  return html && html !== emptyRegion(name) ? html : null;
}

function Inner({ name, html, className }: { name: string; html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref, { stagger: 0.1 });
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia("(hover: hover)").matches) return;
    const cards = Array.from(el.querySelectorAll<HTMLElement>(".spotlight"));
    const move = (e: PointerEvent) => {
      const c = e.currentTarget as HTMLElement;
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", `${e.clientX - r.left}px`);
      c.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    cards.forEach((c) => c.addEventListener("pointermove", move, { passive: true }));
    return () => cards.forEach((c) => c.removeEventListener("pointermove", move));
  }, [html]);
  return <div ref={ref} data-region={name} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Region({ name, load, className }: { name: string; load: () => Promise<string>; className?: string }) {
  const [html, setHtml] = useState<string | null>(() => initial(name));
  useEffect(() => {
    if (html !== null) return;
    let live = true;
    load()
      .then((inner) => live && setHtml(region(name, inner)))
      .catch((e: unknown) => console.warn(`region ${name}`, e));
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const content = html ?? emptyRegion(name);
  return <Inner key={content.length} name={name} html={content} className={className} />;
}
