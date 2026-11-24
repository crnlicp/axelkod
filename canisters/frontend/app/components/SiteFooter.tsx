import { Link } from "react-router";
import { dict, otherLang, PATHS, type Lang, type Page } from "../lib/i18n";
import { usePublicConfig } from "../lib/publicConfig";

// Org. nr, email and phone come from the backend and are shown only when set.
export function SiteFooter({ lang, page }: { lang: Lang; page: Page | null }) {
  const t = dict(lang);
  const other = otherLang(lang);
  const c = usePublicConfig()?.contact;
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p>
            <span className="font-semibold text-fg">{t.footer.company}</span> · {c?.city ?? t.footer.city}
            {c?.orgNumber && <> · {t.footer.orgNumber} {c.orgNumber}</>}
          </p>
          {(c?.email || c?.phone) && (
            <p className="mt-1">
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              {c.email && c.phone && " · "}
              {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a>}
            </p>
          )}
        </div>
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
