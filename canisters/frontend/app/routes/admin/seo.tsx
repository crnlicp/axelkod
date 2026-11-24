import { useEffect, useMemo, useRef, useState } from "react";
import type { SeoLang, SeoSettings } from "../../bindings/backend";
import { publishSeo, uploadOgImage } from "../../admin/publish";
import { errMessage, type BackendErr } from "../../admin/result";
import { useAdmin } from "../../admin/session";

type Lang = "sv" | "en";
const LANGS: Array<{ key: Lang; label: string; path: string }> = [
  { key: "sv", label: "Svenska", path: "/" },
  { key: "en", label: "Engelska", path: "/en/" },
];
const when = (ns?: bigint) => (ns ? new Date(Number(ns / 1_000_000n)).toLocaleString("sv-SE") : "aldrig");
const opt = (v?: string) => (v && v.trim() ? v.trim() : undefined);

function normalise(s: SeoSettings): SeoSettings {
  const l = (x: SeoLang): SeoLang => ({
    ...x, title: x.title.trim(), metaDescription: x.metaDescription.trim(), keywords: opt(x.keywords),
    ogTitle: opt(x.ogTitle), ogDescription: opt(x.ogDescription), ogImageUrl: x.ogImageUrl.trim(), canonicalBaseUrl: x.canonicalBaseUrl.trim(),
  });
  return {
    ...s, sv: l(s.sv), en: l(s.en), organisationName: s.organisationName.trim(), logoUrl: s.logoUrl.trim(),
    sameAs: s.sameAs.map((u) => u.trim()).filter(Boolean), googleVerification: opt(s.googleVerification), bingVerification: opt(s.bingVerification),
  };
}

function Counter({ value, ideal }: { value: string; ideal: number }) {
  const n = value.length;
  return <span className={`text-sm ${n > ideal ? "font-medium text-[var(--error)]" : "text-muted"}`}>{n} / ~{ideal} tecken</span>;
}

/** Roughly how Google shows the result (it truncates by pixel width, so this is a guide). */
function GooglePreview({ s, path }: { s: SeoLang; path: string }) {
  const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const url = s.canonicalBaseUrl.replace(/\/+$/, "") + path;
  return (
    <div className="rounded-lg border border-border bg-white p-4 font-sans text-[#202124]" data-testid="google-preview">
      <p className="truncate text-sm text-[#4d5156]">{url}</p>
      <p className="mt-1 truncate text-xl text-[#1a0dab]">{cut(s.title, 60)}</p>
      <p className="mt-1 text-sm text-[#4d5156]">{cut(s.metaDescription, 155)}</p>
    </div>
  );
}

export default function SeoAdmin() {
  const { actor, identity } = useAdmin();
  const [saved, setSaved] = useState<SeoSettings | null>(null);
  const [form, setForm] = useState<SeoSettings | null>(null);
  const [times, setTimes] = useState<{ updatedAt: bigint; publishedAt?: bigint }>({ updatedAt: 0n });
  const [tab, setTab] = useState<Lang>("sv");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "publish" | "upload">("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await actor.getSeoSettings();
    if (r.__kind__ === "err") return setStatus({ ok: false, text: errMessage(r.err as BackendErr) });
    setSaved(r.ok.settings);
    setForm(r.ok.settings);
    setTimes({ updatedAt: r.ok.updatedAt, publishedAt: r.ok.publishedAt });
  }
  useEffect(() => { void load(); }, [actor]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => !!form && !!saved && JSON.stringify(normalise(form)) !== JSON.stringify(normalise(saved)), [form, saved]);
  if (!form) return <p role="status">{status?.text ?? "Laddar…"}</p>;

  const unpublished = !times.publishedAt || times.updatedAt > times.publishedAt;
  const l = form[tab];
  const setLang = (patch: Partial<SeoLang>) => { setForm({ ...form, [tab]: { ...l, ...patch } }); setStatus(null); };
  const setGlobal = (patch: Partial<SeoSettings>) => { setForm({ ...form, ...patch }); setStatus(null); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    try {
      const r = await actor.setSeoSettings(normalise(form!));
      if (r.__kind__ === "err") return setStatus({ ok: false, text: errMessage(r.err as BackendErr) });
      await load();
      setStatus({ ok: true, text: "Sparat. Publicera för att uppdatera webbplatsen." });
    } catch (err) {
      setStatus({ ok: false, text: `Kunde inte spara: ${err instanceof Error ? err.message : String(err)}` });
    } finally { setBusy(""); }
  }

  async function publish() {
    setBusy("publish");
    setStatus({ ok: true, text: "Publicerar…" });
    try {
      await publishSeo(actor, identity);
      await load();
      setStatus({ ok: true, text: "Publicerat. Sidorna, sitemap.xml och robots.txt är uppdaterade." });
    } catch (err) {
      setStatus({ ok: false, text: `Publiceringen misslyckades: ${err instanceof Error ? err.message : String(err)}` });
    } finally { setBusy(""); }
  }

  async function upload(file: File) {
    setBusy("upload");
    try {
      const path = await uploadOgImage(identity, file);
      setLang({ ogImageUrl: l.canonicalBaseUrl.replace(/\/+$/, "") + path });
      setStatus({ ok: true, text: "Bilden är uppladdad. Spara och publicera för att använda den." });
    } catch (err) {
      setStatus({ ok: false, text: `Uppladdningen misslyckades: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // The configured base URL is the production domain; show uploads from this origin.
  const ogPreview = (() => {
    try { const u = new URL(l.ogImageUrl); return u.pathname.startsWith("/") ? u.pathname : null; } catch { return null; }
  })();

  const input = "mt-1 w-full rounded-md border border-[var(--input-border)] bg-bg px-3 py-2";
  const field = (id: string, label: string, el: React.ReactNode, extra?: React.ReactNode) => (
    <div>
      <div className="flex items-baseline justify-between gap-2"><label htmlFor={id} className="font-medium">{label}</label>{extra}</div>
      {el}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl uppercase">SEO</h1>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">Senast publicerat: <span data-testid="published-at">{when(times.publishedAt)}</span></p>
          <button type="button" className="btn btn-primary" disabled={busy !== "" || dirty} onClick={() => void publish()}>
            {busy === "publish" ? "Publicerar…" : "Publicera"}
          </button>
        </div>
      </div>
      {unpublished && !dirty && (
        <p className="mt-3 rounded-md border border-[var(--color-teal-500)] p-3" role="note">
          Inställningarna (eller kontaktuppgifterna) har ändrats sedan senaste publiceringen. Publicera för att uppdatera webbplatsens metadata.
        </p>
      )}
      {dirty && <p className="mt-3 text-sm text-muted">Spara innan du publicerar.</p>}
      <p role="status" aria-live="polite" className={`mt-3 min-h-6 ${status && !status.ok ? "text-[var(--error)]" : ""}`}>{status?.text}</p>

      <form onSubmit={save} className="mt-4 space-y-6" noValidate>
        <section className="card space-y-4" aria-labelledby="lang-tabs">
          <div role="tablist" id="lang-tabs" aria-label="Språk" className="flex gap-1">
            {LANGS.map((x) => (
              <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} aria-controls="lang-panel"
                className="rounded-md px-4 py-2 font-medium aria-selected:bg-[var(--color-navy-900)] aria-selected:text-white"
                onClick={() => setTab(x.key)}>{x.label}</button>
            ))}
          </div>
          <div id="lang-panel" role="tabpanel" aria-label={LANGS.find((x) => x.key === tab)!.label} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
            <div className="space-y-4">
              {field("seo-title", "Titel", <input id="seo-title" className={input} maxLength={120} value={l.title} onChange={(e) => setLang({ title: e.target.value })} />, <Counter value={l.title} ideal={60} />)}
              {field("seo-desc", "Metabeskrivning", <textarea id="seo-desc" rows={3} className={input} maxLength={320} value={l.metaDescription} onChange={(e) => setLang({ metaDescription: e.target.value })} />, <Counter value={l.metaDescription} ideal={155} />)}
              {field("seo-keywords", "Nyckelord (valfritt)", <input id="seo-keywords" className={input} maxLength={300} value={l.keywords ?? ""} onChange={(e) => setLang({ keywords: e.target.value })} />)}
              {field("seo-ogtitle", "OG-titel (valfritt, annars titeln)", <input id="seo-ogtitle" className={input} maxLength={120} value={l.ogTitle ?? ""} onChange={(e) => setLang({ ogTitle: e.target.value })} />)}
              {field("seo-ogdesc", "OG-beskrivning (valfritt)", <textarea id="seo-ogdesc" rows={2} className={input} maxLength={320} value={l.ogDescription ?? ""} onChange={(e) => setLang({ ogDescription: e.target.value })} />)}
              {field("seo-ogimg", "OG-bild (URL, 1200×630)", <input id="seo-ogimg" className={input} value={l.ogImageUrl} onChange={(e) => setLang({ ogImageUrl: e.target.value })} />)}
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="seo-ogfile" className="btn btn-secondary cursor-pointer">{busy === "upload" ? "Laddar upp…" : "Ladda upp bild"}</label>
                <input id="seo-ogfile" ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                  disabled={busy !== ""} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
                <span className="text-sm text-muted">PNG, JPEG eller WebP, högst 1,9 MB.</span>
              </div>
              {field("seo-canonical", "Kanonisk bas-URL", <input id="seo-canonical" className={input} value={l.canonicalBaseUrl} onChange={(e) => setLang({ canonicalBaseUrl: e.target.value })} />)}
              <label className="flex items-center gap-3">
                <input type="checkbox" className="h-5 w-5 accent-[var(--color-teal-700)]" checked={l.indexable} onChange={(e) => setLang({ indexable: e.target.checked })} />
                Låt sökmotorer indexera ({tab === "sv" ? "svenska" : "engelska"} sidor)
              </label>
            </div>
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Förhandsvisning i Google</h2>
              <GooglePreview s={l} path={LANGS.find((x) => x.key === tab)!.path} />
              {ogPreview && <img src={ogPreview} alt="Vald OG-bild" className="w-full rounded-md border border-border" />}
            </div>
          </div>
        </section>

        <section className="card grid gap-4 sm:grid-cols-2" aria-labelledby="org-title">
          <h2 id="org-title" className="text-2xl sm:col-span-2">Organisation (JSON-LD)</h2>
          {field("seo-org", "Organisationsnamn", <input id="seo-org" className={input} value={form.organisationName} onChange={(e) => setGlobal({ organisationName: e.target.value })} />)}
          {field("seo-logo", "Logotyp-URL", <input id="seo-logo" className={input} value={form.logoUrl} onChange={(e) => setGlobal({ logoUrl: e.target.value })} />)}
          <div className="sm:col-span-2">
            {field("seo-sameas", "Profiler, en URL per rad (LinkedIn m.fl.)", <textarea id="seo-sameas" rows={3} className={input} value={form.sameAs.join("\n")} onChange={(e) => setGlobal({ sameAs: e.target.value.split("\n") })} />)}
          </div>
          {field("seo-google", "Google-verifiering (valfritt)", <input id="seo-google" className={input} value={form.googleVerification ?? ""} onChange={(e) => setGlobal({ googleVerification: e.target.value })} />)}
          {field("seo-bing", "Bing-verifiering (valfritt)", <input id="seo-bing" className={input} value={form.bingVerification ?? ""} onChange={(e) => setGlobal({ bingVerification: e.target.value })} />)}
        </section>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary" disabled={busy !== "" || !dirty}>{busy === "save" ? "Sparar…" : "Spara"}</button>
          {dirty && <button type="button" className="btn btn-secondary" onClick={() => { setForm(saved); setStatus(null); }}>Ångra ändringar</button>}
        </div>
      </form>
    </div>
  );
}
