import { homeHtml, homeRegion } from "../lib/home-render";
import { loadHome } from "../lib/homeData";
import { dict, type Lang } from "../lib/i18n";
import { Region } from "./Region";

/** "Who we help": editable tiles (admin → Home page), baked at deploy/Publish. */
export function Industries({ lang }: { lang: Lang }) {
  const t = dict(lang);
  return (
    <section id={t.anchors.industries} className="px-5 py-28" aria-labelledby="industries-title">
      <Region name={homeRegion("industries", lang)} className="mx-auto max-w-7xl"
        load={async () => homeHtml(await loadHome(), "industries", lang)} />
    </section>
  );
}
