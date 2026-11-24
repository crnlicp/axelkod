import { Link } from "react-router";
import { dict, otherLang, PATHS, type Lang, type Page } from "../lib/i18n";

// Org. nr, email and phone are added in Phase 4, loaded from the backend.
export function SiteFooter({ lang, page }: { lang: Lang; page: Page | null }) {
  const t = dict(lang);
  const other = otherLang(lang);
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-semibold text-fg">{t.footer.company}</span> · {t.footer.city}
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          <li>
            <Link to={PATHS.privacy[lang]}>{t.footer.privacy}</Link>
          </li>
          <li>
            <Link to={PATHS[page ?? "home"][other]} hrefLang={other} lang={other}>
              {t.langSwitch.label}
            </Link>
          </li>
        </ul>
        <p>
          © {new Date().getFullYear()} {t.footer.company}. {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
