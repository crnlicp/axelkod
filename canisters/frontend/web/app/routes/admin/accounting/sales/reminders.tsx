// Påminnelser: overdue invoices with the rule that applies, bulk "Skapa påminnelser",
// and the reminders already created (PDF from their stored, hashed content).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { DocKind, type DocSummary, type Reminder } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { daysUntil } from "../../../../admin/accounting/obligations";
import { reminderJob } from "../../../../admin/accounting/sales";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { SalesTabs } from "../../../../admin/accounting/ui/SalesTabs";
import { EmptyState, Money, PageHead } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

export default function Reminders() {
  const t = useAccT();
  const s = t.sales;
  const r = s.reminder;
  const err = useErr();
  const { acc, href, canBook } = useAcc();
  const [overdue, setOverdue] = useState<DocSummary[] | null>(null);
  const [sent, setSent] = useState<Reminder[]>([]);
  const [selected, setSelected] = useState<Set<bigint>>(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: s.title, to: "/admin/accounting/sales/invoices" }, { label: s.tabs.reminders }]);

  const load = useCallback(async () => {
    try {
      const all: DocSummary[] = [];
      for (let off = 0n; ; off += 200n) {
        const page = ok(await acc.listSalesDocs(DocKind.invoice, off, 200n));
        all.push(...page.items);
        if (all.length >= Number(page.total) || !page.items.length) break;
      }
      setOverdue(all.filter((d) => d.status.__kind__ === "overdue"));
      setSent(ok(await acc.listReminders(0n, 200n)).items);
    } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }, [acc, err]);
  useEffect(() => { void load(); }, [load]);

  async function createSelected() {
    setBusy(true);
    try {
      for (const id of selected) ok(await acc.createReminder(id, today()));
      setStatus({ ok: true, text: r.created(String(selected.size)) });
      setSelected(new Set());
      await load();
    } catch (e) { setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title={s.title}><SalesTabs /></PageHead>
      <p className="mb-4 max-w-3xl text-sm text-muted">{r.rules}</p>
      <section aria-labelledby="od-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="od-h" className="text-2xl">{r.overdue}</h2>
          {canBook && <button type="button" className="btn btn-primary" disabled={!selected.size || busy} onClick={() => void createSelected()}>{r.create} ({selected.size})</button>}
        </div>
        {!overdue ? <p role="status">{t.common.loading}</p> : (
          <DataTable rows={overdue} rowKey={(d) => String(d.id)} caption={r.overdue} empty={<EmptyState text={r.none} />}
            columns={[
              ...(canBook ? [{ key: "sel", title: "", render: (d: DocSummary) => (
                <input type="checkbox" aria-label={`${s.kind.invoice} ${d.number}`} checked={selected.has(d.id)}
                  onChange={(e) => setSelected((x) => { const n = new Set(x); if (e.target.checked) n.add(d.id); else n.delete(d.id); return n; })} />
              ) }] : []),
              { key: "n", title: s.number, render: (d) => <Link to={href(`/admin/accounting/sales/docs/${d.id}`)}>{String(d.number)}</Link>, value: (d) => d.number },
              { key: "c", title: s.customer, render: (d) => d.customerName, value: (d) => d.customerName },
              { key: "due", title: s.due, render: (d) => <>{d.dueDate} <span className="text-[var(--error)]">({r.daysLate(-daysUntil(today(), d.dueDate ?? today()))})</span></>, value: (d) => d.dueDate ?? "" },
              { key: "b", title: s.balance, align: "right", render: (d) => <Money ore={d.balance} />, value: (d) => d.balance },
            ]} />
        )}
      </section>
      <section aria-labelledby="sent-h" className="mt-8 space-y-3">
        <h2 id="sent-h" className="text-2xl">{r.list}</h2>
        <DataTable rows={sent} rowKey={(x) => String(x.id)} caption={r.list} empty={<EmptyState text={r.empty} />}
          columns={[
            { key: "n", title: s.number, render: (x) => String(x.number), value: (x) => x.number },
            { key: "d", title: t.common.date, render: (x) => x.date, value: (x) => x.date },
            { key: "i", title: s.kind.invoice, render: (x) => <Link to={href(`/admin/accounting/sales/docs/${x.salesDocId}`)}>{String(x.invoiceNumber)}</Link>, value: (x) => x.invoiceNumber },
            { key: "c", title: s.customer, render: (x) => x.buyer.name, value: (x) => x.buyer.name },
            { key: "f", title: r.fee, align: "right", render: (x) => <Money ore={x.fee} />, value: (x) => x.fee },
            { key: "in", title: r.interest, align: "right", render: (x) => <Money ore={x.interest} />, value: (x) => x.interest },
            { key: "p", title: "PDF", render: (x) => <PdfActions preview={false} label="PDF" fileName={`paminnelse-${x.number}.pdf`} job={() => reminderJob(x)} /> },
          ]} />
      </section>
      <Toast status={status} />
    </>
  );
}
