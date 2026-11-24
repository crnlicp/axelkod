import { useLocation } from "react-router";
import { PageShell } from "../components/PageShell";
import { Region } from "../components/Region";
import { dict, langFromPath } from "../lib/i18n";
import { cardsHtml } from "../lib/news-render";
import { loadPublishedNews } from "../lib/newsData";

export default function NewsList() {
  const lang = langFromPath(useLocation().pathname);
  const t = dict(lang);
  return (
    <PageShell lang={lang} page="news">
      <section className="relative overflow-hidden px-5 pb-24 pt-20" aria-labelledby="news-page-title">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-50" aria-hidden="true" />
        <div className="mx-auto max-w-7xl">
          <p className="eyebrow">{t.news.eyebrow}</p>
          <h1 id="news-page-title" className="mt-3 text-6xl uppercase sm:text-7xl">{t.news.pageTitle}</h1>
          <p className="mt-4 text-lg text-muted">{t.news.pageIntro}</p>
          <Region name={`news-list-${lang}`} className="mt-12" load={async () => cardsHtml(await loadPublishedNews(), lang)} />
        </div>
      </section>
    </PageShell>
  );
}
