// Grundbok: every voucher in registration order, with its lines.
import { Fragment, useEffect, useState } from "react";
import type { VoucherView } from "../../../../bindings/accounting";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { allVouchers, journalJob, ref } from "../../../../admin/accounting/ledger";
import { LedgerTabs } from "../../../../admin/accounting/ui/LedgerTabs";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { DocRef, EmptyState, Money, PageHead } from "../../../../admin/accounting/ui/kit";

export default function Journal() {
  const t = useAccT();
  const err = useErr();
  const ctx = useAcc();
  const { acc, year, data, accountName } = ctx;
  const [rows, setRows] = useState<VoucherView[] | null>(null);
  const [series, setSeries] = useState("");
  const [error, setError] = useState<string | null>(null);
  useCrumbs([{ label: t.ledger.title, to: "/admin/accounting/ledger" }, { label: t.ledger.tabs.journal }]);

  useEffect(() => {
    if (!year) return setRows([]);
    let live = true;
    setRows(null);
    allVouchers(acc, year.id, series || null).then((v) => live && setRows(v)).catch((e) => live && setError(err(e)));
    return () => { live = false; };
  }, [acc, year, series, err]);

  return (
    <>
      <PageHead title={t.ledger.title} actions={year && data?.company ? (
        <PdfActions label={t.ledger.journalPdf} fileName={`grundbok-${year.start.slice(0, 4)}${series ? `-${series}` : ""}.pdf`} job={() => journalJob(ctx, year, series || null, t.voucher.sources)} />
      ) : null}><LedgerTabs /></PageHead>
      <label className="mb-4 inline-block text-sm">
        <span className="block text-muted">{t.ledger.filterSeries}</span>
        <select value={series} onChange={(e) => setSeries(e.target.value)} className="mt-1 rounded-md border border-[var(--input-border)] bg-bg px-3 py-1.5">
          <option value="">{t.ledger.allSeries}</option>
          {data?.series.map((s) => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="text-[var(--error)]">{error}</p>}
      {!rows ? <p role="status">{t.common.loading}</p> : !rows.length ? <EmptyState text={t.ledger.empty} /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full text-sm">
            <caption className="sr-only">{t.ledger.tabs.journal}</caption>
            <thead className="sticky top-0 bg-[var(--bg-elev)] text-left text-muted">
              <tr><th scope="col" className="px-3 py-2">{t.ledger.ref}</th><th scope="col" className="px-3 py-2">{t.common.date}</th><th scope="col" className="px-3 py-2">{t.common.account} / {t.common.text}</th>
                <th scope="col" className="px-3 py-2 text-right">{t.common.debit}</th><th scope="col" className="px-3 py-2 text-right">{t.common.credit}</th></tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <Fragment key={String(v.id)}>
                  <tr className="border-t border-border bg-surface">
                    <td className="px-3 py-1.5"><DocRef id={v.id} label={ref(v)} search={ctx.href("")} /></td>
                    <td className="px-3 py-1.5">{v.eventDate}</td>
                    <td className="px-3 py-1.5 font-semibold" colSpan={3}>{v.description}</td>
                  </tr>
                  {v.lines.map((l, i) => (
                    <tr key={i}>
                      <td /><td />
                      <td className="px-3 py-1">{String(l.account)} {accountName(l.account)}{l.text ? ` – ${l.text}` : ""}</td>
                      <td className="px-3 py-1 text-right">{l.amount > 0n ? <Money ore={l.amount} /> : null}</td>
                      <td className="px-3 py-1 text-right">{l.amount < 0n ? <Money ore={-l.amount} /> : null}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
