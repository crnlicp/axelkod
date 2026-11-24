import type { ReactNode } from "react";
import { dict, type Lang, type Page } from "../lib/i18n";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function PageShell({ lang, page, children }: { lang: Lang; page: Page | null; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-10 focus:rounded focus:bg-bg focus:px-4 focus:py-2">
        {dict(lang).skipLink}
      </a>
      <SiteHeader lang={lang} page={page} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter lang={lang} page={page} />
    </div>
  );
}
