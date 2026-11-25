// Forms shared by Inställningar and the setup wizard. Owners edit; others see read-only.
import { Principal } from "@icp-sdk/core/principal";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  FiscalYearStatus, Role, Variant_cash_invoice, Variant_en_sv, Variant_month_quarter_year,
  type AccountingSettings, type CompanyProfile, type RoleView,
} from "../../bindings/accounting";
import { errField, ok } from "./api";
import { today, useAcc, useAccT, useErr } from "./context";
import { ConfirmPost } from "./ui/ConfirmPost";
import { DataTable } from "./ui/DataTable";
import { StatusChip, fmtTime, input, label } from "./ui/kit";
import { useAdminLang } from "../i18n";
import { Toast } from "../toast";

type Status = { ok: boolean; text: string } | null;

function Field({ id, text, hint, children, bad }: { id: string; text: string; hint?: string; children: ReactNode; bad?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-sm text-muted">{hint}</p>}
      {bad && <span className="sr-only">{text}</span>}
    </div>
  );
}

const EMPTY: CompanyProfile = {
  legalName: "", orgNr: "", vatNr: "", registeredOffice: "", street: "", postalCode: "", city: "", country: "SE", email: "", fSkatt: true,
};

/** Company legal profile (C6). */
export function CompanyForm({ prefill, onSaved }: { prefill?: Partial<CompanyProfile>; onSaved?: (message: string) => void }) {
  const t = useAccT();
  const x = t.settings.company;
  const err = useErr();
  const { acc, data, reload, isOwner } = useAcc();
  const [f, setF] = useState<CompanyProfile>({ ...EMPTY, ...prefill, ...(data?.company ?? {}) });
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const set = (k: keyof CompanyProfile, v: string | boolean) => setF((c) => {
    const n = { ...c, [k]: v } as CompanyProfile;
    // The VAT number follows the org nr (SE + 10 digits + 01) until edited by hand.
    if (k === "orgNr" && (!c.vatNr || c.vatNr === `SE${c.orgNr.replace(/\D/g, "")}01`)) n.vatNr = `SE${String(v).replace(/\D/g, "")}01`;
    return n;
  });
  const opt = (v?: string) => (v?.trim() ? v.trim() : undefined);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setBad(null);
    try {
      const clean: CompanyProfile = {
        ...f, phone: opt(f.phone), web: opt(f.web), bankgiro: opt(f.bankgiro), plusgiro: opt(f.plusgiro), iban: opt(f.iban), bic: opt(f.bic), peppolId: opt(f.peppolId),
      };
      const saved = ok(await acc.setCompany(clean));
      setF(saved);
      await reload();
      // A wizard moves on after saving, so it shows the message itself.
      if (onSaved) onSaved(x.saved); else setStatus({ ok: true, text: x.saved });
    } catch (e2) {
      setBad(errField(e2));
      setStatus({ ok: false, text: err(e2) });
    } finally { setBusy(false); }
  }

  const text = (k: keyof CompanyProfile, req = true, extra: Record<string, unknown> = {}) => (
    <Field id={`co-${k}`} text={`${x[k as keyof typeof x] as string}${req ? "" : ` (${t.common.optional})`}`} bad={bad === k}
      hint={k === "vatNr" ? x.vatNrHint : undefined}>
      <input id={`co-${k}`} className={input} value={(f[k] as string | undefined) ?? ""} disabled={!isOwner} required={req}
        aria-invalid={bad === k || undefined} aria-describedby={k === "vatNr" ? "co-vatNr-hint" : undefined}
        onChange={(e) => set(k, e.target.value)} {...extra} />
    </Field>
  );

  return (
    <form onSubmit={save} noValidate className="card space-y-4">
      {!isOwner && <p className="text-sm text-muted">{x.ownerOnly}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {text("legalName")}{text("orgNr", true, { inputMode: "numeric", placeholder: "556677-8899" })}
        {text("vatNr")}{text("registeredOffice")}
        {text("street")}{text("postalCode")}
        {text("city")}{text("country", true, { maxLength: 2 })}
        {text("email", true, { type: "email" })}{text("phone", false, { type: "tel" })}
        {text("web", false)}{text("bankgiro", false)}
        {text("plusgiro", false)}{text("iban", false)}
        {text("bic", false)}{text("peppolId", false)}
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={f.fSkatt} disabled={!isOwner} onChange={(e) => set("fSkatt", e.target.checked)} className="h-4 w-4" />
        {x.fSkatt}
      </label>
      {isOwner && <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t.common.saving : t.common.save}</button>}
      <Toast status={status} />
    </form>
  );
}

/** Method, VAT period, terms, language and module toggles (D7). */
export function SettingsForm({ onSaved, modules = true }: { onSaved?: (message: string) => void; modules?: boolean }) {
  const t = useAccT();
  const x = t.settings.accounting;
  const err = useErr();
  const { acc, data, reload, isOwner } = useAcc();
  const [s, setS] = useState<AccountingSettings | null>(data?.settings ?? null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  if (!s) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      ok(await acc.setSettings(s!));
      await reload();
      if (onSaved) onSaved(x.saved); else setStatus({ ok: true, text: x.saved });
    } catch (e2) { setStatus({ ok: false, text: err(e2) }); } finally { setBusy(false); }
  }

  const radio = <T extends string>(name: string, legend: string, value: T, opts: [T, string][], on: (v: T) => void) => (
    <fieldset>
      <legend className={label}>{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-4">
        {opts.map(([v, l]) => (
          <label key={v} className="flex items-center gap-2"><input type="radio" name={name} checked={value === v} disabled={!isOwner} onChange={() => on(v)} /> {l}</label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <form onSubmit={save} className="card space-y-5">
      {radio("method", x.method, s.accountingMethod, [[Variant_cash_invoice.invoice, x.invoice], [Variant_cash_invoice.cash, x.cash]], (v) => setS({ ...s, accountingMethod: v }))}
      {radio("vat", x.vatPeriod, s.vatPeriod, [[Variant_month_quarter_year.month, x.month], [Variant_month_quarter_year.quarter, x.quarter], [Variant_month_quarter_year.year, x.year]], (v) => setS({ ...s, vatPeriod: v }))}
      {radio("lang", x.language, s.defaultLanguage, [[Variant_en_sv.sv, "Svenska"], [Variant_en_sv.en, "English"]], (v) => setS({ ...s, defaultLanguage: v }))}
      <Field id="st-terms" text={x.terms}>
        <input id="st-terms" type="number" min={0} max={365} className={`${input} max-w-32`} disabled={!isOwner} value={String(s.invoiceTermsDays)}
          onChange={(e) => setS({ ...s, invoiceTermsDays: BigInt(Math.max(0, Math.min(365, Number(e.target.value) || 0))) })} />
      </Field>
      {modules && (
        <fieldset>
          <legend className={label}>{x.modules}</legend>
          <div className="mt-1 flex flex-wrap gap-4">
            {(["payroll", "rotRut", "inventory"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={s.modules[k]} disabled={!isOwner} onChange={(e) => setS({ ...s, modules: { ...s.modules, [k]: e.target.checked } })} /> {x[k]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {isOwner && <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t.common.saving : t.common.save}</button>}
      <Toast status={status} />
    </form>
  );
}

/** Fiscal years: list with status, create the next one, move status open ⇄ closing → locked. */
export function YearsPanel({ onCreated, heading = true }: { onCreated?: (message: string) => void; heading?: boolean }) {
  const t = useAccT();
  const x = t.settings.accounting;
  const err = useErr();
  const { acc, data, reload, isOwner } = useAcc();
  const years = data?.years ?? [];
  const last = years.at(-1);
  const nextStart = last ? new Date(Date.parse(last.end) + 86_400_000).toISOString().slice(0, 10) : `${today().slice(0, 4)}-01-01`;
  const endOf = (start: string) => { const [y, m] = start.split("-").map(Number); return new Date(Date.UTC(y + 1, m - 1, 0)).toISOString().slice(0, 10); };
  const [f, setF] = useState({ start: nextStart, end: endOf(nextStart), changeover: false });
  const [status, setStatus] = useState<Status>(null);
  const [lockYear, setLockYear] = useState<bigint | null>(null);
  useEffect(() => setF({ start: nextStart, end: endOf(nextStart), changeover: false }), [nextStart]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      ok(await acc.createFiscalYear(f.start, f.end, f.changeover));
      await reload();
      if (onCreated) onCreated(x.yearCreated); else setStatus({ ok: true, text: x.yearCreated });
    } catch (e2) { setStatus({ ok: false, text: err(e2) }); }
  }
  async function setStatusTo(id: bigint, s: FiscalYearStatus) {
    try { ok(await acc.setFiscalYearStatus(id, s)); await reload(); setLockYear(null); } catch (e2) { setLockYear(null); setStatus({ ok: false, text: err(e2) }); }
  }
  const tone = { open: "good", closing: "warn", locked: "neutral" } as const;

  return (
    <section className="card space-y-4" aria-label={x.years}>
      {heading && <h2 className="text-2xl">{x.years}</h2>}
      {years.length > 0 && (
        <ul className="divide-y divide-border">
          {years.map((y) => (
            <li key={String(y.id)} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>{y.start} – {y.end} <StatusChip tone={tone[y.status]}>{t.status[y.status]}</StatusChip></span>
              {isOwner && y.status !== FiscalYearStatus.locked && (
                <span className="flex gap-2 text-sm">
                  {y.status === FiscalYearStatus.open && <button type="button" className="btn btn-secondary px-3 py-1" onClick={() => void setStatusTo(y.id, FiscalYearStatus.closing)}>{x.toClosing}</button>}
                  {y.status === FiscalYearStatus.closing && <>
                    <button type="button" className="btn btn-secondary px-3 py-1" onClick={() => void setStatusTo(y.id, FiscalYearStatus.open)}>{x.toOpen}</button>
                    <button type="button" className="btn btn-secondary px-3 py-1" onClick={() => setLockYear(y.id)}>{x.toLocked}</button>
                  </>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {isOwner && (
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <h3 className="text-xl sm:col-span-2">{x.newYear}</h3>
          <Field id="fy-start" text={x.start}><input id="fy-start" type="date" className={input} value={f.start} readOnly={!!last} onChange={(e) => setF({ ...f, start: e.target.value, end: endOf(e.target.value) })} /></Field>
          <Field id="fy-end" text={x.end}><input id="fy-end" type="date" className={input} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          {last && <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={f.changeover} onChange={(e) => setF({ ...f, changeover: e.target.checked })} /> {x.changeover}</label>}
          <div className="sm:col-span-2"><button type="submit" className="btn btn-primary">{x.newYear}</button></div>
        </form>
      )}
      <ConfirmPost open={lockYear !== null} onClose={() => setLockYear(null)} onConfirm={() => lockYear !== null && void setStatusTo(lockYear, FiscalYearStatus.locked)}
        busy={false} title={x.toLocked} creates={x.lockYearConfirm} date={years.find((y) => y.id === lockYear)?.end ?? today()} lines={[]} button={x.toLocked} />
      <Toast status={status} />
    </section>
  );
}

export function LockDatePanel() {
  const t = useAccT();
  const x = t.settings.accounting;
  const err = useErr();
  const { acc, data, reload, isOwner } = useAcc();
  const [date, setDate] = useState(data?.lockDate ?? "");
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  async function save() {
    try { ok(await acc.setLockDate(date)); await reload(); setConfirm(false); setStatus({ ok: true, text: x.lockDateSaved }); }
    catch (e) { setConfirm(false); setStatus({ ok: false, text: err(e) }); }
  }
  return (
    <section className="card space-y-3" aria-labelledby="lock-h">
      <h2 id="lock-h" className="text-2xl">{x.lockDate}</h2>
      <p className="text-sm text-muted">{x.lockDateHint}</p>
      <p>{data?.lockDate ?? t.common.none}</p>
      {isOwner && (
        <div className="flex flex-wrap items-end gap-3">
          <Field id="lock-date" text={x.setLockDate}><input id="lock-date" type="date" className={input} max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <button type="button" className="btn btn-secondary" disabled={!date || date === data?.lockDate} onClick={() => setConfirm(true)}>{x.setLockDate}</button>
        </div>
      )}
      <ConfirmPost open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void save()} busy={false} title={x.setLockDate}
        creates={x.lockConfirm(date)} date={date || today()} lines={[]} button={x.setLockDate} />
      <Toast status={status} />
    </section>
  );
}

/** Ekonomi users and roles (owners only); at least one owner is always kept. */
export function UsersPanel() {
  const t = useAccT();
  const x = t.settings.users;
  const err = useErr();
  const { acc, principal: me, isOwner } = useAcc();
  const { t: at } = useAdminLang();
  const [roles, setRoles] = useState<RoleView[] | null>(null);
  const [f, setF] = useState({ id: "", role: Role.bookkeeper as Role });
  const [status, setStatus] = useState<Status>(null);
  const load = useCallback(async () => {
    try { setRoles([...ok(await acc.listRoles())].sort((a, b) => Number(a.addedAt - b.addedAt))); } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }, [acc, err]);
  useEffect(() => { if (isOwner) void load(); }, [load, isOwner]);
  if (!isOwner) return <p className="card text-muted">{t.errors.notAuthorized}</p>;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    let p: Principal;
    try { p = Principal.fromText(f.id.trim()); } catch { return setStatus({ ok: false, text: x.invalidPrincipal }); }
    try {
      const r = ok(await acc.setRole(p, f.role));
      setStatus({ ok: r.mirrored, text: r.mirrored ? x.saved : x.notMirrored });
      setF({ ...f, id: "" });
      await load();
    } catch (e2) { setStatus({ ok: false, text: err(e2) }); }
  }
  async function remove(p: Principal) {
    if (!window.confirm(x.confirmRemove(p.toText()))) return;
    try { const r = ok(await acc.removeRole(p)); setStatus({ ok: r.mirrored, text: r.mirrored ? x.removed : x.notMirrored }); await load(); }
    catch (e) { setStatus({ ok: false, text: err(e) }); }
  }
  async function resync() {
    try { ok(await acc.syncRolesToVault()); setStatus({ ok: true, text: x.resynced }); } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }

  return (
    <section className="space-y-4">
      <p className="text-muted">{x.lead}</p>
      {roles && (
        <DataTable rows={roles} rowKey={(r) => r.principal.toText()} caption={t.settings.tabs.users}
          columns={[
            { key: "p", title: x.principal, render: (r) => <span className="break-all font-mono text-xs">{r.principal.toText()}{r.principal.toText() === me ? ` (${x.you})` : ""}</span> },
            { key: "role", title: x.role, render: (r) => t.role[r.role], value: (r) => t.role[r.role] },
            { key: "added", title: x.added, render: (r) => fmtTime(r.addedAt, at.locale), value: (r) => r.addedAt },
            { key: "rm", title: "", render: (r) => <button type="button" className="text-sm text-muted hover:text-[var(--error)]" onClick={() => void remove(r.principal)}>{t.common.remove}</button> },
          ]} />
      )}
      <form onSubmit={add} className="card grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <h3 className="text-xl sm:col-span-3">{x.addTitle}</h3>
        <Field id="u-id" text={x.principal}><input id="u-id" className={`${input} font-mono text-sm`} value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} /></Field>
        <Field id="u-role" text={x.role}>
          <select id="u-role" className={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {[Role.owner, Role.bookkeeper, Role.payroll, Role.auditor].map((r) => <option key={r} value={r}>{t.role[r]}</option>)}
          </select>
        </Field>
        <button type="submit" className="btn btn-primary">{x.add}</button>
      </form>
      <button type="button" className="text-sm text-muted underline hover:text-fg" onClick={() => void resync()}>{x.resync}</button>
      <Toast status={status} />
    </section>
  );
}

export function ChartTable() {
  const t = useAccT();
  const x = t.settings.chart;
  const { data } = useAcc();
  return (
    <section className="space-y-4">
      <p className="text-muted">{x.lead}</p>
      <DataTable rows={data?.accounts ?? []} rowKey={(a) => String(a.number)} caption={t.settings.tabs.chart} csvName="kontoplan"
        columns={[
          { key: "n", title: t.common.account, render: (a) => String(a.number), value: (a) => a.number },
          { key: "name", title: t.common.name, render: (a) => a.name, value: (a) => a.name },
          { key: "kind", title: x.kind, render: (a) => x.kinds[a.kind], value: (a) => x.kinds[a.kind] },
          { key: "vat", title: x.vat, render: (a) => a.vatCode ?? "", value: (a) => a.vatCode ?? "" },
          { key: "active", title: x.active, render: (a) => (a.active ? t.common.yes : t.common.no), value: (a) => (a.active ? 1 : 0) },
        ]} />
    </section>
  );
}
