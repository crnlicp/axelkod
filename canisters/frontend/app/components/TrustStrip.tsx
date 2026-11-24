import { dict, type Lang } from "../lib/i18n";
import { IconClock, IconCompany, IconLock, IconPerson } from "./Icons";
import { Reveal } from "./Reveal";

const icons = [IconPerson, IconCompany, IconLock, IconClock];

/** The four trust points as a slim band under the hero. */
export function TrustStrip({ lang }: { lang: Lang }) {
  const items = dict(lang).trust;
  return (
    <section className="relative border-y border-border bg-bg-elev/60" aria-label={lang === "sv" ? "Därför Axelkod" : "Why Axelkod"}>
      <Reveal as="ul" className="mx-auto grid max-w-7xl gap-px px-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, i) => {
          const Icon = icons[i];
          return (
            <li key={item.title} data-reveal className="flex items-start gap-3 py-6 lg:px-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-accent">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold">{item.title}</span>
                <span className="block text-sm text-muted">{item.text}</span>
              </span>
            </li>
          );
        })}
      </Reveal>
    </section>
  );
}
