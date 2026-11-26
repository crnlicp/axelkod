// Lön › Lönekörningar: runs with their totals, and a new run for a payment date with
// every active employee (monthly pay as the first line).
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { RunSummary, SlipInput } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { canPayroll } from "../../../../admin/accounting/payroll";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { SectionTabs, payrollTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, Money, PageHead, StatusChip, input, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

const tone = (s: string) => (s === "paid" ? "good" : s === "approved" ? "warn" : "neutral") as "good" | "warn" | "neutral";

export default function PayRuns() {
  const t = useAccT();
  const x = t.payroll.runs;
  const err = useErr();
  const navigate = useNavigate();
  const { acc, role, href, data } = useAcc();
  const [rows, setRows] = useState<RunSummary[] | null>(null);
  const [date, setDate] = useState(today().slice(0, 8) + "25");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: t.payroll.title, to: "/admin/accounting/payroll" }, { label: t.payroll.tabs.runs }]);
  const load = useCallback(() => acc.listPayRuns().then((r) => setRows(ok(r))).catch((e) => setStatus({ ok: false, text: err(e) })), [acc, err]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    setBusy(true);
    try {
      const employees = ok(await acc.listEmployees()).filter((e) => e.active && (!e.employedTo || e.employedTo >= date));
      if (!employees.length) { setStatus({ ok: false, text: x.noEmployees }); return; }
      const inputs: SlipInput[] = employees.map((e) => ({
        employeeId: e.id, taxOverride: undefined,
        lines: e.pay.__kind__ === "monthly" && e.pay.monthly > 0n ? [{ code: "LON", text: undefined, quantity: 1_000n, rate: e.pay.monthly, amount: e.pay.monthly }] : [],
      }));
      const run = ok(await acc.savePayRun(null, date, inputs));
      navigate(href(`/admin/accounting/payroll/runs/${run.id}`));
    } catch (e) { setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title={t.payroll.title}><SectionTabs {...payrollTabs(t.payroll)} /></PageHead>
      {!data?.settings.modules.payroll && <p className="mb-4 rounded-lg border border-border p-3 text-sm">{t.payroll.disabled}</p>}
      {canPayroll(role) && (
        <form className="card mb-6 flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <div><label htmlFor="run-date" className={label}>{x.paymentDate}</label>
            <input id="run-date" type="date" required className={input} value={date} aria-describedby="run-date-hint" onChange={(e) => setDate(e.target.value)} /></div>
          <button type="submit" className="btn btn-primary" disabled={busy}>{x.new}</button>
          <p id="run-date-hint" className="w-full text-xs text-muted">{x.periodHint}</p>
        </form>
      )}
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(r) => String(r.id)} caption={t.payroll.tabs.runs} empty={<EmptyState text={x.empty} />}
          onOpen={(r) => navigate(href(`/admin/accounting/payroll/runs/${r.id}`))}
          columns={[
            { key: "p", title: x.period, render: (r) => r.period, value: (r) => r.period },
            { key: "d", title: x.paymentDate, render: (r) => r.paymentDate, value: (r) => r.paymentDate },
            { key: "e", title: x.employees, align: "right", secondary: true, render: (r) => String(r.employees), value: (r) => r.employees },
            { key: "g", title: x.gross, align: "right", render: (r) => <Money ore={r.gross} />, value: (r) => r.gross },
            { key: "t", title: x.tax, align: "right", secondary: true, render: (r) => <Money ore={r.tax} />, value: (r) => r.tax },
            { key: "n", title: x.net, align: "right", render: (r) => <Money ore={r.net} />, value: (r) => r.net },
            { key: "f", title: x.fees, align: "right", secondary: true, render: (r) => <Money ore={r.fees} />, value: (r) => r.fees },
            { key: "s", title: x.status, render: (r) => <StatusChip tone={tone(r.status)}>{x.state[r.status]}</StatusChip>, value: (r) => r.status },
          ]} />
      )}
      <Toast status={status} />
    </>
  );
}
