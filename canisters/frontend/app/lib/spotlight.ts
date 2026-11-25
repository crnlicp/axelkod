import { useEffect, type RefObject } from "react";

/**
 * Cursor-following glow: writes --mx/--my on the element (CSSOM, so the CSP's
 * style-src does not apply) for the .spotlight gradient. Pointer devices only.
 * Pass `mounted` when the element renders conditionally, so the listener attaches
 * once it appears.
 */
export function useSpotlight(ref: RefObject<HTMLElement | null>, mounted = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia("(hover: hover)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    el.addEventListener("pointermove", move, { passive: true });
    return () => el.removeEventListener("pointermove", move);
  }, [ref, mounted]);
}
