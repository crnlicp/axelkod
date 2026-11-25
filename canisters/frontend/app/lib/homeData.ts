// Client-side home content (fallback when the sections weren't baked into the page,
// e.g. after a client-side navigation to the home page).
import type { HomeContent } from "./home-render";

let home: Promise<HomeContent> | null = null;

export function loadHome(): Promise<HomeContent> {
  home ??= import("./backend").then(({ backend }) => backend().getHome() as Promise<HomeContent>);
  return home;
}
