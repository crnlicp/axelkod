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
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-5 py-24 text-center">
        <p className="font-display text-7xl font-bold text-brand" aria-hidden="true">404</p>
        <h1 className="text-4xl uppercase">{t.notFound.title}</h1>
        <p className="text-muted">{t.notFound.text}</p>
        <Link to={PATHS.home[lang]} className="btn btn-primary mt-2">{t.notFound.home}</Link>
      </div>
    </PageShell>
  );
}
