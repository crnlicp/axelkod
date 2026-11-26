// First-run setup wizard. Each step's state lives in the canister, so it can be
// paused and resumed; a step is done when its data exists.
import { useContext, useEffect, useState } from "react";
import { Link } from "react-router";
import { Role, type CompanyProfile, type RoleView } from "../../../bindings/accounting";
import { ok } from "../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../admin/accounting/context";
import { useCrumbs } from "../../../admin/accounting/crumbs";
import { CompanyForm, SettingsForm, UsersPanel, YearsPanel } from "../../../admin/accounting/forms";
import { Stepper, type Step } from "../../../admin/accounting/ui/Stepper";
import { PageHead, input, label } from "../../../admin/accounting/ui/kit";
import { AdminCtx } from "../../../admin/session";
import { Toast } from "../../../admin/toast";

const KEYS = ["company", "year", "method", "chart", "opening", "bank", "roles", "checklist"] as const;
type Key = (typeof KEYS)[number];

export default function Setup() {
  const t = useAccT();
  const s = t.setup;
  const err = useErr();
  const ctx = useAcc();
  const { acc, data, href, isOwner } = ctx;
  const site = useContext(AdminCtx);
  const [current, setCurrent] = useState<Key>("company");
  const [prefill, setPrefill] = useState<Partial<CompanyProfile> | undefined>(undefined);
  const [roles, setRoles] = useState<RoleView[] | null>(null);
  const [methodSaved, setMethodSaved] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useCrumbs([{ label: s.title }]);

  // Prefill from the website's contact details (site admins only), once.
  useEffect(() => {
    if (!site || data?.company) return;
    void site.actor.getContactInfo().then((r) => {
      if (r.__kind__ !== "ok") return;
      const c = r.ok;
      const org = c.orgNumber ?? "";
      setPrefill({ legalName: "Axelkod AB", orgNr: org, vatNr: org ? `SE${org.replace(/\D/g, "")}01` : "", street: c.street ?? "", postalCode: c.postalCode ?? "", city: c.city, registeredOffice: c.city, email: c.email, phone: c.phone });
    }).catch(() => {});
  }, [site, data?.company]);

  useEffect(() => { if (isOwner) void acc.listRoles().then((r) => setRoles(ok(r))).catch(() => {}); }, [acc, isOwner, current]);

  const done: Record<Key, boolean> = {
    company: !!data?.company,
    year: (data?.years.length ?? 0) > 0,
    method: methodSaved,
    chart: (data?.accounts.length ?? 0) > 0,
    opening: false,
    bank: false,
    roles: (roles?.filter((r) => r.role === Role.owner).length ?? 0) >= 2,
    checklist: !!data?.settings.storageNotice,
  };
  const later: Key[] = ["opening", "bank"];
  const steps: Step[] = KEYS.map((k) => ({ key: k, title: s.steps[k], state: k === current ? "current" : done[k] ? "done" : later.includes(k) ? "later" : "todo" }));
  const idx = KEYS.indexOf(current);
  const next = () => setCurrent(KEYS[Math.min(KEYS.length - 1, idx + 1)]);
  const saved = (text: string) => { setStatus({ ok: true, text }); next(); };

  if (!isOwner) return <p className="card">{t.errors.notAuthorized}</p>;

  return (
    <>
      <PageHead title={s.title}><p className="text-muted">{s.lead}</p></PageHead>
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label={s.title}><Stepper steps={steps} onSelect={(k) => setCurrent(k as Key)} /></nav>
        <section aria-labelledby="step-h" className="min-w-0 space-y-4">
          <p className="text-sm text-muted">{s.stepOf(idx + 1, KEYS.length)}</p>
          <h2 id="step-h" className="text-3xl">{s.steps[current]}</h2>
          {current === "company" && <>
            {prefill && !data?.company && <p className="text-sm text-muted">{s.prefilled}</p>}
            <CompanyForm key={prefill ? "p" : "e"} prefill={prefill} onSaved={saved} />
          </>}
          {current === "year" && <YearsPanel heading={false} onCreated={saved} />}
          {current === "method" && <SettingsForm modules onSaved={(m) => { setMethodSaved(true); saved(m); }} />}
          {current === "chart" && <div className="card space-y-3"><p>{s.chartLead(data?.accounts.length ?? 0)}</p>
            <Link to={href("/admin/accounting/settings/chart")}>{t.settings.tabs.chart}</Link></div>}
          {current === "opening" && <div className="card space-y-3"><p>{s.openingLead}</p><p className="text-muted">{s.later}</p>
            <Link to={href("/admin/accounting/year-end/opening")}>{s.openingLink}</Link></div>}
          {current === "bank" && <div className="card space-y-3"><p>{s.bankLead}</p><p className="text-muted">{s.later}</p></div>}
          {current === "roles" && <><p className="card">{s.rolesLead}</p><UsersPanel /></>}
          {current === "checklist" && <Checklist onError={(e) => err(e)} />}
          <div className="flex flex-wrap gap-3">
            {idx > 0 && <button type="button" className="btn btn-secondary" onClick={() => setCurrent(KEYS[idx - 1])}>{t.common.back}</button>}
            {idx < KEYS.length - 1
              ? <button type="button" className="btn btn-secondary" onClick={next}>{t.common.next}</button>
              : <Link to={href("/admin/accounting")} className="btn btn-primary">{s.finish}</Link>}
          </div>
        </section>
      </div>
      <Toast status={status} />
    </>
  );
}

/** Records when and where the storage location was reported to Skatteverket (C22). */
function Checklist({ onError }: { onError: (e: unknown) => string }) {
  const t = useAccT();
  const s = t.setup;
  const { acc, data, reload } = useAcc();
  const n = data?.settings.storageNotice;
  const [f, setF] = useState({ date: n?.date ?? "", location: n?.location ?? "" });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    try {
      ok(await acc.setSettings({ ...data.settings, storageNotice: { date: f.date, location: f.location } }));
      await reload();
      setStatus({ ok: true, text: t.settings.accounting.saved });
    } catch (e2) { setStatus({ ok: false, text: onError(e2) }); }
  }
  return (
    <form onSubmit={save} className="card space-y-4">
      <p>{s.checklistLead}</p>
      <div>
        <label htmlFor="sn-date" className={label}>{s.storageDate}</label>
        <input id="sn-date" type="date" className={`${input} max-w-48`} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </div>
      <div>
        <label htmlFor="sn-loc" className={label}>{s.storageLocation}</label>
        <textarea id="sn-loc" rows={3} maxLength={500} className={input} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={!f.date || !f.location.trim()}>{t.common.save}</button>
      <Toast status={status} />
    </form>
  );
}
