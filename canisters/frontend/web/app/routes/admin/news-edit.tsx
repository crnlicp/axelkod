import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { NewsArea, NewsStatus, type NewsInput, type NewsLang } from "../../bindings/site";
import { useAdminLang } from "../../admin/i18n";
import { fromLocalInput, isCoverUrl, slugify, toLocalInput } from "../../admin/news";
import { uploadImage } from "../../admin/publish";
import { errMessage, type BackendErr } from "../../admin/result";
import { useAdmin } from "../../admin/session";
import { Toast } from "../../admin/toast";
import { Markdown } from "../../components/Markdown";

type Lang = "sv" | "en";
const emptyLang: NewsLang = { title: "", excerpt: "", body: "", coverAlt: "" };
const input = "mt-1 w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2";

export default function NewsEdit() {
  const { id } = useParams();
  const isNew = id === "new";
  const { actor, identity } = useAdmin();
  const { t } = useAdminLang();
  const x = t.news;
  const navigate = useNavigate();
  const [form, setForm] = useState<NewsInput | null>(null);
  const [hasEn, setHasEn] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [tab, setTab] = useState<Lang>("sv");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNew) {
      setForm({ slug: "", status: NewsStatus.draft, publishedAt: BigInt(Date.now()) * 1_000_000n, sv: emptyLang });
      return;
    }
    void actor.adminListNews().then((r) => {
      if (r.__kind__ === "err") return setStatus({ ok: false, text: errMessage(r.err as BackendErr, t) });
      const n = r.ok.find((x) => x.id.toString() === id);
      if (!n) return setStatus({ ok: false, text: x.notFound });
      setForm({ slug: n.slug, status: n.status, publishedAt: n.publishedAt, area: n.area, coverUrl: n.coverUrl, sv: n.sv, en: n.en });
      setHasEn(!!n.en);
    });
  }, [actor, id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return <p role="status">{status?.text ?? t.loading}</p>;
  const lang: NewsLang = tab === "sv" ? form.sv : form.en ?? emptyLang;

  const setLang = (patch: Partial<NewsLang>) => {
    const next = { ...lang, ...patch };
    const f = tab === "sv" ? { ...form, sv: next } : { ...form, en: next };
    if (tab === "sv" && patch.title !== undefined && !slugTouched) f.slug = slugify(patch.title);
    setForm(f);
    setStatus(null);
  };

  async function upload(file: File) {
    setBusy(true);
    try {
      const path = await uploadImage(identity, file, "news", t);
      setForm({ ...form!, coverUrl: path });
      setStatus({ ok: true, text: t.uploaded });
    } catch (e) {
      setStatus({ ok: false, text: t.uploadFailed(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cover = form!.coverUrl?.trim() ?? "";
    if (cover && !isCoverUrl(cover)) return setStatus({ ok: false, text: x.coverInvalid });
    setBusy(true);
    const payload: NewsInput = { ...form!, en: hasEn ? form!.en ?? emptyLang : undefined, coverUrl: cover || undefined };
    try {
      const r = isNew ? await actor.createNews(payload) : await actor.updateNews(BigInt(id!), payload);
      if (r.__kind__ === "err") return setStatus({ ok: false, text: errMessage(r.err as BackendErr, t) });
      setStatus({ ok: true, text: t.savedPublish });
      if (isNew) navigate(`/admin/news/${r.ok.id}`, { replace: true });
    } catch (err) {
      setStatus({ ok: false, text: t.saveFailed(err instanceof Error ? err.message : String(err)) });
    } finally { setBusy(false); }
  }

  return (
    <div>
      <p><Link to="/admin/news">{x.all}</Link></p>
      <h1 className="mt-2 text-4xl uppercase">{isNew ? x.new : x.editTitle}</h1>
      <Toast status={status} />

      <form onSubmit={save} noValidate className="mt-2 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="card grid gap-4 sm:grid-cols-2" aria-label={x.settings}>
            <div>
              <label htmlFor="nw-status" className="font-medium">{x.status}</label>
              <select id="nw-status" className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as NewsStatus })}>
                <option value={NewsStatus.draft}>{x.draft}</option>
                <option value={NewsStatus.published}>{x.published}</option>
              </select>
            </div>
            <div>
              <label htmlFor="nw-date" className="font-medium">{x.date}</label>
              <input id="nw-date" type="datetime-local" className={input} value={toLocalInput(form.publishedAt)}
                onChange={(e) => setForm({ ...form, publishedAt: fromLocalInput(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="nw-area" className="font-medium">{x.area}</label>
              <select id="nw-area" className={input} value={form.area ?? ""} onChange={(e) => setForm({ ...form, area: (e.target.value || undefined) as NewsArea | undefined })}>
                <option value="">–</option>
                {Object.values(NewsArea).map((a) => <option key={a} value={a}>{t.areas[a as keyof typeof t.areas]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="nw-slug" className="font-medium">{x.slug}</label>
              <input id="nw-slug" className={`${input} font-mono`} value={form.slug} maxLength={80} aria-describedby="nw-slug-hint"
                onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value }); }} />
              <p id="nw-slug-hint" className="mt-1 text-sm text-muted">/nyheter/{form.slug || "…"}</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="nw-cover" className="font-medium">{x.cover}</label>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <input id="nw-cover" type="url" inputMode="url" className={`${input} mt-0 min-w-56 flex-1`} value={form.coverUrl ?? ""}
                  placeholder="https://… / /uploads/…" aria-describedby="nw-cover-hint"
                  aria-invalid={!!form.coverUrl?.trim() && !isCoverUrl(form.coverUrl.trim())}
                  onChange={(e) => { setForm({ ...form, coverUrl: e.target.value }); setStatus(null); }} />
                <label htmlFor="nw-file" className="btn btn-secondary cursor-pointer">{busy ? t.uploading : t.upload}</label>
                {form.coverUrl && (
                  <button type="button" className="btn btn-secondary" onClick={() => setForm({ ...form, coverUrl: undefined })}>{x.removeCover}</button>
                )}
                <input id="nw-file" ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                  disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
              </div>
              <p id="nw-cover-hint" className="mt-1 text-sm text-muted">{x.coverHint}</p>
            </div>
          </section>

          <section className="card space-y-4" aria-label={x.text}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label={t.nav.language} className="flex gap-1">
                {(["sv", "en"] as const).map((l) => (
                  <button key={l} type="button" role="tab" aria-selected={tab === l} disabled={l === "en" && !hasEn}
                    className="rounded-md px-4 py-2 font-medium aria-selected:bg-[var(--color-navy-900)] aria-selected:text-white disabled:opacity-40"
                    onClick={() => setTab(l)}>{l === "sv" ? t.langSv : t.langEn}</button>
                ))}
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-5 w-5 accent-[var(--color-teal-700)]" checked={hasEn}
                  onChange={(e) => { setHasEn(e.target.checked); if (!e.target.checked) setTab("sv"); else if (!form.en) setForm({ ...form, en: emptyLang }); }} />
                {x.english}
              </label>
            </div>
            <div>
              <label htmlFor="nw-title" className="font-medium">{x.heading}</label>
              <input id="nw-title" className={input} maxLength={120} value={lang.title} onChange={(e) => setLang({ title: e.target.value })} />
            </div>
            <div>
              <label htmlFor="nw-excerpt" className="font-medium">{x.excerpt}</label>
              <textarea id="nw-excerpt" rows={2} className={input} maxLength={300} value={lang.excerpt} onChange={(e) => setLang({ excerpt: e.target.value })} />
            </div>
            <div>
              <label htmlFor="nw-body" className="font-medium">{x.body}</label>
              <textarea id="nw-body" rows={14} className={`${input} font-mono text-sm`} maxLength={20000} value={lang.body}
                onChange={(e) => setLang({ body: e.target.value })} aria-describedby="nw-body-hint" />
              <p id="nw-body-hint" className="mt-1 text-sm text-muted">{x.bodyHint}</p>
            </div>
            <div>
              <label htmlFor="nw-alt" className="font-medium">{x.alt}</label>
              <input id="nw-alt" className={input} maxLength={200} value={lang.coverAlt} onChange={(e) => setLang({ coverAlt: e.target.value })} />
            </div>
          </section>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t.saving : t.save}</button>
        </div>

        <section aria-labelledby="nw-preview" className="card h-fit xl:sticky xl:top-24">
          <h2 id="nw-preview" className="text-lg font-semibold">{x.previewOf(t.langName(tab))}</h2>
          {form.coverUrl && isCoverUrl(form.coverUrl.trim()) && <img src={form.coverUrl.trim()} alt="" className="mt-4 aspect-[1200/630] w-full rounded-xl object-cover" />}
          <p className="mt-4 text-3xl font-display font-bold uppercase">{lang.title || x.heading}</p>
          <p className="mt-2 text-muted">{lang.excerpt}</p>
          <Markdown body={lang.body} className="mt-6" />
        </section>
      </form>
    </div>
  );
}
