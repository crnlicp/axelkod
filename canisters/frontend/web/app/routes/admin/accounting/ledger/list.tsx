// Verifikationer: every voucher of the selected year, newest first.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { VoucherView } from "../../../../bindings/accounting";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { allVouchers, ref, sumPositive } from "../../../../admin/accounting/ledger";
import { plainOre } from "../../../../admin/accounting/money";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { LedgerTabs } from "../../../../admin/accounting/ui/LedgerTabs";
import { EmptyState, Money, PageHead, StatusChip } from "../../../../admin/accounting/ui/kit";
import { IconPaperclip, IconPlus } from "../../../../components/Icons";

export default function VoucherList() {
  const t = useAccT();
  const err = useErr();
  const { acc, year, data, href, canBook } = useAcc();
  const navigate = useNavigate();
  const [rows, setRows] = useState<VoucherView[] | null>(null);
  const [series, setSeries] = useState("");
  const [error, setError] = useState<string | null>(null);
  useCrumbs([{ label: t.ledger.title, to: "/admin/accounting/ledger" }, { label: t.ledger.tabs.vouchers }]);

  useEffect(() => {
    if (!year) return setRows([]);
    let live = true;
    setRows(null);
    allVouchers(acc, year.id, series || null).then((vs) => live && setRows(vs.reverse())).catch((e) => live && setError(err(e)));
    return () => { live = false; };
  }, [acc, year, series, err]);

  const newBtn = canBook ? <Link to={href("/admin/accounting/ledger/new")} className="btn btn-primary"><IconPlus className="h-5 w-5" /> {t.ledger.newVoucher}</Link> : null;

  return (
    <>
      <PageHead title={t.ledger.title} actions={newBtn}><LedgerTabs /></PageHead>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-muted">{t.ledger.filterSeries}</span>
          <select value={series} onChange={(e) => setSeries(e.target.value)} className="mt-1 rounded-md border border-[var(--input-border)] bg-bg px-3 py-1.5">
            <option value="">{t.ledger.allSeries}</option>
            {data?.series.map((s) => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="mb-4 text-[var(--error)]">{error}</p>}
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(v) => String(v.id)} caption={t.ledger.tabs.vouchers} csvName={`verifikationer-${year?.start.slice(0, 4) ?? ""}`}
          onOpen={(v) => navigate(href(`/admin/accounting/ledger/${v.id}`))}
          empty={<EmptyState text={t.ledger.empty} action={newBtn} />}
          columns={[
            { key: "ref", title: t.ledger.ref, render: (v) => <span className="font-mono">{ref(v)}</span>, value: (v) => `${v.series}${String(v.number).padStart(8, "0")}` },
            { key: "date", title: t.common.date, render: (v) => v.eventDate, value: (v) => v.eventDate },
            {
              key: "text", title: t.common.text, value: (v) => v.description,
              render: (v) => (
                <span className="flex flex-wrap items-center gap-2">
                  {v.description}
                  {v.corrects !== undefined && <StatusChip tone="info">{t.status.correction}</StatusChip>}
                  {v.correctedBy.length > 0 && <StatusChip tone="warn">{t.status.corrected}</StatusChip>}
                </span>
              ),
            },
            { key: "amount", title: t.common.amount, align: "right", render: (v) => <Money ore={sumPositive(v.lines.map((l) => l.amount))} />, value: (v) => sumPositive(v.lines.map((l) => l.amount)), csv: (v) => plainOre(sumPositive(v.lines.map((l) => l.amount))) },
            {
              key: "att", title: t.ledger.attachments, secondary: true, value: (v) => v.attachmentIds.length + v.linkedAttachments.length,
              render: (v) => (v.attachmentIds.length + v.linkedAttachments.length > 0 ? <IconPaperclip className="h-4 w-4" title={t.ledger.hasAttachments} /> : null),
            },
          ]} />
      )}
    </>
  );
}
