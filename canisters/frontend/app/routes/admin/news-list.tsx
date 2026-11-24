import { useEffect, useState } from "react";
import { Link } from "react-router";
import { NewsStatus, type News } from "../../bindings/backend";
import { AREA_LABEL } from "../../admin/news";
import { errMessage, type BackendErr } from "../../admin/result";
import { useAdmin } from "../../admin/session";

const date = (ns: bigint) => new Date(Number(ns / 1_000_000n)).toLocaleDateString("sv-SE");

export default function NewsList() {
  const { actor } = useAdmin();
  const [items, setItems] = useState<News[] | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const r = await actor.adminListNews();
    if (r.__kind__ === "ok") setItems([...r.ok].sort((a, b) => Number(b.publishedAt - a.publishedAt)));
    else setStatus({ ok: false, text: errMessage(r.err as BackendErr) });
  }
  useEffect(() => { void load(); }, [actor]); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(n: News) {
    if (!confirm(`Radera "${n.sv.title}"? Det går inte att ångra.`)) return;
    const r = await actor.deleteNews(n.id);
    setStatus(r.__kind__ === "ok" ? { ok: true, text: "Nyheten är raderad. Publicera för att uppdatera webbplatsen." } : { ok: false, text: errMessage(r.err as BackendErr) });
    await load();
  }

  const now = BigInt(Date.now()) * 1_000_000n;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl uppercase">Nyheter</h1>
        <Link to="/admin/news/new" className="btn btn-primary">Ny nyhet</Link>
      </div>
      <p className="mt-2 text-muted">Ändringar syns på webbplatsen efter <Link to="/admin/seo">Publicera</Link> (SEO-sidan).</p>
      <p role="status" aria-live="polite" className={`mt-3 min-h-6 ${status && !status.ok ? "text-[var(--error)]" : ""}`}>{status?.text}</p>
      {items && items.length === 0 && <p className="card mt-4 text-muted">Inga nyheter ännu.</p>}
      <ul className="mt-4 space-y-2" data-testid="news-list">
        {items?.map((n) => {
          const live = n.status === NewsStatus.published && n.publishedAt <= now;
          const label = n.status === NewsStatus.draft ? "Utkast" : live ? "Publicerad" : "Schemalagd";
          return (
            <li key={n.id.toString()} className="card flex flex-wrap items-center justify-between gap-4 !py-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{n.sv.title}</p>
                <p className="text-sm text-muted">
                  {date(n.publishedAt)} · {label}{n.area ? ` · ${AREA_LABEL[n.area]}` : ""} · {n.en ? "sv + en" : "endast sv"}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to={`/admin/news/${n.id}`} className="btn btn-secondary" aria-label={`Redigera ${n.sv.title}`}>Redigera</Link>
                <button type="button" className="btn btn-secondary text-[var(--error)]" onClick={() => void remove(n)} aria-label={`Radera ${n.sv.title}`}>Radera</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
