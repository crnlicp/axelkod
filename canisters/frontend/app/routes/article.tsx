import { useLocation } from "react-router";
import { PageShell } from "../components/PageShell";
import { Region } from "../components/Region";
import { langFromPath } from "../lib/i18n";
import { articleHtml, goneHtml } from "../lib/news-render";
import { loadPublishedNews } from "../lib/newsData";

// Article pages are copies of a prerendered template with the article baked in
// (deploy and Publish). The loader fallback only matters in local development.
export default function Article() {
  const { pathname } = useLocation();
  const lang = langFromPath(pathname);
  const slug = pathname.replace(/\/+$/, "").split("/").pop() ?? "";
  return (
    <PageShell lang={lang} page="article">
      <Region name="article" load={async () => {
        const n = (await loadPublishedNews()).find((x) => x.slug === slug);
        // Unknown address: the canister served 404.html, but this route matched.
        return n && (lang === "sv" || n.en) ? articleHtml(n, lang) : goneHtml(lang);
      }} />
    </PageShell>
  );
}
