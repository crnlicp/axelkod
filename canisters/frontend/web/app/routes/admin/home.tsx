import { useEffect, useMemo, useState } from "react";
import { HomeKey as HomeKeyEnum, type HomeContent, type HomeHero, type HomeItem, type HomeSection } from "../../bindings/site";
import { useAdminLang, type AdminDict, type AdminLang } from "../../admin/i18n";
import { errMessage, type BackendErr } from "../../admin/result";
import { useAdmin } from "../../admin/session";
import { Toast } from "../../admin/toast";
import { publishSeo } from "../../admin/publish";
import { HOME_ICON_KEYS, iconSvg } from "../../lib/home-icons";

type SectionKey = "services" | "security" | "industries";
type Key = "hero" | SectionKey;
const KEYS: Key[] = ["hero", "services", "security", "industries"];
const MAX_WORDS = 4;
const MAX_TRUST = 8;
const MAX_ITEMS = 12;
const VISUALS = ["", "gear", "code", "shield"];
const input = "mt-1 w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2";
const blankText = { title: "", text: "" };
/** Change detection; the hero's highlight index is a bigint, which JSON can't encode as-is. */
const same = (a: unknown, b: unknown) => {
  const enc = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
  return enc(a) === enc(b);
};

/** Icon from the shared library (constant markup, never user input). */
function Glyph({ name, className }: { name: string; className: string }) {
  return <span className="inline-grid" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconSvg(name, className) }} />;
}

function IconPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} aria-label={`${label}: ${value}`} onClick={() => setOpen(!open)}
        className="grid h-12 w-12 place-items-center rounded-xl border border-border bg-surface text-accent hover:border-accent">
        <Glyph name={value} className="h-6 w-6" />
      </button>
      {open && (
        <div role="listbox" aria-label={label} className="absolute left-0 top-14 z-20 grid w-72 grid-cols-6 gap-1 rounded-xl border border-border bg-bg p-2 shadow-xl">
          {HOME_ICON_KEYS.map((k) => (
            <button key={k} type="button" role="option" aria-selected={k === value} title={k} aria-label={k}
              onClick={() => { onChange(k); setOpen(false); }}
              className="grid h-10 w-10 place-items-center rounded-lg text-fg hover:bg-surface-strong aria-selected:bg-[var(--brand-soft)] aria-selected:text-accent">
              <Glyph name={k} className="h-5 w-5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "services.items.2.en.title" -> readable text. */
function invalidText(field: string, t: AdminDict): string | null {
  const parts = field.split(".");
  const h = t.home;
  const langName = (l: string) => (l === "sv" ? t.langSv : t.langEn);
  if ((parts[1] === "items" || parts[1] === "trust") && parts.length >= 4) {
    const n = Number(parts[2]) + 1;
    const f = parts[parts.length - 1];
    const l = parts.length === 5 ? langName(parts[3]) : "–";
    return h.invalidItem(n, l, h.fieldNames[f] ?? f);
  }
  if (parts.length === 3) return h.invalidHead(langName(parts[1]), h.fieldNames[parts[2]] ?? parts[2]);
  return null;
}

export default function HomeAdmin() {
  const { actor } = useAdmin();
  const { t } = useAdminLang();
  const h = t.home;
  const [saved, setSaved] = useState<HomeContent | null>(null);
  const [draft, setDraft] = useState<HomeContent | null>(null);
  const [key, setKey] = useState<Key>("hero");
  const [lang, setLang] = useState<AdminLang>("sv");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saves, setSaves] = useState(0);

  useEffect(() => {
    void actor.adminGetHome().then((r) => {
      if (r.__kind__ === "ok") { setSaved(r.ok); setDraft(r.ok); }
      else setStatus({ ok: false, text: errMessage(r.err as BackendErr, t) });
    });
  }, [actor]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => !!draft && !!saved && !same(draft[key], saved[key]), [draft, saved, key]);
  if (!draft) return <p role="status">{status?.text ?? t.loading}</p>;

  if (key === "hero") {
    return (
      <Shell t={t} k={key} setKey={(k) => { setKey(k); setStatus(null); }} dirty={dirty} saves={saves}>
        <HeroEditor hero={draft.hero} saved={saved!.hero} lang={lang} setLang={setLang} status={status} busy={busy}
          onChange={(hero) => { setDraft({ ...draft, hero }); setStatus(null); }}
          onSave={() => void saveHero()} />
      </Shell>
    );
  }

  async function saveHero() {
    setBusy(true);
    try {
      const r = await actor.setHomeHero(draft!.hero);
      if (r.__kind__ === "err") {
        const err = r.err as BackendErr;
        const local = err.__kind__ === "invalid" && err.invalid ? invalidText(err.invalid, t) : null;
        return setStatus({ ok: false, text: local ?? errMessage(err, t) });
      }
      setSaved({ ...saved!, hero: r.ok });
      setDraft({ ...draft!, hero: r.ok });
      setStatus({ ok: true, text: h.saved });
      setSaves((n) => n + 1);
    } catch (e) {
      setStatus({ ok: false, text: t.saveFailed(e instanceof Error ? e.message : String(e)) });
    } finally { setBusy(false); }
  }

  const section = draft[key];
  const setSection = (s: HomeSection) => { setDraft({ ...draft, [key]: s }); setStatus(null); };
  const setItem = (i: number, it: HomeItem) => setSection({ ...section, items: section.items.map((x, j) => (j === i ? it : x)) });
  const move = (i: number, d: -1 | 1) => {
    const items = [...section.items];
    [items[i], items[i + d]] = [items[i + d], items[i]];
    setSection({ ...section, items });
  };
  const add = () => setSection({
    ...section,
    items: [...section.items, { icon: key === "industries" ? "company" : "shield", visual: "", sv: blankText, en: blankText }],
  });
  const missing = (l: AdminLang) =>
    !section[l].eyebrow.trim() || !section[l].title.trim() || section.items.some((it) => !it[l].title.trim() || !it[l].text.trim());
  const isLayers = key === "security";

  async function save() {
    setBusy(true);
    try {
      const variant = { services: HomeKeyEnum.services, security: HomeKeyEnum.security, industries: HomeKeyEnum.industries }[key as SectionKey];
      const r = await actor.setHomeSection(variant, section);
      if (r.__kind__ === "err") {
        const err = r.err as BackendErr;
        const local = err.__kind__ === "invalid" && err.invalid ? invalidText(err.invalid, t) : null;
        return setStatus({ ok: false, text: local ?? errMessage(err, t) });
      }
      setSaved({ ...saved!, [key]: r.ok });
      setDraft({ ...draft!, [key]: r.ok });
      setStatus({ ok: true, text: h.saved });
      setSaves((n) => n + 1);
    } catch (e) {
      setStatus({ ok: false, text: t.saveFailed(e instanceof Error ? e.message : String(e)) });
    } finally { setBusy(false); }
  }

  const head = section[lang];
  return (
    <Shell t={t} k={key} setKey={(k) => { setKey(k); setStatus(null); }} dirty={dirty} saves={saves}>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={t.nav.language} className="flex gap-1">
          {(["sv", "en"] as const).map((l) => (
            <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)}
              className="rounded-md px-4 py-2 font-medium aria-selected:bg-[var(--color-navy-900)] aria-selected:text-white">
              {l === "sv" ? t.langSv : t.langEn}
              {missing(l) && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-[var(--error)]" title={h.missing} aria-label={h.missing} />}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {dirty && <span className="text-sm text-muted">{t.unsaved}</span>}
          {dirty && <button type="button" className="btn btn-secondary" onClick={() => setSection(saved![key])}>{t.undo}</button>}
          <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? t.saving : t.save}</button>
        </div>
      </div>
      <Toast status={status} />

      <section className="card mt-2 grid gap-4 sm:grid-cols-2" aria-labelledby="home-head">
        <h2 id="home-head" className="text-xl sm:col-span-2">{h.head}</h2>
        <div>
          <label htmlFor="hm-eyebrow" className="font-medium">{h.eyebrow}</label>
          <input id="hm-eyebrow" className={input} maxLength={40} value={head.eyebrow}
            onChange={(e) => setSection({ ...section, [lang]: { ...head, eyebrow: e.target.value } })} />
        </div>
        <div>
          <label htmlFor="hm-title" className="font-medium">{h.heading}</label>
          <input id="hm-title" className={input} maxLength={80} value={head.title}
            onChange={(e) => setSection({ ...section, [lang]: { ...head, title: e.target.value } })} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="hm-intro" className="font-medium">{h.introField}</label>
          <textarea id="hm-intro" rows={2} className={input} maxLength={300} value={head.intro}
            onChange={(e) => setSection({ ...section, [lang]: { ...head, intro: e.target.value } })} />
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl">{isLayers ? h.layers : h.items}</h2>
          <p className="mt-1 text-sm text-muted">{key === "services" ? h.featured : isLayers ? h.layersHint : h.colsHint}</p>
        </div>
        <button type="button" className="btn btn-secondary" disabled={section.items.length >= MAX_ITEMS} onClick={add}
          title={section.items.length >= MAX_ITEMS ? h.max(MAX_ITEMS) : undefined}>
          + {isLayers ? h.addLayer : h.add}
        </button>
      </div>

      <ol className="mt-4 grid gap-4 xl:grid-cols-2" data-testid="home-items">
        {section.items.map((it, i) => {
          const name = isLayers ? h.layer(i + 1) : h.item(i + 1);
          const id = `hm-${key}-${i}`;
          return (
            <li key={i} className="card space-y-4" aria-label={name}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm text-muted">{String(i + 1).padStart(2, "0")}</span>
                {!isLayers && <IconPicker value={it.icon} label={`${name} – ${h.chooseIcon}`} onChange={(icon) => setItem(i, { ...it, icon })} />}
                {key === "services" && (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted">{h.visual}</span>
                    <select className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5" value={it.visual}
                      onChange={(e) => setItem(i, { ...it, visual: e.target.value })}>
                      {VISUALS.map((v) => <option key={v} value={v}>{h.visuals[v]}</option>)}
                    </select>
                  </label>
                )}
                <div className="ml-auto flex gap-1">
                  <button type="button" className="btn btn-secondary !px-3" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${h.up}: ${name}`}>↑</button>
                  <button type="button" className="btn btn-secondary !px-3" disabled={i === section.items.length - 1} onClick={() => move(i, 1)} aria-label={`${h.down}: ${name}`}>↓</button>
                  <button type="button" className="btn btn-secondary text-[var(--error)]" disabled={section.items.length <= 1}
                    onClick={() => { if (confirm(h.confirmRemove)) setSection({ ...section, items: section.items.filter((_, j) => j !== i) }); }}
                    aria-label={`${h.removeItem}: ${name}`}>{h.removeItem}</button>
                </div>
              </div>
              <div>
                <label htmlFor={`${id}-title`} className="font-medium">{h.itemTitle}</label>
                <input id={`${id}-title`} className={input} maxLength={80} value={it[lang].title}
                  onChange={(e) => setItem(i, { ...it, [lang]: { ...it[lang], title: e.target.value } })} />
              </div>
              <div>
                <label htmlFor={`${id}-text`} className="font-medium">{h.itemText}</label>
                <textarea id={`${id}-text`} rows={2} className={input} maxLength={300} value={it[lang].text}
                  onChange={(e) => setItem(i, { ...it, [lang]: { ...it[lang], text: e.target.value } })} />
              </div>
            </li>
          );
        })}
      </ol>
    </Shell>
  );
}

/** Page title, intro and section tabs around each editor. */
function Shell({ t, k, setKey, dirty, saves, children }: {
  t: AdminDict; k: Key; setKey: (k: Key) => void; dirty: boolean; saves: number; children: React.ReactNode;
}) {
  const h = t.home;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl uppercase">{h.title}</h1>
        <PublishBar t={t} dirty={dirty} saves={saves} />
      </div>
      <p className="mt-2 text-muted">{h.intro}</p>
      <div role="tablist" aria-label={h.title} className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {KEYS.map((x) => (
          <button key={x} type="button" role="tab" aria-selected={k === x} onClick={() => setKey(x)}
            className="-mb-px border-b-2 border-transparent px-4 py-2.5 font-medium text-muted aria-selected:border-[var(--accent)] aria-selected:text-fg">
            {h.tabs[x]}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

const when = (t: AdminDict, ns?: bigint) => (ns ? new Date(Number(ns / 1_000_000n)).toLocaleString(t.locale) : t.seo.never);

/** Publishes the whole site (same as the SEO page), so home edits can go live from here. */
function PublishBar({ t, dirty, saves }: { t: AdminDict; dirty: boolean; saves: number }) {
  const { actor, identity } = useAdmin();
  const x = t.seo;
  const [times, setTimes] = useState<{ updatedAt: bigint; publishedAt?: bigint } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const r = await actor.getSeoSettings();
    if (r.__kind__ === "ok") setTimes({ updatedAt: r.ok.updatedAt, publishedAt: r.ok.publishedAt });
    else setStatus({ ok: false, text: errMessage(r.err as BackendErr, t) });
  }
  useEffect(() => { void load(); }, [actor, saves]); // eslint-disable-line react-hooks/exhaustive-deps

  async function publish() {
    setBusy(true);
    setStatus({ ok: true, text: x.publishing });
    try {
      await publishSeo(actor, identity);
      await load();
      setStatus({ ok: true, text: x.published });
    } catch (err) {
      setStatus({ ok: false, text: x.publishFailed(err instanceof Error ? err.message : String(err)) });
    } finally { setBusy(false); }
  }

  const unpublished = !!times && (!times.publishedAt || times.updatedAt > times.publishedAt);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-sm text-muted">
          {x.lastPublished} <span data-testid="published-at">{when(t, times?.publishedAt)}</span>
          {unpublished && !busy && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-brand align-middle" title={x.changed} aria-label={x.changed} />}
        </p>
        <button type="button" className="btn btn-primary" title={t.home.publishAll}
          disabled={busy || dirty || !times} onClick={() => void publish()}>
          {busy ? x.publishing : x.publish}
        </button>
      </div>
      <Toast status={status} />
      {dirty && <p className="text-sm text-muted">{x.saveFirst}</p>}
    </div>
  );
}

function HeroEditor({ hero, saved, lang, setLang, status, busy, onChange, onSave }: {
  hero: HomeHero; saved: HomeHero; lang: AdminLang; setLang: (l: AdminLang) => void;
  status: { ok: boolean; text: string } | null; busy: boolean; onChange: (h: HomeHero) => void; onSave: () => void;
}) {
  const { t } = useAdminLang();
  const h = t.home;
  const x = h.hero;
  const l = hero[lang];
  const dirty = !same(hero, saved);
  const highlight = Number(hero.highlight);
  const setL = (patch: Partial<typeof l>) => onChange({ ...hero, [lang]: { ...l, ...patch } });
  const setWord = (i: number, w: string) => setL({ words: l.words.map((v, j) => (j === i ? w : v)) });
  const setTrust = (i: number, it: HomeItem) => onChange({ ...hero, trust: hero.trust.map((v, j) => (j === i ? it : v)) });
  const moveTrust = (i: number, d: -1 | 1) => {
    const trust = [...hero.trust];
    [trust[i], trust[i + d]] = [trust[i + d], trust[i]];
    onChange({ ...hero, trust });
  };
  const missing = (g: AdminLang) => {
    const v = hero[g];
    return !v.eyebrow.trim() || !v.subtitle.trim() || !v.cta.trim() || !v.cta2.trim() || v.words.some((w) => !w.trim())
      || hero.trust.some((it) => !it[g].title.trim() || !it[g].text.trim());
  };
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={t.nav.language} className="flex gap-1">
          {(["sv", "en"] as const).map((g) => (
            <button key={g} type="button" role="tab" aria-selected={lang === g} onClick={() => setLang(g)}
              className="rounded-md px-4 py-2 font-medium aria-selected:bg-[var(--color-navy-900)] aria-selected:text-white">
              {g === "sv" ? t.langSv : t.langEn}
              {missing(g) && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-[var(--error)]" title={h.missing} aria-label={h.missing} />}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {dirty && <span className="text-sm text-muted">{t.unsaved}</span>}
          {dirty && <button type="button" className="btn btn-secondary" onClick={() => onChange(saved)}>{t.undo}</button>}
          <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={onSave}>{busy ? t.saving : t.save}</button>
        </div>
      </div>
      <Toast status={status} />

      <section className="card mt-2 grid gap-4 lg:grid-cols-2" aria-labelledby="hero-text">
        <h2 id="hero-text" className="text-xl lg:col-span-2">{x.text}</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="hr-eyebrow" className="font-medium">{h.eyebrow}</label>
            <input id="hr-eyebrow" className={input} maxLength={60} value={l.eyebrow} onChange={(e) => setL({ eyebrow: e.target.value })} />
          </div>
          <fieldset>
            <legend className="font-medium">{x.words}</legend>
            <p className="text-sm text-muted">{x.highlightHint}</p>
            <ol className="mt-2 space-y-2">
              {l.words.map((w, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input aria-label={x.word(i + 1)} className={`${input} mt-0 flex-1 font-display text-xl uppercase`} maxLength={30} value={w}
                    onChange={(e) => setWord(i, e.target.value)} />
                  <label className="flex shrink-0 items-center gap-1.5 text-sm">
                    <input type="radio" name="hr-highlight" className="h-4 w-4 accent-[var(--color-teal-500)]" checked={highlight === i}
                      onChange={() => onChange({ ...hero, highlight: BigInt(i) })} />
                    {x.highlight}
                  </label>
                  <button type="button" className="btn btn-secondary !px-3" disabled={l.words.length <= 1}
                    onClick={() => setL({ words: l.words.filter((_, j) => j !== i) })} aria-label={`${h.removeItem}: ${x.word(i + 1)}`}>×</button>
                </li>
              ))}
            </ol>
            <button type="button" className="btn btn-secondary mt-2" disabled={l.words.length >= MAX_WORDS}
              onClick={() => setL({ words: [...l.words, ""] })}>+ {x.addWord}</button>
          </fieldset>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="hr-sub" className="font-medium">{x.subtitle}</label>
            <textarea id="hr-sub" rows={3} className={input} maxLength={200} value={l.subtitle} onChange={(e) => setL({ subtitle: e.target.value })} />
          </div>
          <div>
            <label htmlFor="hr-cta" className="font-medium">{x.cta}</label>
            <input id="hr-cta" className={input} maxLength={40} value={l.cta} onChange={(e) => setL({ cta: e.target.value })} />
          </div>
          <div>
            <label htmlFor="hr-cta2" className="font-medium">{x.cta2}</label>
            <input id="hr-cta2" className={input} maxLength={40} value={l.cta2} onChange={(e) => setL({ cta2: e.target.value })} />
          </div>
          <div className="rounded-xl border border-border bg-bg p-4" aria-hidden="true">
            <p className="text-xs uppercase tracking-widest text-accent">{l.eyebrow}</p>
            <p className="mt-2 font-display text-3xl font-bold uppercase leading-tight">
              {l.words.map((w, i) => <span key={i} className={`block ${i === highlight ? "text-gradient" : ""}`}>{w || "…"}</span>)}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl">{x.trust}</h2>
          <p className="mt-1 text-sm text-muted">{x.trustHint}</p>
        </div>
        <button type="button" className="btn btn-secondary" disabled={hero.trust.length >= MAX_TRUST}
          onClick={() => onChange({ ...hero, trust: [...hero.trust, { icon: "shield", visual: "", sv: blankText, en: blankText }] })}>
          + {x.addTrust}
        </button>
      </div>
      <ol className="mt-4 grid gap-4 xl:grid-cols-2" data-testid="hero-trust">
        {hero.trust.map((it, i) => {
          const name = x.point(i + 1);
          const id = `hr-trust-${i}`;
          return (
            <li key={i} className="card space-y-4" aria-label={name}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm text-muted">{String(i + 1).padStart(2, "0")}</span>
                <IconPicker value={it.icon} label={`${name} – ${h.chooseIcon}`} onChange={(icon) => setTrust(i, { ...it, icon })} />
                <div className="ml-auto flex gap-1">
                  <button type="button" className="btn btn-secondary !px-3" disabled={i === 0} onClick={() => moveTrust(i, -1)} aria-label={`${h.up}: ${name}`}>↑</button>
                  <button type="button" className="btn btn-secondary !px-3" disabled={i === hero.trust.length - 1} onClick={() => moveTrust(i, 1)} aria-label={`${h.down}: ${name}`}>↓</button>
                  <button type="button" className="btn btn-secondary text-[var(--error)]" disabled={hero.trust.length <= 1}
                    onClick={() => { if (confirm(h.confirmRemove)) onChange({ ...hero, trust: hero.trust.filter((_, j) => j !== i) }); }}
                    aria-label={`${h.removeItem}: ${name}`}>{h.removeItem}</button>
                </div>
              </div>
              <div>
                <label htmlFor={`${id}-title`} className="font-medium">{h.itemTitle}</label>
                <input id={`${id}-title`} className={input} maxLength={40} value={it[lang].title}
                  onChange={(e) => setTrust(i, { ...it, [lang]: { ...it[lang], title: e.target.value } })} />
              </div>
              <div>
                <label htmlFor={`${id}-text`} className="font-medium">{h.itemText}</label>
                <input id={`${id}-text`} className={input} maxLength={120} value={it[lang].text}
                  onChange={(e) => setTrust(i, { ...it, [lang]: { ...it[lang], text: e.target.value } })} />
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
