// "Decrypt" effect for one headline word: characters cycle through cipher glyphs
// and resolve left to right. The baked text paints first (no LCP cost); only then
// does the effect run, swapping the word's text in place. The word is a block on
// its own line and kept on one line, so the layout never moves.
const GLYPHS = "ABCDEF0123456789#$%&*+<>/=_[]{}";
const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

/** Scrambles `el`'s text once; returns a cancel function that restores it. */
export function decrypt(el: HTMLElement, { delay = 0, stagger = 0.06 } = {}): () => void {
  const text = el.dataset.cipherText ?? (el.dataset.cipherText = el.textContent ?? "");
  const chars = [...text];
  const start = performance.now() + delay * 1000;
  let raf = 0;
  let last = 0;
  const finish = () => {
    cancelAnimationFrame(raf);
    el.textContent = text;
    el.style.whiteSpace = "";
  };
  el.style.whiteSpace = "nowrap";
  const frame = (now: number) => {
    if (now - last > 45) {
      last = now;
      let done = true;
      el.textContent = chars
        .map((c, i) => {
          if (c === " ") return c;
          const at = start + i * stagger * 1000;
          if (now >= at + 260) return c;
          done = false;
          return glyph();
        })
        .join("");
      if (done) return finish();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return finish;
}

/** Wires the effect onto each `[data-cipher]` word inside `root`: once after the hero entrance, again on hover. */
export function enhanceCipher(root: HTMLElement): (() => void) | undefined {
  const words = Array.from(root.querySelectorAll<HTMLElement>("[data-cipher]"));
  if (!words.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // Screen readers keep the real words while the glyphs play.
  const h1 = words[0].closest("h1");
  if (h1 && !h1.hasAttribute("aria-label")) h1.setAttribute("aria-label", h1.textContent?.replace(/\s+/g, " ").trim() ?? "");
  const cleanups = words.map((el, i) => {
    let cancel = decrypt(el, { delay: 0.9 + i * 0.25 });
    const replay = () => {
      cancel();
      cancel = decrypt(el);
    };
    el.addEventListener("pointerenter", replay);
    return () => {
      el.removeEventListener("pointerenter", replay);
      cancel();
    };
  });
  return () => cleanups.forEach((c) => c());
}
