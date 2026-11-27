import { useEffect, useMemo, useRef, useState } from "react";
import { HomeKey as HomeKeyEnum, ProductStatus, type HomeContent, type HomeHead, type HomeHero, type HomeItem, type HomeSection, type ProductItem, type ProductSection } from "../../bindings/site";
import { useAdminLang, type AdminDict, type AdminLang } from "../../admin/i18n";
import { errMessage, type BackendErr } from "../../admin/result";
import { useAdmin } from "../../admin/session";
import { Toast } from "../../admin/toast";
import { publishSeo } from "../../admin/publish";
import { HOME_ICON_KEYS, iconSvg } from "../../lib/home-icons";
import { decrypt } from "../../lib/cipher";
import { enhanceSims, PRODUCT_SIMS } from "../../lib/product-sims";
import { productCardHtml, type ProductItem as RenderProductItem } from "../../lib/home-render";

type SectionKey = "services" | "products" | "security" | "industries";
type Key = "hero" | SectionKey;
const KEYS: Key[] = ["hero", "services", "products", "security", "industries"];
/** Products items carry a status, a link and a button text on top of the usual card fields. */
type Item = HomeItem | ProductItem;
type Section = { sv: HomeHead; en: HomeHead; items: Item[] };
const STATUSES = [ProductStatus.live, ProductStatus.beta, ProductStatus.soon];
const MAX_WORDS = 4;
const MAX_TRUST = 8;
const MAX_ITEMS = 12;
const VISUALS = ["", "gear", "code", "shield", "infra"];
const input = "mt-1 w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2";
const blankText = { title: "", text: "" };
/** Change detection; the hero's word indexes are bigints, which JSON can't encode as-is. */
const same = (a: unknown, b: unknown) => {
  const enc = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
  return enc(a) === enc(b);
};

/** The chosen product background running in a card-sized box, as on the site. */
/** The card exactly as the site renders it (escaped markup from home-render), with its simulation running. */
function CardPreview({ item, lang }: { item: RenderProductItem; lang: AdminLang }) {
  const ref = useRef<HTMLUListElement>(null);
  const html = productCardHtml(item, lang, false).replace(" data-reveal", "");
  useEffect(() => (ref.current ? enhanceSims(ref.current) : undefined), [html]);
  return <ul ref={ref} className="grid" aria-hidden="true" inert dangerouslySetInnerHTML={{ __html: html }} />;
}

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
      <Shell t={t} k={key} setKey={(k) => { setKey(k); setStatus(null); }} dirty={dirty} saves={saves} onSave={saveHero}>
        <HeroEditor hero={draft.hero} saved={saved!.hero} lang={lang} setLang={setLang} status={status} busy={busy}
          onChange={(hero) => { setDraft({ ...draft, hero }); setStatus(null); }}
          onSave={() => void saveHero()} />
      </Shell>
    );
  }

  /** Saves the hero; false (with the error shown) when it didn't save. */
  async function saveHero(): Promise<boolean> {
    setBusy(true);
    try {
      const r = await actor.setHomeHero(draft!.hero);
      if (r.__kind__ === "err") {
        const err = r.err as BackendErr;
        const local = err.__kind__ === "invalid" && err.invalid ? invalidText(err.invalid, t) : null;
        setStatus({ ok: false, text: local ?? errMessage(err, t) });
        return false;
      }
      setSaved({ ...saved!, hero: r.ok });
      setDraft({ ...draft!, hero: r.ok });
      setStatus({ ok: true, text: h.saved });
      setSaves((n) => n + 1);
      return true;
    } catch (e) {
      setStatus({ ok: false, text: t.saveFailed(e instanceof Error ? e.message : String(e)) });
      return false;
    } finally { setBusy(false); }
  }

  const section: Section = draft[key];
  const isProducts = key === "products";
  const setSection = (s: Section) => { setDraft({ ...draft, [key]: s }); setStatus(null); };
  const setItem = (i: number, it: Item) => setSection({ ...section, items: section.items.map((x, j) => (j === i ? it : x)) });
  const move = (i: number, d: -1 | 1) => {
    const items = [...section.items];
    [items[i], items[i + d]] = [items[i + d], items[i]];
    setSection({ ...section, items });
  };
  const blankProduct = { ...blankText, cta: "" };
  const add = () => setSection({
    ...section,
    items: [...section.items, isProducts
      ? { icon: "lock", status: ProductStatus.soon, url: "", background: "", sv: blankProduct, en: blankProduct }
      : { icon: key === "industries" ? "company" : "shield", visual: "", sv: blankText, en: blankText }],
  });
  const missing = (l: AdminLang) =>
    !section[l].eyebrow.trim() || !section[l].title.trim()
    || section.items.some((it) => !it[l].title.trim() || !it[l].text.trim() || (isProducts && !(it as ProductItem)[l].cta.trim()));
  const isLayers = key === "security";

  async function save(): Promise<boolean> {
    setBusy(true);
    try {
      const variant = { services: HomeKeyEnum.services, security: HomeKeyEnum.security, industries: HomeKeyEnum.industries }[key as Exclude<SectionKey, "products">];
      const r = isProducts
        ? await actor.setHomeProducts(section as ProductSection)
        : await actor.setHomeSection(variant, section as HomeSection);
      if (r.__kind__ === "err") {
        const err = r.err as BackendErr;
        const local = err.__kind__ === "invalid" && err.invalid ? invalidText(err.invalid, t) : null;
        setStatus({ ok: false, text: local ?? errMessage(err, t) });
        return false;
      }
      setSaved({ ...saved!, [key]: r.ok });
      setDraft({ ...draft!, [key]: r.ok });
      setStatus({ ok: true, text: h.saved });
      setSaves((n) => n + 1);
      return true;
    } catch (e) {
      setStatus({ ok: false, text: t.saveFailed(e instanceof Error ? e.message : String(e)) });
      return false;
    } finally { setBusy(false); }
  }

  const head = section[lang];
  return (
    <Shell t={t} k={key} setKey={(k) => { setKey(k); setStatus(null); }} dirty={dirty} saves={saves} onSave={save}>

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
                    <select className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5" value={(it as HomeItem).visual}
                      onChange={(e) => setItem(i, { ...(it as HomeItem), visual: e.target.value })}>
                      {VISUALS.map((v) => <option key={v} value={v}>{h.visuals[v]}</option>)}
                    </select>
                  </label>
                )}
                {isProducts && (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted">{h.product.status}</span>
                    <select className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5" value={(it as ProductItem).status}
                      onChange={(e) => setItem(i, { ...(it as ProductItem), status: e.target.value as ProductStatus })}>
                      {STATUSES.map((v) => <option key={v} value={v}>{h.product.statuses[v]}</option>)}
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
              {isProducts && (() => {
                const p = it as ProductItem;
                return (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`${id}-cta`} className="font-medium">{h.product.cta}</label>
                      <input id={`${id}-cta`} className={input} maxLength={40} value={p[lang].cta}
                        onChange={(e) => setItem(i, { ...p, [lang]: { ...p[lang], cta: e.target.value } })} />
                    </div>
                    <div>
                      <label htmlFor={`${id}-url`} className="font-medium">{h.product.url}</label>
                      <input id={`${id}-url`} type="url" className={input} maxLength={500} value={p.url} placeholder="https://"
                        aria-describedby={`${id}-url-hint`} onChange={(e) => setItem(i, { ...p, url: e.target.value })} />
                      <p id={`${id}-url-hint`} className="mt-1 text-sm text-muted">{h.product.urlHint}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`${id}-bg`} className="font-medium">{h.product.background}</label>
                      <p className="text-sm text-muted">{h.product.backgroundHint}</p>
                      <select id={`${id}-bg`} className={input} value={p.background}
                        onChange={(e) => setItem(i, { ...p, background: e.target.value })}>
                        <option value="">{h.product.noBackground}</option>
                        {PRODUCT_SIMS.map((s) => <option key={s.id} value={s.id}>{s.label[lang]}</option>)}
                      </select>
                    </div>
                    {p.background && (
                      <div className="sm:col-span-2">
                        <p className="font-medium">{h.product.preview}</p>
                        <CardPreview item={p as RenderProductItem} lang={lang} />
                      </div>
                    )}
                  </div>
                );
              })()}
            </li>
          );
        })}
      </ol>
    </Shell>
  );
}

/** Page title, intro and section tabs around each editor. */
function Shell({ t, k, setKey, dirty, saves, onSave, children }: {
  t: AdminDict; k: Key; setKey: (k: Key) => void; dirty: boolean; saves: number; onSave: () => Promise<boolean>; children: React.ReactNode;
}) {
  const h = t.home;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl uppercase">{h.title}</h1>
        <PublishBar t={t} dirty={dirty} saves={saves} onSave={onSave} />
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

/** Publishes the whole site (same as the SEO page), so home edits can go live from here.
 *  Unsaved edits on the open tab are saved first; a failed save stops the publish. */
function PublishBar({ t, dirty, saves, onSave }: { t: AdminDict; dirty: boolean; saves: number; onSave: () => Promise<boolean> }) {
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
    if (dirty && !(await onSave())) return setBusy(false);
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
          disabled={busy || !times} onClick={() => void publish()}>
          {busy ? x.publishing : dirty ? t.home.saveAndPublish : x.publish}
        </button>
      </div>
      <Toast status={status} />
    </div>
  );
}

function HeroEditor({ hero, saved, lang, setLang, status, busy, onChange, onSave }: {
  hero: HomeHero; saved: HomeHero; lang: AdminLang; setLang: (l: AdminLang) => void;
  status: { ok: boolean; text: string } | null; busy: boolean; onChange: (h: HomeHero) => void; onSave: () => void;
}) {
  const { t } = useAdminLang();
  const { actor } = useAdmin();
  const h = t.home;
  const x = h.hero;
  const l = hero[lang];
  const dirty = !same(hero, saved);
  const v = hero.visuals;
  const globeSize = Number(v.globeSize);
  const highlights = new Set(hero.highlights.map(Number));
  const ciphers = new Set(hero.ciphers.map(Number));
  /** Turns a word's effect on or off (indexes are shared by both languages). */
  const toggle = (field: "highlights" | "ciphers", i: number, on: boolean) => {
    const rest = hero[field].filter((v) => Number(v) !== i);
    onChange({ ...hero, [field]: on ? [...rest, BigInt(i)].sort((a, b) => Number(a - b)) : rest });
  };
  /** Removing a word shifts the later words' indexes down. */
  const removeWord = (i: number) => {
    const shift = (xs: bigint[]) => xs.filter((v) => Number(v) !== i).map((v) => (Number(v) > i ? v - 1n : v));
    onChange({ ...hero, [lang]: { ...l, words: l.words.filter((_, j) => j !== i) }, highlights: shift(hero.highlights), ciphers: shift(hero.ciphers) });
  };
  const previewRef = useRef<HTMLParagraphElement>(null);
  const cipherKey = [...ciphers].sort().map((i) => `${i}:${l.words[i]}`).join("|");
  // Replays the effect in the preview whenever the encrypted words change.
  useEffect(() => {
    if (!previewRef.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cancels = Array.from(previewRef.current.querySelectorAll<HTMLElement>("[data-cipher]")).map((el, n) => {
      delete el.dataset.cipherText;
      return decrypt(el, { delay: n * 0.25 });
    });
    return () => cancels.forEach((c) => c());
  }, [cipherKey]);
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
                    <input type="checkbox" className="h-4 w-4 accent-[var(--color-teal-500)]" checked={highlights.has(i)}
                      aria-label={`${x.highlight}: ${x.word(i + 1)}`} onChange={(e) => toggle("highlights", i, e.target.checked)} />
                    {x.highlight}
                  </label>
                  <label className="flex shrink-0 items-center gap-1.5 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--color-teal-500)]" checked={ciphers.has(i)}
                      aria-label={`${x.cipher}: ${x.word(i + 1)}`} onChange={(e) => toggle("ciphers", i, e.target.checked)} />
                    {x.cipher}
                  </label>
                  <button type="button" className="btn btn-secondary !px-3" disabled={l.words.length <= 1}
                    onClick={() => removeWord(i)} aria-label={`${h.removeItem}: ${x.word(i + 1)}`}>×</button>
                </li>
              ))}
            </ol>
            <button type="button" className="btn btn-secondary mt-2" disabled={l.words.length >= MAX_WORDS}
              onClick={() => setL({ words: [...l.words, ""] })}>+ {x.addWord}</button>
          </fieldset>
          <fieldset>
            <legend className="font-medium">{x.visuals}</legend>
            <p className="text-sm text-muted">{x.visualsHint}</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              {(["network", "globe", "logo"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--color-teal-500)]" checked={v[k]}
                    onChange={(e) => onChange({ ...hero, visuals: { ...v, [k]: e.target.checked } })} />
                  {x.layers[k]}
                </label>
              ))}
            </div>
            <label htmlFor="hr-globe-size" className="mt-3 block text-sm">{x.globeSize}: <span className="font-mono">{globeSize} %</span></label>
            <input id="hr-globe-size" type="range" min={20} max={100} step={5} value={globeSize} disabled={!v.globe}
              className="w-full accent-[var(--color-teal-500)] disabled:opacity-50"
              onChange={(e) => onChange({ ...hero, visuals: { ...v, globeSize: BigInt(e.target.value) } })} />
            <label htmlFor="hr-logo-place" className="mt-3 block text-sm">{x.logoPlacement}</label>
            <select id="hr-logo-place" value={v.logoInGlobe ? "globe" : "column"} disabled={!v.globe || !v.logo}
              className="mt-1 w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 disabled:opacity-50"
              onChange={(e) => onChange({ ...hero, visuals: { ...v, logoInGlobe: e.target.value === "globe" } })}>
              <option value="column">{x.logoPlaces.column}</option>
              <option value="globe">{x.logoPlaces.globe}</option>
            </select>
            <label htmlFor="hr-logo-depth" className="mt-3 block text-sm">{x.logoDepth}: <span className="font-mono">{Number(v.logoDepth)} %</span></label>
            <input id="hr-logo-depth" type="range" min={0} max={50} step={1} value={Number(v.logoDepth)} disabled={!v.globe || !v.logo || !v.logoInGlobe}
              className="w-full accent-[var(--color-teal-500)] disabled:opacity-50"
              onChange={(e) => onChange({ ...hero, visuals: { ...v, logoDepth: BigInt(e.target.value) } })} />
            <p className="mt-3 text-sm">{x.beacon}</p>
            <div className="mt-1 flex flex-wrap items-end gap-3">
              {(["lat", "lon"] as const).map((k) => (
                <label key={k} className="text-sm">
                  <span className="text-muted">{x.beaconAxis[k]}</span>
                  <input type="number" step="0.0001" min={k === "lat" ? -90 : -180} max={k === "lat" ? 90 : 180} value={v.beacon[k]} disabled={!v.globe}
                    className="mt-1 block w-32 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 disabled:opacity-50"
                    onChange={(e) => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) onChange({ ...hero, visuals: { ...v, beacon: { ...v.beacon, [k]: n } } }); }} />
                </label>
              ))}
              <button type="button" className="btn btn-secondary px-3 py-1.5 text-sm" disabled={!v.globe}
                onClick={async () => {
                  const r = await actor.getContactInfo();
                  const c = r.__kind__ === "ok" ? r.ok : null;
                  const at = c?.mapLat !== undefined && c?.mapLon !== undefined ? { lat: c.mapLat, lon: c.mapLon } : { lat: 57.6554, lon: 12.0138 };
                  onChange({ ...hero, visuals: { ...v, beacon: at } });
                }}>{x.beaconFromContact}</button>
            </div>
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
            <p ref={previewRef} className="mt-2 font-display text-3xl font-bold uppercase leading-tight">
              {l.words.map((w, i) => (
                <span key={`${i}-${w}`} className="block"><span data-cipher={ciphers.has(i) ? "" : undefined} className={highlights.has(i) ? "text-gradient" : ""}>{w || "…"}</span></span>
              ))}
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
