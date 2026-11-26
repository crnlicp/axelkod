// ROT/RUT › Ärenden: paid invoices waiting to be claimed, and the cases with their
// deadline (31 January the year after payment, V12). A case takes the payments not yet
// claimed, the hours per work type and, from 2027, subcontractors and staffing agencies.
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CaseStatus, type HusCase, type HusReady } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { daysLeft } from "../../../../admin/accounting/rotrut";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { SectionTabs, rotRutTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, Money, PageHead, StatusChip } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

const tone = (s: CaseStatus) => (s === CaseStatus.decided ? "good" : s === CaseStatus.cancelled ? "neutral" : s === CaseStatus.submitted ? "warn" : "neutral") as "good" | "warn" | "neutral";

export default function HusCases() {
  const t = useAccT();
  const r = t.rotRut;
  const x = r.cases;
  const err = useErr();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { acc, canBook, data, href } = useAcc();
  const [ready, setReady] = useState<HusReady[] | null>(null);
  const [cases, setCases] = useState<HusCase[] | null>(null);
  const [open, setOpen] = useState<HusReady | null>(null);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState({ subcontractor: false, staffingAgency: false });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: r.title, to: "/admin/accounting/rot-rut" }, { label: r.tabs.cases }]);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([acc.listHusReady(), acc.listHusCases()]);
    const rd = ok(a);
    setReady(rd);
    setCases(ok(b));
    return rd;
  }, [acc]);

  const start = (h: HusReady) => { setHours(Object.fromEntries(h.work.map((w) => [w, ""]))); setFlags({ subcontractor: false, staffingAgency: false }); setOpen(h); };

  useEffect(() => {
    void load().then((rd) => {
      const inv = params.get("invoice");
      const h = inv ? rd.find((y) => String(y.salesDocId) === inv) : undefined;
      if (h && canBook) start(h);
    }).catch((e) => setStatus({ ok: false, text: err(e) }));
  }, [load, err]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    if (!open) return;
    setBusy(true);
    try {
      ok(await acc.createHusCase({
        salesDocId: open.salesDocId, hours: open.work.map((w) => ({ workType: w, hours: BigInt(Math.max(0, Math.ceil(Number((hours[w] ?? "").replace(",", ".")) || 0))) })), ...flags,
      }));
      setOpen(null);
      setParams({}, { replace: true });
      setStatus({ ok: true, text: x.created });
      await load();
    } catch (e) { setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  async function cancel(c: HusCase) {
    try { ok(await acc.cancelHusCase(c.id)); setStatus({ ok: true, text: x.cancelled }); await load(); } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }

  const now = today();
  return (
    <>
      <PageHead title={r.title}><SectionTabs {...rotRutTabs(r)} /></PageHead>
      {!data?.settings.modules.rotRut && <p className="mb-4 rounded-lg border border-border p-3 text-sm">{r.disabled}</p>}
      <p className="mb-4 text-sm text-muted">{x.intro}</p>
      <h2 className="mb-2 text-2xl">{x.ready}</h2>
      {!ready ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={ready} rowKey={(h) => String(h.salesDocId)} caption={x.ready} empty={<EmptyState text={x.readyEmpty} />}
          onOpen={(h) => navigate(href(`/admin/accounting/sales/docs/${h.salesDocId}`))}
          columns={[
            { key: "n", title: x.invoice, render: (h) => String(h.number), value: (h) => h.number },
            { key: "c", title: x.customer, render: (h) => h.customerName, value: (h) => h.customerName },
            { key: "k", title: r.editor.kind, render: (h) => r.kind[h.kind], value: (h) => h.kind },
            { key: "d", title: r.doc.deduction, align: "right", render: (h) => <Money ore={h.deduction} />, value: (h) => h.deduction },
            { key: "p", title: x.paid, align: "right", render: (h) => <Money ore={h.unclaimed} />, value: (h) => h.unclaimed },
            { key: "a", title: "", render: (h) => canBook ? <button type="button" className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); start(h); }}>{x.create}</button> : null },
          ]} />
      )}

      <h2 className="mb-2 mt-8 text-2xl">{r.tabs.cases}</h2>
      {!cases ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={cases} rowKey={(c) => String(c.id)} caption={r.tabs.cases} empty={<EmptyState text={x.empty} />}
          columns={[
            { key: "n", title: x.invoice, render: (c) => String(c.invoiceNumber), value: (c) => c.invoiceNumber },
            { key: "k", title: r.editor.kind, render: (c) => r.kind[c.kind], value: (c) => c.kind },
            { key: "y", title: x.year, secondary: true, render: (c) => String(c.year), value: (c) => c.year },
            { key: "r", title: x.requested, align: "right", render: (c) => <Money ore={c.requested} />, value: (c) => c.requested },
            { key: "ap", title: x.approved, align: "right", secondary: true, render: (c) => (c.approved === undefined ? "–" : <Money ore={c.approved} />), value: (c) => c.approved ?? -1n },
            { key: "s", title: t.payroll.runs.status, render: (c) => <StatusChip tone={tone(c.status)}>{x.status[c.status]}</StatusChip>, value: (c) => c.status },
            { key: "dl", title: x.deadline, render: (c) => {
              const n = daysLeft(c.deadline, now);
              const live = c.status === CaseStatus.draft || c.status === CaseStatus.claimed;
              return <span>{c.deadline}{live && <span className={`block text-xs ${n < 14 ? "text-[var(--error)]" : "text-muted"}`}>{x.daysLeft(n)}</span>}</span>;
            }, value: (c) => c.deadline },
            { key: "a", title: "", render: (c) => canBook && c.status === CaseStatus.draft
              ? <button type="button" className="text-sm text-muted hover:text-[var(--error)]" aria-label={x.cancel(String(c.invoiceNumber))} onClick={() => void cancel(c)}>×</button> : null },
          ]} />
      )}

      <Dialog open={!!open} onClose={() => { setOpen(null); setParams({}, { replace: true }); }} title={x.dialog}
        footer={<button type="button" className="btn btn-primary" disabled={busy} onClick={() => void create()}>{x.create}</button>}>
        {open && <div className="space-y-4">
          <p className="text-sm">{x.invoice} {String(open.number)} · {open.customerName} · {r.kind[open.kind]}</p>
          <p id="hus-hours-hint" className="text-xs text-muted">{x.hoursHint}</p>
          {open.work.map((w) => (
            <div key={w}>
              <label htmlFor={`hus-h-${w}`} className="font-medium">{x.hours(r.work[w] ?? w)}</label>
              <input id={`hus-h-${w}`} inputMode="numeric" className="mt-1 w-full rounded-md border border-[var(--input-border)] bg-bg px-3 py-2" aria-describedby="hus-hours-hint"
                value={hours[w] ?? ""} onChange={(e) => setHours({ ...hours, [w]: e.target.value })} />
            </div>
          ))}
          <fieldset className="space-y-2">
            <legend className="text-xs text-muted">{x.from2027}</legend>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flags.subcontractor} onChange={(e) => setFlags({ ...flags, subcontractor: e.target.checked })} /> {x.subcontractor}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flags.staffingAgency} onChange={(e) => setFlags({ ...flags, staffingAgency: e.target.checked })} /> {x.staffing}</label>
          </fieldset>
        </div>}
      </Dialog>
      <Toast status={status} />
    </>
  );
}
