import { dict, PATHS, type Lang } from "../lib/i18n";
import { cardsHtml } from "../lib/news-render";
import { loadPublishedNews } from "../lib/newsData";
import { IconArrowRight } from "./Icons";
import { Region } from "./Region";
import { Reveal } from "./Reveal";

/** The three latest articles on the landing page (baked at deploy/Publish). */
export function NewsSection({ lang }: { lang: Lang }) {
  const t = dict(lang);
  return (
    <section id={t.anchors.news} className="px-5 py-28" aria-labelledby="news-title">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Reveal self>
            <p className="eyebrow">{t.news.eyebrow}</p>
            <h2 id="news-title" className="mt-3 text-5xl uppercase sm:text-6xl">{t.news.title}</h2>
          </Reveal>
          {/* Full page load: news pages are baked files, not client routes. */}
          <a href={PATHS.news[lang]} className="btn btn-secondary">
            {t.news.all} <IconArrowRight className="h-5 w-5" />
          </a>
        </div>
        <Region name={`news-cards-${lang}`} className="mt-12" load={async () => cardsHtml(await loadPublishedNews(), lang, 3)} />
      </div>
    </section>
  );
}
