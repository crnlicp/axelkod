// Webbplats › Översikt: the landing page of the website admin. Unread messages, the newest
// messages, news status and shortcuts to the other pages.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { NewsStatus, Status, type Message, type News } from "../../bindings/site";
import { IconArrowRight, IconCompany, IconHome, IconMail, IconNews, IconSearch, IconSliders } from "../../components/Icons";
import { useAdminLang } from "../../admin/i18n";
import { useAdmin } from "../../admin/session";

export default function SiteOverview() {
  const { actor, setUnread } = useAdmin();
  const { t, lang } = useAdminLang();
  const x = t.overview;
  const [msg, setMsg] = useState<{ total: bigint; unread: bigint; items: Message[] } | null>(null);
  const [news, setNews] = useState<News[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [m, n] = await Promise.all([actor.listMessages({}, { offset: 0n, limit: 5n }), actor.adminListNews()]);
      if (m.__kind__ === "err") throw new Error(m.err.__kind__);
      if (n.__kind__ === "err") throw new Error(n.err.__kind__);
      if (!live) return;
      setMsg(m.ok);
      setUnread(Number(m.ok.unread));
      setNews(n.ok);
    })().catch((e) => live && setError(x.loadFailed(e instanceof Error ? e.message : String(e))));
    return () => { live = false; };
  }, [actor, setUnread, x]);

  const published = (news ?? []).filter((n) => n.status === NewsStatus.published).sort((a, b) => Number(b.publishedAt - a.publishedAt));
  const drafts = (news ?? []).filter((n) => n.status === NewsStatus.draft).length;
  const date = (ns: bigint) => new Date(Number(ns / 1_000_000n)).toLocaleDateString(t.locale);
  const tiles: [string, string | number | null, string][] = [
    [x.unread, msg ? Number(msg.unread) : null, "/admin/inbox"],
    [x.total, msg ? Number(msg.total) : null, "/admin/inbox"],
    [x.published, news ? published.length : null, "/admin/news"],
    [x.drafts, news ? drafts : null, "/admin/news"],
  ];
  const shortcuts = [
    { to: "/admin/home", label: t.nav.home, icon: IconHome }, { to: "/admin/news", label: t.nav.news, icon: IconNews },
    { to: "/admin/contact", label: t.nav.contact, icon: IconCompany }, { to: "/admin/seo", label: t.nav.seo, icon: IconSearch },
    { to: "/admin/settings", label: t.nav.settings, icon: IconSliders },
  ];

  return (
    <>
      <h1 className="mb-6 text-4xl uppercase">{x.title}</h1>
      {error && <p role="alert" className="mb-4 text-[var(--error)]">{error}</p>}
      <ul className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value, to]) => (
          <li key={label}>
            <Link to={to} className="card block no-underline hover:border-accent">
              <p className="text-sm text-muted">{label}</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-fg">{value ?? "–"}</p>
            </Link>
          </li>
        ))}
      </ul>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card" aria-labelledby="ov-latest">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="ov-latest" className="text-xl">{x.latest}</h2>
            <Link to="/admin/inbox" className="inline-flex items-center gap-1 text-sm">{x.openInbox} <IconArrowRight className="h-4 w-4" /></Link>
          </div>
          {!msg ? <p role="status">{t.loading}</p> : msg.items.length === 0 ? <p className="text-muted">{x.noMessages}</p> : (
            <ul className="divide-y divide-border">
              {msg.items.map((m) => (
                <li key={String(m.id)} className="flex items-start gap-3 py-3">
                  <IconMail className={`mt-0.5 h-5 w-5 shrink-0 ${m.status === Status.new ? "text-accent" : "text-muted"}`} />
                  <div className="min-w-0 flex-1">
                    <p className={m.status === Status.new ? "font-semibold" : ""}>{m.name}{m.company ? ` · ${m.company}` : ""}</p>
                    <p className="truncate text-sm text-muted">{m.message}</p>
                  </div>
                  <span className="shrink-0 text-sm text-muted">{date(m.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="space-y-6">
          <section className="card" aria-labelledby="ov-news">
            <h2 id="ov-news" className="mb-3 text-xl">{x.news}</h2>
            {!news ? <p role="status">{t.loading}</p> : published[0] ? (
              <p><span className="text-sm text-muted">{x.lastNews}: </span>
                <Link to={`/admin/news/${published[0].id}`}>{(lang === "en" ? published[0].en?.title : undefined) ?? published[0].sv.title}</Link>
                <span className="text-sm text-muted"> ({date(published[0].publishedAt)})</span></p>
            ) : <p className="text-muted">{x.noNews}</p>}
          </section>
          <nav className="card" aria-labelledby="ov-short">
            <h2 id="ov-short" className="mb-3 text-xl">{x.shortcuts}</h2>
            <ul className="space-y-1">
              {shortcuts.map(({ to, label, icon: Icon }) => (
                <li key={to}><Link to={to} className="flex items-center gap-3 rounded-lg px-2 py-2 text-fg no-underline hover:bg-surface-strong"><Icon className="h-5 w-5 text-muted" />{label}</Link></li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
}
