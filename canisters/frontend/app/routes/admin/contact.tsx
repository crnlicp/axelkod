import { useEffect, useMemo, useState } from "react";
import type { ContactInfo, PublicContact } from "../../bindings/backend";
import { errMessage, type BackendErr } from "../../admin/result";
import { useAdmin } from "../../admin/session";
import { ContactDetails } from "../../components/ContactDetails";

type TextField = "email" | "phone" | "street" | "postalCode" | "city" | "orgNumber";
const fields: Array<{ key: TextField; label: string; hint?: string; type?: string; max: number }> = [
  { key: "email", label: "E-post", type: "email", max: 254, hint: "Lämna tomt för att dölja." },
  { key: "phone", label: "Telefon", type: "tel", max: 40 },
  { key: "street", label: "Gatuadress", max: 100 },
  { key: "postalCode", label: "Postnummer", max: 20 },
  { key: "city", label: "Ort", max: 60 },
  { key: "orgNumber", label: "Org.nr", max: 20 },
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
  };
}

// Empty optional fields are sent as absent, not as "".
function normalise(c: ContactInfo): ContactInfo {
  const opt = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  return { ...c, email: c.email.trim(), city: c.city.trim(), phone: opt(c.phone), street: opt(c.street), postalCode: opt(c.postalCode), orgNumber: opt(c.orgNumber) };
}

export default function ContactSettings() {
  const { actor } = useAdmin();
  const [saved, setSaved] = useState<ContactInfo | null>(null);
  const [form, setForm] = useState<ContactInfo | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void actor.getContactInfo().then((r) => {
      if (r.__kind__ === "ok") { setSaved(r.ok); setForm(r.ok); }
      else setStatus({ ok: false, text: errMessage(r.err as BackendErr) });
    });
  }, [actor]);

  const dirty = useMemo(() => !!form && !!saved && JSON.stringify(normalise(form)) !== JSON.stringify(normalise(saved)), [form, saved]);

  if (!form) return <p role="status">{status?.text ?? "Laddar…"}</p>;

  const set = <K extends keyof ContactInfo>(k: K, v: ContactInfo[K]) => {
    setForm({ ...form, [k]: v });
    if (invalid === k) setInvalid(null);
    setStatus(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const r = await actor.setContactInfo(normalise(form));
      if (r.__kind__ === "ok") {
        setSaved(r.ok); setForm(r.ok); setInvalid(null);
        setStatus({ ok: true, text: "Sparat. Ändringen syns direkt på webbplatsen." });
      } else {
        const err = r.err as BackendErr;
        setInvalid(err.invalid ?? null);
        setStatus({ ok: false, text: errMessage(err) });
      }
    } catch (e) {
      setStatus({ ok: false, text: `Kunde inte spara: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-md border border-[var(--input-border)] bg-bg px-3 py-2 aria-[invalid=true]:border-[var(--error)]";
  return (
    <div>
      <h1 className="text-4xl uppercase">Kontaktuppgifter</h1>
      <p className="mt-2 text-muted">Visas i kontaktsektionen och sidfoten på webbplatsen (båda språken).</p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form onSubmit={save} className="card space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`ci-${f.key}`} className="block font-medium">{f.label}{f.key === "city" ? " *" : ""}</label>
                <input id={`ci-${f.key}`} type={f.type ?? "text"} maxLength={f.max} className={input}
                  value={(form[f.key] as string | undefined) ?? ""} onChange={(e) => set(f.key, e.target.value)}
                  aria-invalid={invalid === f.key} aria-describedby={f.hint ? `ci-${f.key}-hint` : undefined} />
                {f.hint && <p id={`ci-${f.key}-hint`} className="mt-1 text-sm text-muted">{f.hint}</p>}
              </div>
            ))}
          </div>
          <fieldset className="space-y-2">
            <legend className="font-medium">Synlighet</legend>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="h-5 w-5 accent-[var(--color-teal-700)]" checked={form.showPhone} onChange={(e) => set("showPhone", e.target.checked)} />
              Visa telefonnummer
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="h-5 w-5 accent-[var(--color-teal-700)]" checked={form.showAddress} onChange={(e) => set("showAddress", e.target.checked)} />
              Visa gatuadress och postnummer
            </label>
          </fieldset>
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>{busy ? "Sparar…" : "Spara"}</button>
            {dirty && <button type="button" className="btn btn-secondary" onClick={() => { setForm(saved); setInvalid(null); setStatus(null); }}>Ångra ändringar</button>}
            <p role="status" aria-live="polite" className={status && !status.ok ? "text-[var(--error)]" : "text-muted"}>
              {status?.text ?? (dirty ? "Osparade ändringar." : "")}
            </p>
          </div>
        </form>
        <section aria-labelledby="preview-title">
          <h2 id="preview-title" className="text-lg font-semibold">Förhandsvisning</h2>
          <div className="mt-2" data-testid="contact-preview">
            <ContactDetails lang="sv" contact={toPublic(form)} />
          </div>
        </section>
      </div>
    </div>
  );
}
