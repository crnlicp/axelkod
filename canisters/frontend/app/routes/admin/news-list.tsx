import { useEffect, useState } from "react";
import { Link } from "react-router";
import { NewsStatus, type News } from "../../bindings/backend";
import { useAdminLang } from "../../admin/i18n";
import { errMessage, type BackendErr } from "../../admin/result";
import { useAdmin } from "../../admin/session";
import { Toast } from "../../admin/toast";

const date = (ns: bigint, locale: string) => new Date(Number(ns / 1_000_000n)).toLocaleDateString(locale);

export default function NewsList() {
  const { actor } = useAdmin();
  const { t } = useAdminLang();
  const x = t.news;
  const [items, setItems] = useState<News[] | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const r = await actor.adminListNews();
    if (r.__kind__ === "ok") setItems([...r.ok].sort((a, b) => Number(b.publishedAt - a.publishedAt)));
    else setStatus({ ok: false, text: errMessage(r.err as BackendErr, t) });
  }
  useEffect(() => { void load(); }, [actor]); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(n: News) {
    if (!confirm(x.confirmDelete(n.sv.title))) return;
    const r = await actor.deleteNews(n.id);
    setStatus(r.__kind__ === "ok" ? { ok: true, text: x.deleted } : { ok: false, text: errMessage(r.err as BackendErr, t) });
    await load();
  }

  const now = BigInt(Date.now()) * 1_000_000n;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl uppercase">{x.title}</h1>
        <Link to="/admin/news/new" className="btn btn-primary">{x.new}</Link>
      </div>
      <p className="mt-2 text-muted">{x.publishHint} <Link to="/admin/seo">{x.publishLink}</Link> {x.publishWhere}</p>
      <Toast status={status} />
      {items && items.length === 0 && <p className="card mt-4 text-muted">{x.none}</p>}
      <ul className="mt-4 space-y-2" data-testid="news-list">
        {items?.map((n) => {
          const live = n.status === NewsStatus.published && n.publishedAt <= now;
          const label = n.status === NewsStatus.draft ? x.draft : live ? x.published : x.scheduled;
          return (
            <li key={n.id.toString()} className="card flex flex-wrap items-center justify-between gap-4 !py-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{n.sv.title}</p>
                <p className="text-sm text-muted">
                  {date(n.publishedAt, t.locale)} · {label}{n.area ? ` · ${t.areas[n.area as keyof typeof t.areas]}` : ""} · {n.en ? "sv + en" : x.svOnly}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to={`/admin/news/${n.id}`} className="btn btn-secondary" aria-label={`${t.edit} ${n.sv.title}`}>{t.edit}</Link>
                <button type="button" className="btn btn-secondary text-[var(--error)]" onClick={() => void remove(n)} aria-label={`${t.remove} ${n.sv.title}`}>{t.remove}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
