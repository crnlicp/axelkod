// Scroll reveals with motion/mini (Web Animations API), loaded after first paint.
// Start states are CSS ([data-reveal] under html.anim), so nothing is rendered as
// an inline style attribute (blocked by the CSP) and no JS runs before hydration.
import { useEffect, type RefObject } from "react";

type Animate = typeof import("motion/mini").animate;
let motion: Promise<Animate> | null = null;

// motion/mini: Motion's small Web Animations API animate(); viewport detection is
// a plain IntersectionObserver.
function loadMotion(): Promise<Animate> {
  motion ??= import("motion/mini").then((m) => {
    document.documentElement.classList.add("anim-ready");
    return m.animate;
  });
  return motion;
}

export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Reveals `ref` (if it has data-reveal) or its [data-reveal] descendants when it
 * scrolls into view, staggered. No-op when reduced motion is on (no html.anim).
 */
export function useReveal(ref: RefObject<HTMLElement | null>, opts: { stagger?: number; delay?: number } = {}) {
  const { stagger: step = 0.08, delay = 0 } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el || !document.documentElement.classList.contains("anim")) return;
    let cancelled = false;
    let io: IntersectionObserver | undefined;
    void loadMotion().then((animate) => {
      if (cancelled) return;
      const targets = el.hasAttribute("data-reveal") ? [el] : Array.from(el.querySelectorAll<HTMLElement>("[data-reveal]"));
      if (targets.length === 0) return;
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          io?.disconnect();
          targets.forEach((target, i) => {
            // data-revealed lets CSS start effects inside (e.g. the typing code window).
            target.setAttribute("data-revealed", "");
            animate(
              target,
              { opacity: [0, 1], transform: ["translateY(24px)", "translateY(0px)"] },
              { duration: 0.8, ease: EASE_OUT_EXPO, delay: delay + i * step },
            );
          });
        },
        { rootMargin: "0px 0px -12% 0px" },
      );
      io.observe(el);
    });
    return () => {
      cancelled = true;
      io?.disconnect();
    };
  }, [ref, step, delay]);
}
