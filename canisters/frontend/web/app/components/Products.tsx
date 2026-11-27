import { homeHtml, homeRegion } from "../lib/home-render";
import { loadHome } from "../lib/homeData";
import { dict, type Lang } from "../lib/i18n";
import { enhanceSims } from "../lib/product-sims";
import { Region } from "./Region";

/** "Products": our own products (admin → Home page), baked at deploy/Publish. */
export function Products({ lang }: { lang: Lang }) {
  const t = dict(lang);
  return (
    <section id={t.anchors.products} className="px-5 py-28" aria-labelledby="products-title">
      <Region name={homeRegion("products", lang)} className="mx-auto max-w-7xl"
        load={async () => homeHtml(await loadHome(), "products", lang)} enhance={enhanceSims} />
    </section>
  );
}
