import { useLocation } from "react-router";
import { ContactDetails } from "../components/ContactDetails";
import { ContactForm } from "../components/ContactForm";
import { Hero } from "../components/Hero";
import { IconCode, IconParts, IconShield } from "../components/Icons";
import { PageShell } from "../components/PageShell";
import { Reveal } from "../components/Reveal";
import { TrustStrip } from "../components/TrustStrip";
import { dict, langFromPath } from "../lib/i18n";
import { usePublicConfig } from "../lib/publicConfig";

const serviceIcons = [IconParts, IconCode, IconShield];

export default function Home() {
  const lang = langFromPath(useLocation().pathname);
  const t = dict(lang);
  const config = usePublicConfig();

  return (
    <PageShell lang={lang} page="home">
      <Hero lang={lang} />
      <TrustStrip lang={lang} />

      {/* Services: redesigned as a bento grid in R3. */}
      <section id={t.anchors.services} className="px-5 py-24" aria-labelledby="services-title">
        <div className="mx-auto max-w-7xl">
          <Reveal self>
            <p className="eyebrow">{t.nav.services}</p>
            <h2 id="services-title" className="mt-3 text-5xl uppercase">{t.services.title}</h2>
          </Reveal>
          <Reveal as="ul" className="mt-10 grid gap-5 md:grid-cols-3">
            {t.services.items.map((item, i) => {
              const Icon = serviceIcons[i];
              return (
                <li key={item.title} data-reveal className="card">
                  <Icon className="h-10 w-10 text-accent" />
                  <h3 className="mt-4 text-2xl">{item.title}</h3>
                  <p className="mt-1 text-muted">{item.text}</p>
                </li>
              );
            })}
          </Reveal>
        </div>
      </section>

      <section id={t.anchors.contact} className="px-5 py-24" aria-labelledby="contact-title">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_20rem]">
          <Reveal self>
            <p className="eyebrow">{t.nav.contact}</p>
            <h2 id="contact-title" className="mt-3 text-5xl uppercase">{t.contact.title}</h2>
            <p className="mt-3 text-lg text-muted">{t.contact.intro}</p>
            <ContactForm lang={lang} responseTime={config ? config.responseTime[lang] : null} />
          </Reveal>
          <ContactDetails lang={lang} contact={config?.contact ?? null} />
        </div>
      </section>
    </PageShell>
  );
}
