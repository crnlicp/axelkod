// Lön › Växa-stöd: refund applications per employee and month after the AGI is filed
// (V9). The canister checks the conditions it knows; the summary PDF is the data the
// e-service asks for.
import { useCallback, useEffect, useState } from "react";
import { VaxaStatus, type AgiReturn, type Employee, type VaxaApplication } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { canPayroll } from "../../../../admin/accounting/payroll";
import { meta } from "../../../../admin/accounting/ledger";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { SectionTabs, payrollTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, PageHead, input, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

export default function Vaxa() {
  const t = useAccT();
  const x = t.payroll.vaxa;
  const err = useErr();
  const ctx = useAcc();
  const { acc, role } = ctx;
  const [rows, setRows] = useState<VaxaApplication[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filed, setFiled] = useState<AgiReturn[]>([]);
  const [pick, setPick] = useState({ period: "", employee: "" });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: t.payroll.title, to: "/admin/accounting/payroll" }, { label: t.payroll.tabs.vaxa }]);
  const load = useCallback(async () => {
    const [v, e, a] = await Promise.all([acc.listVaxa(), acc.listEmployees(), acc.listAgiReturns()]);
    setRows(ok(v));
    const emps = ok(e).filter((x) => x.vaxaFrom !== undefined && !x.ownerOrRelated);
    setEmployees(emps);
    const f = ok(a).filter((r) => r.filedAt !== undefined);
    setFiled(f);
    setPick((p) => ({ period: p.period || f[0]?.period || "", employee: p.employee || (emps[0] ? String(emps[0].id) : "") }));
  }, [acc]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);
  const name = (id: bigint) => employees.find((e) => e.id === id)?.name ?? `#${id}`;
  const can = canPayroll(role);

  async function run(f: () => Promise<unknown>, text: string) {
    try { await f(); setStatus({ ok: true, text }); await load(); } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }

  return (
    <>
      <PageHead title={t.payroll.title}><SectionTabs {...payrollTabs(t.payroll)} /></PageHead>
      <p className="mb-4 text-sm text-muted">{x.intro}</p>
      {can && (
        <form className="card mb-6 flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); void run(async () => ok(await acc.createVaxa(pick.period, BigInt(pick.employee))), x.created); }}>
          <div><label htmlFor="vx-period" className={label}>{x.period}</label>
            <select id="vx-period" className={input} value={pick.period} onChange={(e) => setPick({ ...pick, period: e.target.value })}>
              {filed.map((a) => <option key={a.period} value={a.period}>{a.period}</option>)}
            </select></div>
          <div><label htmlFor="vx-emp" className={label}>{x.employee}</label>
            <select id="vx-emp" className={input} value={pick.employee} onChange={(e) => setPick({ ...pick, employee: e.target.value })}>
              {employees.map((e) => <option key={String(e.id)} value={String(e.id)}>{e.name}</option>)}
            </select></div>
          <button type="submit" className="btn btn-primary" disabled={!pick.period || !pick.employee}>{x.create}</button>
        </form>
      )}
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(v) => String(v.id)} caption={t.payroll.tabs.vaxa} empty={<EmptyState text={x.empty} />}
          columns={[
            { key: "p", title: x.period, render: (v) => v.period, value: (v) => v.period },
            { key: "e", title: x.employee, render: (v) => name(v.employeeId), value: (v) => name(v.employeeId) },
            { key: "m", title: x.month, align: "right", secondary: true, render: (v) => `${v.monthIndex}/24`, value: (v) => v.monthIndex },
            { key: "b", title: x.base, align: "right", render: (v) => `${v.base.toLocaleString("sv-SE")} kr`, value: (v) => v.base },
            { key: "r", title: x.refund, align: "right", render: (v) => `${v.refund.toLocaleString("sv-SE")} kr`, value: (v) => v.refund },
            { key: "s", title: x.setStatus, render: (v) => (
              <select aria-label={`${x.setStatus}, ${name(v.employeeId)} ${v.period}`} className={input} disabled={!can} value={v.status}
                onChange={(e) => void run(async () => ok(await acc.setVaxaStatus(v.id, e.target.value as VaxaStatus)), x.status[e.target.value])}>
                {Object.values(VaxaStatus).map((s) => <option key={s} value={s}>{x.status[s]}</option>)}
              </select>) },
            { key: "pdf", title: "", render: (v) => <PdfActions preview={false} label={x.pdf} fileName={`vaxa-stod-${v.period}-${v.employeeId}.pdf`} job={async () => ({
              template: "summary@1" as const, meta: meta(ctx, "Växa-stöd – underlag", v.period, [name(v.employeeId)]),
              facts: [["Anställd", name(v.employeeId)], ["Period", v.period], ["Månad i följd", `${v.monthIndex} av 24`], ["Tak per månad", `${v.cap.toLocaleString("sv-SE")} kr`]],
              table: { cols: ["Underlag", "Inom taket", "Återbetalning (21,21 %)"], rows: [[`${v.base.toLocaleString("sv-SE")} kr`, `${(v.base < v.cap ? v.base : v.cap).toLocaleString("sv-SE")} kr`, `${v.refund.toLocaleString("sv-SE")} kr`]] },
            })} /> },
          ]} />
      )}
      <Toast status={status} />
    </>
  );
}
