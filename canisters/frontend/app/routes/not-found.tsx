import { Link, useLocation } from "react-router";
import { PageShell } from "../components/PageShell";
import { dict, langFromPath, PATHS } from "../lib/i18n";

// Prerendered as /404.html, which the canister serves for every unknown path.
export function meta() {
  return [{ title: "404 – Axelkod AB" }, { name: "robots", content: "noindex" }];
}

export default function NotFound() {
  const lang = langFromPath(useLocation().pathname);
  const t = dict(lang);
  return (
    <PageShell lang={lang} page={null}>
      <div className="relative isolate overflow-hidden">
      <div className="bg-aurora absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-5 py-24 text-center">
        <div className="relative grid aspect-square w-64 place-items-center" aria-hidden="true">
          <svg viewBox="0 0 200 200" className="hex-ring absolute inset-0 h-full w-full">
            <path d="M100 8 L180 54 L180 146 L100 192 L20 146 L20 54 Z" fill="none" stroke="var(--brand)" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="30 12 4 12" />
          </svg>
          <p className="text-gradient font-display text-8xl font-bold">404</p>
        </div>
        <h1 className="text-4xl uppercase">{t.notFound.title}</h1>
        <p className="text-muted">{t.notFound.text}</p>
        <Link to={PATHS.home[lang]} className="btn btn-primary mt-2">{t.notFound.home}</Link>
      </div>
      </div>
    </PageShell>
  );
}
