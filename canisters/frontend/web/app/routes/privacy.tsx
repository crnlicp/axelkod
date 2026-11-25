import { useLocation } from "react-router";
import { PageShell } from "../components/PageShell";
import { DEFAULT_RETENTION_MONTHS, dict, fmt, langFromPath } from "../lib/i18n";
import { usePublicConfig } from "../lib/publicConfig";

const UPDATED = "2026-11-24";

export default function Privacy() {
  const lang = langFromPath(useLocation().pathname);
  const t = dict(lang);
  // Prerendered with the default; replaced by the admin setting once loaded.
  const months = Number(usePublicConfig()?.retentionMonths ?? DEFAULT_RETENTION_MONTHS);

  return (
    <PageShell lang={lang} page="privacy">
      <article>
        <header className="relative overflow-hidden border-b border-border px-5 pb-14 pt-20">
          <div className="bg-aurora absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
          <div className="bg-grid absolute inset-0 -z-10 opacity-40" aria-hidden="true" />
          <div className="mx-auto max-w-3xl">
            <p className="eyebrow">Axelkod AB</p>
            <h1 className="mt-3 text-5xl uppercase sm:text-6xl">{t.privacy.title}</h1>
            <p className="mt-3 text-sm text-muted">{fmt(t.privacy.updated, { date: UPDATED })}</p>
          </div>
        </header>
        <div className="mx-auto max-w-3xl px-5 py-14">
          <ol className="glass divide-y divide-[var(--border)]">
            {t.privacy.sections.map((s, i) => (
              <li key={s.title} className="flex gap-5 p-6 sm:p-8">
                <span className="font-mono text-sm text-accent">0{i + 1}</span>
                <section>
                  <h2 className="text-2xl uppercase">{s.title}</h2>
                  <p className="mt-2 leading-relaxed text-muted">{fmt(s.text, { months })}</p>
                </section>
              </li>
            ))}
          </ol>
        </div>
      </article>
    </PageShell>
  );
}
