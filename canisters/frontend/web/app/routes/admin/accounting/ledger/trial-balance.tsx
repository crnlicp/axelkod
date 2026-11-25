// Saldobalans: opening (earlier months of the year), period change and closing per account.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { BalanceRow } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { fyMonths, trialJob, trialRows } from "../../../../admin/accounting/ledger";
import { plainOre } from "../../../../admin/accounting/money";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { LedgerTabs } from "../../../../admin/accounting/ui/LedgerTabs";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { EmptyState, Money, PageHead } from "../../../../admin/accounting/ui/kit";

export default function TrialBalance() {
  const t = useAccT();
  const err = useErr();
  const ctx = useAcc();
  const { acc, year, href, accountName, data } = ctx;
  const navigate = useNavigate();
  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const months = useMemo(() => (year ? fyMonths(year) : []), [year]);
  const [range, setRange] = useState<[number, number]>([0, 11]);
  useCrumbs([{ label: t.ledger.title, to: "/admin/accounting/ledger" }, { label: t.ledger.tabs.trial }]);

  useEffect(() => { setRange([0, Math.max(0, months.length - 1)]); }, [months]);
  useEffect(() => {
    if (!year) return;
    let live = true;
    acc.balances(year.id).then((r) => live && setBalances(ok(r))).catch((e) => live && setError(err(e)));
    return () => { live = false; };
  }, [acc, year, err]);

  const [from, to] = [Math.min(range[0], months.length - 1), Math.min(range[1], months.length - 1)];
  const rows = balances ? trialRows(balances, from, to, accountName) : null;
  const sel = (i: 0 | 1, labelText: string) => (
    <label className="text-sm">
      <span className="block text-muted">{labelText}</span>
      <select value={range[i]} onChange={(e) => { const v = Number(e.target.value); setRange(i === 0 ? [v, Math.max(v, range[1])] : [Math.min(range[0], v), v]); }}
        className="mt-1 rounded-md border border-[var(--input-border)] bg-bg px-3 py-1.5">
        {months.map((m, k) => <option key={m} value={k}>{m}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <PageHead title={t.ledger.title} actions={year && data?.company ? (
        <PdfActions label={t.ledger.trialPdf} fileName={`saldobalans-${months[from]}-${months[to]}.pdf`} job={() => trialJob(ctx, year, from, to)} />
      ) : null}><LedgerTabs /></PageHead>
      <div className="mb-4 flex flex-wrap gap-3">{sel(0, t.ledger.fromMonth)}{sel(1, t.ledger.toMonth)}</div>
      {error && <p role="alert" className="text-[var(--error)]">{error}</p>}
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(r) => String(r.number)} caption={t.ledger.tabs.trial} csvName={`saldobalans-${months[from]}-${months[to]}`}
          empty={<EmptyState text={t.ledger.noRows} />}
          onOpen={(r) => navigate(href(`/admin/accounting/ledger/accounts/${r.number}`))}
          columns={[
            { key: "acc", title: t.common.account, render: (r) => String(r.number), value: (r) => r.number },
            { key: "name", title: t.common.name, render: (r) => r.name, value: (r) => r.name },
            { key: "o", title: t.ledger.opening, align: "right", render: (r) => <Money ore={r.opening} />, value: (r) => r.opening, csv: (r) => plainOre(r.opening) },
            { key: "c", title: t.ledger.change, align: "right", render: (r) => <Money ore={r.change} />, value: (r) => r.change, csv: (r) => plainOre(r.change) },
            { key: "e", title: t.ledger.closing, align: "right", render: (r) => <Money ore={r.opening + r.change} />, value: (r) => r.opening + r.change, csv: (r) => plainOre(r.opening + r.change) },
          ]} />
      )}
    </>
  );
}
