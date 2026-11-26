import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from "react-router";
import { SeoHead } from "./components/SeoHead";
import { langFromPath } from "./lib/i18n";
import { HEAD_SCRIPT } from "./lib/theme";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const lang = langFromPath(useLocation().pathname);
  return (
    // The head script sets data-theme / classes on <html> before hydration.
    <html lang={lang} translate="no" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* The texts are written in Swedish and English already; browser translation breaks React updates. */}
        <meta name="google" content="notranslate" />
        <meta name="theme-color" content="#020d18" />
        <script dangerouslySetInnerHTML={{ __html: HEAD_SCRIPT }} />
        <SeoHead />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // sv and en pages share route modules; remount on a language switch so scroll
  // reveals run again for the new content instead of leaving it hidden.
  return <Outlet key={langFromPath(useLocation().pathname)} />;
}

// Rendered into admin.html (the SPA fallback) until the client takes over.
export function HydrateFallback() {
  return <p className="p-8" role="status">Laddar…</p>;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "Error";
  return (
    <main className="mx-auto max-w-2xl px-5 py-24 text-center">
      <h1 className="text-4xl uppercase">{message}</h1>
    </main>
  );
}
