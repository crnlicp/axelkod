import { homeHtml, homeRegion } from "../lib/home-render";
import { loadHome } from "../lib/homeData";
import type { Lang } from "../lib/i18n";
import { Region } from "./Region";

/** Trust points as a slim band under the hero (admin → Home page → Hero), baked at deploy/Publish. */
export function TrustStrip({ lang }: { lang: Lang }) {
  return (
    <section className="relative border-y border-border bg-bg-elev/60" aria-label={lang === "sv" ? "Därför Axelkod" : "Why Axelkod"}>
      <Region name={homeRegion("trust", lang)} load={async () => homeHtml(await loadHome(), "trust", lang)} />
    </section>
  );
}
