import { useEffect, useMemo, useState } from "react";
import type { ContactInfo, PublicContact } from "../../bindings/site";
import { errMessage, type BackendErr } from "../../admin/result";
import { useAdminLang } from "../../admin/i18n";
import { mapSnapshot } from "../../admin/map";
import { uploadImage } from "../../admin/publish";
import { useAdmin } from "../../admin/session";
import { Toast } from "../../admin/toast";
import { ContactDetails } from "../../components/ContactDetails";

type TextField = "email" | "phone" | "street" | "postalCode" | "city" | "orgNumber";
const fields: Array<{ key: TextField; hint?: boolean; type?: string; max: number }> = [
  { key: "email", type: "email", max: 254, hint: true },
  { key: "phone", type: "tel", max: 40 },
  { key: "street", max: 100 },
  { key: "postalCode", max: 20 },
  { key: "city", max: 60 },
  { key: "orgNumber", max: 20 },
];

// Same rule as the canister's publicContact: hidden fields are left out.
function toPublic(c: ContactInfo): PublicContact {
  return {
    email: c.email || undefined,
    phone: c.showPhone ? c.phone || undefined : undefined,
    street: c.showAddress ? c.street || undefined : undefined,
    postalCode: c.showAddress ? c.postalCode || undefined : undefined,
    city: c.city,
    orgNumber: c.orgNumber || undefined,
    mapUrl: c.mapUrl,
    mapLat: c.mapLat,
    mapLon: c.mapLon,
  };
}

const coordText = (v?: number) => (v === undefined ? "" : String(v));
/** "" -> undefined, else a finite number within ±limit (null when invalid). */
function parseCoord(v: string, limit: number): number | undefined | null {
  const s = v.trim().replace(",", ".");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

// Empty optional fields are sent as absent, not as "".
function normalise(c: ContactInfo): ContactInfo {
  const opt = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  return { ...c, email: c.email.trim(), city: c.city.trim(), phone: opt(c.phone), street: opt(c.street), postalCode: opt(c.postalCode), orgNumber: opt(c.orgNumber) };
}

export default function ContactSettings() {
  const { actor, identity } = useAdmin();
  const { t, lang } = useAdminLang();
  const x = t.contact;
  const [saved, setSaved] = useState<ContactInfo | null>(null);
  const [form, setForm] = useState<ContactInfo | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  useEffect(() => {
    void actor.getContactInfo().then((r) => {
      if (r.__kind__ === "ok") { setSaved(r.ok); setForm(r.ok); setLat(coordText(r.ok.mapLat)); setLon(coordText(r.ok.mapLon)); }
      else setStatus({ ok: false, text: errMessage(r.err as BackendErr, t) });
    });
  }, [actor]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(
    () => !!form && !!saved && (JSON.stringify(normalise(form)) !== JSON.stringify(normalise(saved)) || lat !== coordText(saved.mapLat) || lon !== coordText(saved.mapLon)),
    [form, saved, lat, lon],
  );

  if (!form) return <p role="status">{status?.text ?? t.loading}</p>;

  const set = <K extends keyof ContactInfo>(k: K, v: ContactInfo[K]) => {
    setForm({ ...form, [k]: v });
    if (invalid === k) setInvalid(null);
    setStatus(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const la = parseCoord(lat, 90), lo = parseCoord(lon, 180);
    if (la === null || lo === null || (la === undefined) !== (lo === undefined)) {
      setInvalid("map");
      return setStatus({ ok: false, text: x.mapBoth });
    }
    setBusy(true);
    try {
      let next: ContactInfo = { ...form, mapLat: la, mapLon: lo, mapUrl: la === undefined ? undefined : form.mapUrl };
      // A new snapshot whenever the coordinates change (or none exists yet).
      if (la !== undefined && lo !== undefined && (la !== saved?.mapLat || lo !== saved?.mapLon || !form.mapUrl)) {
        setStatus({ ok: true, text: x.mapMaking });
        try {
          next = { ...next, mapUrl: await uploadImage(identity, await mapSnapshot(la, lo), "map", t) };
        } catch (e) {
          return setStatus({ ok: false, text: x.mapFailed(e instanceof Error ? e.message : String(e)) });
        }
      }
      const r = await actor.setContactInfo(normalise(next));
      if (r.__kind__ === "ok") {
        setSaved(r.ok); setForm(r.ok); setInvalid(null); setLat(coordText(r.ok.mapLat)); setLon(coordText(r.ok.mapLon));
        setStatus({ ok: true, text: t.savedLive });
      } else {
        const err = r.err as BackendErr;
        setInvalid(err.invalid ?? null);
        setStatus({ ok: false, text: errMessage(err, t) });
      }
    } catch (e) {
      setStatus({ ok: false, text: t.saveFailed(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-md border border-[var(--input-border)] bg-bg px-3 py-2 aria-[invalid=true]:border-[var(--error)]";
  return (
    <div>
      <h1 className="text-4xl uppercase">{x.title}</h1>
      <p className="mt-2 text-muted">{x.intro}</p>
      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form onSubmit={save} className="card space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`ci-${f.key}`} className="block font-medium">{x[f.key]}{f.key === "city" ? " *" : ""}</label>
                <input id={`ci-${f.key}`} type={f.type ?? "text"} maxLength={f.max} className={input}
                  value={(form[f.key] as string | undefined) ?? ""} onChange={(e) => set(f.key, e.target.value)}
                  aria-invalid={invalid === f.key} aria-describedby={f.hint ? `ci-${f.key}-hint` : undefined} />
                {f.hint && <p id={`ci-${f.key}-hint`} className="mt-1 text-sm text-muted">{x.emailHint}</p>}
              </div>
            ))}
          </div>
          <fieldset className="space-y-2">
            <legend className="font-medium">{x.visibility}</legend>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="h-5 w-5 accent-[var(--color-teal-700)]" checked={form.showPhone} onChange={(e) => set("showPhone", e.target.checked)} />
              {x.showPhone}
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="h-5 w-5 accent-[var(--color-teal-700)]" checked={form.showAddress} onChange={(e) => set("showAddress", e.target.checked)} />
              {x.showAddress}
            </label>
          </fieldset>
          <fieldset className="space-y-2" aria-describedby="ci-map-hint">
            <legend className="font-medium">{x.map}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ci-lat" className="block text-sm">{x.lat}</label>
                <input id="ci-lat" inputMode="decimal" className={input} value={lat} placeholder="57.6554" aria-invalid={invalid === "map"}
                  onChange={(e) => { setLat(e.target.value); setStatus(null); if (invalid === "map") setInvalid(null); }} />
              </div>
              <div>
                <label htmlFor="ci-lon" className="block text-sm">{x.lon}</label>
                <input id="ci-lon" inputMode="decimal" className={input} value={lon} placeholder="12.0138" aria-invalid={invalid === "map"}
                  onChange={(e) => { setLon(e.target.value); setStatus(null); if (invalid === "map") setInvalid(null); }} />
              </div>
            </div>
            <p id="ci-map-hint" className="text-sm text-muted">{x.mapHint}</p>
            {(lat || lon) && (
              <button type="button" className="btn btn-secondary" onClick={() => { setLat(""); setLon(""); setStatus(null); }}>{x.removeMap}</button>
            )}
          </fieldset>
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>{busy ? t.saving : t.save}</button>
            {dirty && <button type="button" className="btn btn-secondary" onClick={() => { setForm(saved); setLat(coordText(saved?.mapLat)); setLon(coordText(saved?.mapLon)); setInvalid(null); setStatus(null); }}>{t.undo}</button>}
            <Toast status={status} />
            {dirty && <p className="text-muted">{t.unsaved}</p>}
          </div>
        </form>
        {/* The label sits above the card on wide screens so both cards share a top edge. */}
        <section aria-labelledby="preview-title" className="relative">
          <h2 id="preview-title" className="mb-2 text-lg font-semibold lg:absolute lg:-top-8 lg:mb-0">{t.preview}</h2>
          <div data-testid="contact-preview">
            <ContactDetails lang={lang} contact={toPublic(form)} />
          </div>
        </section>
      </div>
    </div>
  );
}
