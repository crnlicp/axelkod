import { Principal } from "@icp-sdk/core/principal";
import { useCallback, useEffect, useState } from "react";
import type { AdminView, SiteSettings } from "../../bindings/backend";
import { errMessage, type BackendErr } from "../../admin/result";
import { useAdmin } from "../../admin/session";

type Status = { ok: boolean; text: string } | null;
const input = "mt-1 w-full rounded-md border border-[var(--input-border)] bg-bg px-3 py-2";

function SiteForm() {
  const { actor } = useAdmin();
  const [form, setForm] = useState<{ months: string; sv: string; en: string } | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const fill = (s: SiteSettings) => setForm({ months: String(s.retentionMonths), sv: s.responseTime.sv, en: s.responseTime.en });
  useEffect(() => {
    void actor.getSiteSettings().then((r) => (r.__kind__ === "ok" ? fill(r.ok) : setStatus({ ok: false, text: errMessage(r.err as BackendErr) })));
  }, [actor]);
  if (!form) return <p role="status">{status?.text ?? "Laddar…"}</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const months = Number(form!.months);
    if (!Number.isInteger(months) || months < 1 || months > 60) return setStatus({ ok: false, text: "Lagringstiden måste vara 1–60 månader." });
    setBusy(true);
    try {
      const r = await actor.setSiteSettings({ retentionMonths: BigInt(months), responseTime: { sv: form!.sv, en: form!.en } });
      if (r.__kind__ === "err") return setStatus({ ok: false, text: errMessage(r.err as BackendErr) });
      fill(r.ok);
      setStatus({ ok: true, text: "Sparat. Ändringen syns direkt på webbplatsen." });
    } catch (err) {
      setStatus({ ok: false, text: `Kunde inte spara: ${err instanceof Error ? err.message : String(err)}` });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="card space-y-4" noValidate aria-labelledby="site-title">
      <h2 id="site-title" className="text-2xl">Webbplats</h2>
      <div>
        <label htmlFor="st-months" className="font-medium">Lagringstid för meddelanden (månader)</label>
        <input id="st-months" type="number" min={1} max={60} className={`${input} max-w-32`} value={form.months}
          onChange={(e) => setForm({ ...form, months: e.target.value })} aria-describedby="st-months-hint" />
        <p id="st-months-hint" className="mt-1 text-sm text-muted">Äldre meddelanden raderas automatiskt en gång per dygn. Visas i integritetspolicyn.</p>
      </div>
      <div>
        <label htmlFor="st-sv" className="font-medium">Svarstid (svenska)</label>
        <input id="st-sv" className={input} maxLength={200} value={form.sv} onChange={(e) => setForm({ ...form, sv: e.target.value })} />
      </div>
      <div>
        <label htmlFor="st-en" className="font-medium">Svarstid (engelska)</label>
        <input id="st-en" className={input} maxLength={200} value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} />
        <p className="mt-1 text-sm text-muted">Visas efter att någon skickat kontaktformuläret.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Sparar…" : "Spara"}</button>
        <p role="status" aria-live="polite" className={status && !status.ok ? "text-[var(--error)]" : "text-muted"}>{status?.text}</p>
      </div>
    </form>
  );
}

function Admins() {
  const { actor, principal: me } = useAdmin();
  const [admins, setAdmins] = useState<AdminView[] | null>(null);
  const [newId, setNewId] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await actor.listAdmins();
    if (r.__kind__ === "ok") setAdmins([...r.ok].sort((a, b) => Number(a.addedAt - b.addedAt)));
    else setStatus({ ok: false, text: errMessage(r.err as BackendErr) });
  }, [actor]);
  useEffect(() => { void load(); }, [load]);

  async function run(text: string, call: () => ReturnType<typeof actor.addAdmin>) {
    setBusy(true);
    try {
      const r = await call();
      if (r.__kind__ === "err") return setStatus({ ok: false, text: errMessage(r.err as BackendErr) });
      setStatus({ ok: true, text });
      await load();
    } catch (err) {
      setStatus({ ok: false, text: `Åtgärden misslyckades: ${err instanceof Error ? err.message : String(err)}` });
    } finally { setBusy(false); }
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    let p: Principal;
    try {
      p = Principal.fromText(newId.trim());
    } catch {
      return setStatus({ ok: false, text: "Ogiltigt ID (principal)." });
    }
    if (p.isAnonymous()) return setStatus({ ok: false, text: "Det anonyma ID:t kan inte bli administratör." });
    void run("Administratören är tillagd.", () => actor.addAdmin(p)).then(() => setNewId(""));
  }

  function remove(p: Principal) {
    const self = p.toText() === me;
    const q = self ? "Ta bort dig själv som administratör? Du förlorar åtkomsten direkt." : `Ta bort ${p.toText()} som administratör?`;
    if (confirm(q)) void run("Administratören är borttagen.", () => actor.removeAdmin(p));
  }

  return (
    <section className="card space-y-4" aria-labelledby="admins-title">
      <h2 id="admins-title" className="text-2xl">Administratörer</h2>
      <p className="text-sm text-muted">
        Nya administratörer loggar in på /admin, kopierar sitt ID från sidan "Åtkomst nekad" och skickar det till dig.
        De får även rätt att publicera SEO-filer på webbplatsen.
      </p>
      <ul className="divide-y divide-[var(--border)]" data-testid="admin-list">
        {admins?.map((a) => (
          <li key={a.principal.toText()} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block break-all font-mono text-sm">{a.principal.toText()}</span>
              <span className="text-sm text-muted">
                Tillagd {new Date(Number(a.addedAt / 1_000_000n)).toLocaleDateString("sv-SE")}
                {a.principal.toText() === me ? " · du" : ""}
              </span>
            </span>
            <button type="button" className="btn btn-secondary" disabled={busy || admins.length <= 1}
              onClick={() => remove(a.principal)} aria-label={`Ta bort ${a.principal.toText()}`}>
              Ta bort
            </button>
          </li>
        ))}
      </ul>
      {admins && admins.length <= 1 && <p className="text-sm text-muted">Den sista administratören kan inte tas bort.</p>}
      <form onSubmit={add} className="flex flex-wrap items-end gap-3" noValidate>
        <div className="min-w-64 flex-1">
          <label htmlFor="new-admin" className="font-medium">Lägg till administratör (ID)</label>
          <input id="new-admin" className={`${input} font-mono`} value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="xxxxx-xxxxx-…-cai" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !newId.trim()}>Lägg till</button>
      </form>
      <p role="status" aria-live="polite" className={status && !status.ok ? "text-[var(--error)]" : "text-muted"}>{status?.text}</p>
    </section>
  );
}

export default function Settings() {
  return (
    <div>
      <h1 className="text-4xl uppercase">Inställningar</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SiteForm />
        <Admins />
      </div>
    </div>
  );
}
