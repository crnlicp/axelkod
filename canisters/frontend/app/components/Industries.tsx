import { useRef } from "react";
import { dict, type Lang } from "../lib/i18n";
import { useSpotlight } from "../lib/spotlight";
import { IconFactory, IconStore, IconTruck, IconWrench } from "./Icons";
import { Reveal } from "./Reveal";

const icons = [IconTruck, IconWrench, IconStore, IconFactory];

function Tile({ index, title, text }: { index: number; title: string; text: string }) {
  const ref = useRef<HTMLLIElement>(null);
  useSpotlight(ref);
  const Icon = icons[index];
  return (
    <li ref={ref} data-reveal className="spotlight gradient-border glass group relative overflow-hidden p-6 transition-transform duration-500 hover:-translate-y-1">
      <div className="flex items-start justify-between">
        <Icon className="h-9 w-9 text-accent transition-transform duration-500 group-hover:scale-110" />
        <span className="font-mono text-sm text-muted">0{index + 1}</span>
      </div>
      <h3 className="mt-10 text-2xl uppercase">{title}</h3>
      <p className="mt-2 text-muted">{text}</p>
    </li>
  );
}

export function Industries({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const s = t.industries;
  return (
    <section id={t.anchors.industries} className="px-5 py-28" aria-labelledby="industries-title">
      <div className="mx-auto max-w-7xl">
        <Reveal self>
          <p className="eyebrow">{s.eyebrow}</p>
          <h2 id="industries-title" className="mt-3 text-5xl uppercase sm:text-6xl">{s.title}</h2>
        </Reveal>
        <Reveal as="ul" className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" stagger={0.1}>
          {s.items.map((item, i) => (
            <Tile key={item.title} index={i} title={item.title} text={item.text} />
          ))}
        </Reveal>
      </div>
    </section>
  );
}
