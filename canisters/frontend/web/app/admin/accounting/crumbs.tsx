// Breadcrumb trail set by each Ekonomi page.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Crumb = { label: string; to?: string };
const Ctx = createContext<(c: Crumb[]) => void>(() => {});
const Read = createContext<Crumb[]>([]);

export function CrumbProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  return <Ctx.Provider value={setCrumbs}><Read.Provider value={crumbs}>{children}</Read.Provider></Ctx.Provider>;
}

export const useCrumbList = () => useContext(Read);

/** Sets the trail below "Ekonomi" while the page is shown; also sets the document title. */
export function useCrumbs(crumbs: Crumb[]) {
  const set = useContext(Ctx);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    set(crumbs);
    const last = crumbs.at(-1)?.label;
    if (last) document.title = `${last} – Ekonomi – Axelkod`;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
