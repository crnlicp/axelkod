// Background simulations for product cards. The admin picks one per product by id
// (the backend accepts exactly these ids: Home.productBackgrounds in the site
// canister). Each one is code-split and mounts into the card's [data-sim] layer.
// Adding one: a module exporting `mount`, plus an entry here and in the backend list.
import type { Lang } from "../home-render";

export type SimMount = (el: HTMLElement, lang: Lang) => () => void;

export const PRODUCT_SIMS: { id: string; label: Record<Lang, string>; load: () => Promise<{ mount: SimMount }> }[] = [
  { id: "prova-cra", label: { sv: "Prova CRA: bevisregister", en: "Prova CRA: evidence ledger" }, load: () => import("./prova-cra") },
  { id: "network", label: { sv: "Nätverk (kretsar)", en: "Network (circuits)" }, load: () => import("./network") },
];

/** Mounts the simulations of every [data-sim] layer inside `root`; returns one cleanup. */
export function enhanceSims(root: HTMLElement): () => void {
  const cleanups: (() => void)[] = [];
  let live = true;
  for (const el of root.querySelectorAll<HTMLElement>("[data-sim]")) {
    const sim = PRODUCT_SIMS.find((s) => s.id === el.dataset.sim);
    if (!sim) continue;
    const lang = (el.dataset.lang === "en" ? "en" : "sv") as Lang;
    sim.load()
      .then(({ mount }) => { if (live) cleanups.push(mount(el, lang)); })
      .catch((e: unknown) => console.warn(`[sim ${sim.id}]`, e));
  }
  return () => {
    live = false;
    cleanups.forEach((c) => c());
  };
}
