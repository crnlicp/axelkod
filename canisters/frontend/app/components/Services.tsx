import { homeHtml, homeRegion } from "../lib/home-render";
import { loadHome } from "../lib/homeData";
import { dict, type Lang } from "../lib/i18n";
import { Region } from "./Region";

/** "What we do": editable cards (admin → Home page), baked at deploy/Publish. */
export function Services({ lang }: { lang: Lang }) {
  const t = dict(lang);
  return (
    <section id={t.anchors.services} className="relative px-5 py-28" aria-labelledby="services-title">
      <Region name={homeRegion("services", lang)} className="mx-auto max-w-7xl"
        load={async () => homeHtml(await loadHome(), "services", lang)} />
    </section>
  );
}
