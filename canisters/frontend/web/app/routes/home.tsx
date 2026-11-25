import { useLocation } from "react-router";
import { ContactDetails } from "../components/ContactDetails";
import { ContactForm } from "../components/ContactForm";
import { Hero } from "../components/Hero";
import { Industries } from "../components/Industries";
import { NewsSection } from "../components/NewsSection";
import { PageShell } from "../components/PageShell";
import { Reveal } from "../components/Reveal";
import { SecurityLayers } from "../components/SecurityLayers";
import { Services } from "../components/Services";
import { TrustStrip } from "../components/TrustStrip";
import { dict, langFromPath } from "../lib/i18n";
import { usePublicConfig } from "../lib/publicConfig";

export default function Home() {
  const lang = langFromPath(useLocation().pathname);
  const t = dict(lang);
  const config = usePublicConfig();

  return (
    <PageShell lang={lang} page="home">
      <Hero lang={lang} />
      <TrustStrip lang={lang} />

      <div className="midfield">
        <Services lang={lang} />
        <SecurityLayers lang={lang} />
        <Industries lang={lang} />
        <NewsSection lang={lang} />
      </div>

      <section id={t.anchors.contact} className="relative overflow-hidden px-5 py-28" aria-labelledby="contact-title">
        <div className="bg-aurora absolute inset-0 -z-10 opacity-50" aria-hidden="true" />
        <div className="mx-auto max-w-7xl">
          <Reveal self>
            <p className="eyebrow">{t.nav.contact}</p>
            <h2 id="contact-title" className="mt-3 text-5xl uppercase sm:text-6xl">{t.contact.title}</h2>
            <p className="mt-3 text-lg text-muted">{t.contact.intro}</p>
          </Reveal>
          <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1fr_20rem]">
            <ContactForm lang={lang} responseTime={config ? config.responseTime[lang] : null} />
            <ContactDetails lang={lang} contact={config?.contact ?? null} />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
