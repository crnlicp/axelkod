import { useLocation } from "react-router";
import { PageShell } from "../components/PageShell";
import { DEFAULT_RETENTION_MONTHS, dict, fmt, langFromPath } from "../lib/i18n";
import { usePublicConfig } from "../lib/publicConfig";
import { pageMeta } from "../lib/seo";
import type { Route } from "./+types/privacy";

export const meta: Route.MetaFunction = ({ location }) => pageMeta("privacy", langFromPath(location.pathname));

const UPDATED = "2026-11-24";

export default function Privacy() {
  const lang = langFromPath(useLocation().pathname);
  const t = dict(lang);
  // Prerendered with the default; replaced by the admin setting once loaded.
  const months = Number(usePublicConfig()?.retentionMonths ?? DEFAULT_RETENTION_MONTHS);

  return (
    <PageShell lang={lang} page="privacy">
      <article className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-5xl uppercase">{t.privacy.title}</h1>
        <p className="mt-2 text-sm text-muted">{fmt(t.privacy.updated, { date: UPDATED })}</p>
        {t.privacy.sections.map((s) => (
          <section key={s.title} className="mt-8">
            <h2 className="text-2xl">{s.title}</h2>
            <p className="mt-2 leading-relaxed">{fmt(s.text, { months })}</p>
          </section>
        ))}
      </article>
    </PageShell>
  );
}
