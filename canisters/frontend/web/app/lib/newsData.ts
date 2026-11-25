// Client-side news loading (fallback when a region wasn't baked into the page).
import { fromBackend, type NewsJson } from "./news-render";

let all: Promise<NewsJson[]> | null = null;

export function loadPublishedNews(): Promise<NewsJson[]> {
  all ??= import("./backend").then(({ backend }) => backend().publishedNews()).then((list) => list.map(fromBackend));
  return all;
}
