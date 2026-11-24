import { useLocation } from "react-router";
import { CircuitBackground } from "../components/CircuitBackground";
import { ContactDetails } from "../components/ContactDetails";
import { ContactForm } from "../components/ContactForm";
import {
  IconArrowRight, IconClock, IconCode, IconCompany, IconLock, IconParts, IconPerson, IconShield,
} from "../components/Icons";
import { LogoSymbol } from "../components/Logo";
import { PageShell } from "../components/PageShell";
import { dict, langFromPath } from "../lib/i18n";
import { usePublicConfig } from "../lib/publicConfig";
import { pageMeta } from "../lib/seo";
import type { Route } from "./+types/home";

export const meta: Route.MetaFunction = ({ location }) => pageMeta("home", langFromPath(location.pathname));

const serviceIcons = [IconParts, IconCode, IconShield];
const whyIcons = [IconPerson, IconCompany, IconLock, IconClock];

export default function Home() {
  const lang = langFromPath(useLocation().pathname);
  const t = dict(lang);
  const config = usePublicConfig();

  return (
    <PageShell lang={lang} page="home">
      <section className="relative isolate overflow-hidden border-b border-border" aria-labelledby="hero-title">
        <CircuitBackground className="-z-10" />
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-5 py-20 text-center sm:py-28">
          <LogoSymbol className="h-24 w-auto text-fg sm:h-28" />
          <h1 id="hero-title" className="text-5xl uppercase sm:text-7xl">
            {t.hero.title}
          </h1>
          <p className="max-w-xl text-lg text-muted">{t.hero.subtitle}</p>
          <a href={`#${t.anchors.contact}`} className="btn btn-primary">
            {t.hero.cta} <IconArrowRight className="h-5 w-5" />
          </a>
        </div>
      </section>

      <section id={t.anchors.services} className="scroll-mt-4 px-5 py-16 sm:py-20" aria-labelledby="services-title">
        <div className="mx-auto max-w-6xl">
          <h2 id="services-title" className="text-4xl uppercase">{t.services.title}</h2>
          <ul className="mt-8 grid gap-5 md:grid-cols-3">
            {t.services.items.map((item, i) => {
              const Icon = serviceIcons[i];
              return (
                <li key={item.title} className="card">
                  <Icon className="h-10 w-10 text-brand" />
                  <h3 className="mt-4 text-2xl">{item.title}</h3>
                  <p className="mt-1 text-muted">{item.text}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section id={t.anchors.why} className="scroll-mt-4 border-y border-border bg-surface px-5 py-16 sm:py-20" aria-labelledby="why-title">
        <div className="mx-auto max-w-6xl">
          <h2 id="why-title" className="text-4xl uppercase">{t.why.title}</h2>
          <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {t.why.items.map((item, i) => {
              const Icon = whyIcons[i];
              return (
                <li key={item.title} className="flex gap-4">
                  <Icon className="mt-0.5 h-7 w-7 shrink-0 text-brand" />
                  <div>
                    <h3 className="text-xl">{item.title}</h3>
                    <p className="mt-1 text-muted">{item.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section id={t.anchors.contact} className="scroll-mt-4 px-5 py-16 sm:py-20" aria-labelledby="contact-title">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_20rem]">
          <div>
            <h2 id="contact-title" className="text-4xl uppercase">{t.contact.title}</h2>
            <p className="mt-3 text-lg text-muted">{t.contact.intro}</p>
            <ContactForm lang={lang} responseTime={config ? config.responseTime[lang] : null} />
          </div>
          <ContactDetails lang={lang} config={config} />
        </div>
      </section>
    </PageShell>
  );
}
