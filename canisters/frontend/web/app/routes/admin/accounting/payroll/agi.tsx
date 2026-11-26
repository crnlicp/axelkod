// Lön › Arbetsgivardeklaration: one return per period from the approved pay runs (V7).
// The XML is built here after decrypting each payee's personnummer (pii-v1).
import { useCallback, useEffect, useMemo, useState } from "react";
import { RunStatus, type AgiReturn, type Employee, type RunSummary } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { agiDue } from "../../../../admin/accounting/deadlines";
import { canPayroll, agiXml, decryptPii } from "../../../../admin/accounting/payroll";
import { saveFile } from "../../../../admin/accounting/pdf/client";
import { SectionTabs, payrollTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, PageHead, StatusChip, fmtTime, input, label } from "../../../../admin/accounting/ui/kit";
import { useAdminLang } from "../../../../admin/i18n";
import { Toast } from "../../../../admin/toast";

const lastPeriods = (n: number) => {
  const [y, m] = today().split("-").map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`; });
};

export default function Agi() {
  const t = useAccT();
  const x = t.payroll.agi;
  const err = useErr();
  const { acc, role, data } = useAcc();
  const { t: at } = useAdminLang();
  const [returns, setReturns] = useState<AgiReturn[] | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [period, setPeriod] = useState(lastPeriods(2)[1]);
  const [contact, setContact] = useState({ name: "", phone: data?.company?.phone ?? "", email: data?.company?.email ?? "" });
  const [receipt, setReceipt] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: t.payroll.title, to: "/admin/accounting/payroll" }, { label: t.payroll.tabs.agi }]);
  const load = useCallback(async () => {
    const [a, r, e] = await Promise.all([acc.listAgiReturns(), acc.listPayRuns(), acc.listEmployees()]);
    setReturns(ok(a)); setRuns(ok(r)); setEmployees(ok(e));
  }, [acc]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);
  const can = canPayroll(role);
  const periodRuns = useMemo(() => runs.filter((r) => r.period === period && r.status !== RunStatus.draft), [runs, period]);

  async function run(f: () => Promise<unknown>, text: string) {
    try { await f(); setStatus({ ok: true, text }); await load(); } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }

  async function download(a: AgiReturn) {
    try {
      if (!data?.company) throw new Error(t.errors.fields.company);
      const payees = await Promise.all(a.individuals.map(async (i) => {
        const e = employees.find((v) => v.id === i.employeeId);
        if (!e) throw new Error(`#${i.employeeId}`);
        return { employeeId: e.id, personnummer: await decryptPii(acc, e.personnummerEnc), street: e.workplaceStreet ?? data.company!.street, city: e.workplaceCity ?? data.company!.city };
      }));
      const xml = agiXml(data.company, contact, a, payees, new Date());
      saveFile(new Blob([xml], { type: "application/xml" }), `arbetsgivardeklaration-${a.period}.xml`);
    } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }

  const contactOk = contact.name.trim() && contact.phone.trim() && contact.email.trim();
  return (
    <>
      <PageHead title={t.payroll.title}><SectionTabs {...payrollTabs(t.payroll)} /></PageHead>
      <p className="mb-4 text-sm text-muted">{x.intro}</p>
      {can && (
        <div className="card mb-6 grid gap-4 sm:grid-cols-4">
          <div><label htmlFor="agi-period" className={label}>{x.period}</label>
            <select id="agi-period" className={input} value={period} onChange={(e) => setPeriod(e.target.value)}>
              {lastPeriods(13).map((p) => <option key={p} value={p}>{p}</option>)}
            </select></div>
          <div className="flex items-end sm:col-span-3">
            <button type="button" className="btn btn-primary" disabled={returns?.some((r) => r.period === period)}
              onClick={() => void run(async () => ok(await acc.createAgiReturn(period)), x.created)}>{periodRuns.length ? x.create : x.zero}</button>
          </div>
          <div><label htmlFor="agi-name" className={label}>{x.contact}</label><input id="agi-name" className={input} maxLength={50} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></div>
          <div><label htmlFor="agi-phone" className={label}>{x.phone}</label><input id="agi-phone" className={input} maxLength={20} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
          <div className="sm:col-span-2"><label htmlFor="agi-email" className={label}>{x.email}</label><input id="agi-email" type="email" className={input} maxLength={254} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></div>
          <p className="text-sm sm:col-span-4">{x.fileIntro}</p>
        </div>
      )}
      {!returns ? <p role="status">{t.common.loading}</p> : returns.length === 0 ? <EmptyState text={x.empty} /> : (
        <ul className="space-y-3">
          {returns.map((a) => {
            const [y, m] = [Number(a.period.slice(0, 4)), Number(a.period.slice(4))];
            return (
              <li key={String(a.id)} className="card space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">{a.period}</h2>
                  <StatusChip tone={a.filedAt !== undefined ? "good" : "warn"}>{a.filedAt !== undefined ? `${x.filed} ${fmtTime(a.filedAt, at.locale)}` : x.notFiled}</StatusChip>
                </div>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted">{x.fees}</dt><dd>{a.sumFees.toLocaleString("sv-SE")} kr</dd>
                  <dt className="text-muted">{x.tax}</dt><dd>{a.sumTax.toLocaleString("sv-SE")} kr</dd>
                  <dt className="text-muted">{x.payees}</dt><dd>{a.individuals.length}</dd>
                  <dt className="text-muted">{x.due}</dt><dd>{agiDue(y, m)}</dd>
                  {a.receiptRef && <><dt className="text-muted">{x.receipt}</dt><dd>{a.receiptRef}</dd></>}
                </dl>
                <div className="flex flex-wrap items-end gap-2">
                  <button type="button" className="btn btn-secondary" disabled={!contactOk} onClick={() => void download(a)}>{x.download}<span className="sr-only"> {a.period}</span></button>
                  {can && a.filedAt === undefined && <>
                    <div><label htmlFor={`agi-r-${a.id}`} className="text-sm text-muted">{x.receipt}<span className="sr-only"> {a.period}</span></label>
                      <input id={`agi-r-${a.id}`} className={input} maxLength={100} value={receipt[String(a.id)] ?? ""} onChange={(e) => setReceipt({ ...receipt, [String(a.id)]: e.target.value })} /></div>
                    <button type="button" className="btn btn-primary" onClick={() => void run(async () => ok(await acc.markAgiFiled(a.id, receipt[String(a.id)]?.trim() || null)), x.filedDone)}>{x.markFiled}<span className="sr-only"> {a.period}</span></button>
                  </>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Toast status={status} />
    </>
  );
}
