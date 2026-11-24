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

      <Services lang={lang} />
      <SecurityLayers lang={lang} />
      <Industries lang={lang} />
      <NewsSection lang={lang} />

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
