// Huvudbok: accounts with activity this year; one account (/accounts/:number)
// shows each transaction with a running balance (kontoanalys).
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { BalanceRow } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { allVouchers, generalJob, generalLedger, openingMap } from "../../../../admin/accounting/ledger";
import type { LedgerAccount } from "../../../../admin/accounting/pdf/types";
import { plainOre } from "../../../../admin/accounting/money";
import { AccountPicker } from "../../../../admin/accounting/ui/AccountPicker";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { LedgerTabs } from "../../../../admin/accounting/ui/LedgerTabs";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { EmptyState, Money, PageHead } from "../../../../admin/accounting/ui/kit";

export default function GeneralLedger() {
  const t = useAccT();
  const err = useErr();
  const ctx = useAcc();
  const { acc, year, href, accountName, data } = ctx;
  const navigate = useNavigate();
  const { number } = useParams();
  const only = number ? Number(number) : undefined;
  const [sums, setSums] = useState<BalanceRow[] | null>(null);
  const [account, setAccount] = useState<LedgerAccount | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useCrumbs([
    { label: t.ledger.title, to: "/admin/accounting/ledger" }, { label: t.ledger.tabs.general, to: "/admin/accounting/ledger/general" },
    ...(only !== undefined ? [{ label: `${only} ${accountName(only)}` }] : []),
  ]);

  useEffect(() => {
    if (!year) return;
    let live = true;
    setError(null);
    if (only === undefined) {
      setSums(null);
      acc.balances(year.id).then((r) => live && setSums(ok(r))).catch((e) => live && setError(err(e)));
    } else {
      setAccount(undefined);
      Promise.all([allVouchers(acc, year.id), openingMap(acc, year.id)]).then(([vs, o]) => {
        if (!live) return;
        const ib = o.get(only) ?? 0n;
        const a = generalLedger(vs, accountName, only)[0] ?? (ib !== 0n ? { number: only, name: accountName(BigInt(only)), opening: 0n, rows: [] } : null);
        setAccount(a ? { ...a, opening: ib } : null);
      }).catch((e) => live && setError(err(e)));
    }
    return () => { live = false; };
  }, [acc, year, only, err, accountName]);

  const pdf = year && data?.company ? (
    <PdfActions label={t.ledger.generalPdf} fileName={`huvudbok-${year.start.slice(0, 4)}${only ? `-${only}` : ""}.pdf`} job={() => generalJob(ctx, year, only)} />
  ) : null;

  return (
    <>
      <PageHead title={t.ledger.title} actions={pdf}><LedgerTabs /></PageHead>
      <div className="mb-4 max-w-sm">
        <span className="text-sm text-muted">{t.ledger.chooseAccount}</span>
        <AccountPicker value={only !== undefined ? BigInt(only) : null} labelText={t.ledger.chooseAccount}
          onChange={(a) => a && navigate(href(`/admin/accounting/ledger/accounts/${a.number}`))} />
      </div>
      {error && <p role="alert" className="text-[var(--error)]">{error}</p>}
      {only === undefined ? (
        !sums ? <p role="status">{t.common.loading}</p> : (
          <DataTable rows={sums.map((b) => ({ account: b.account, total: b.months.reduce((a, x) => a + x, 0n) })).sort((a, b) => Number(a.account - b.account))}
            rowKey={(r) => String(r.account)} caption={t.ledger.tabs.general} csvName={`huvudbok-konton-${year?.start.slice(0, 4) ?? ""}`}
            onOpen={(r) => navigate(href(`/admin/accounting/ledger/accounts/${r.account}`))}
            empty={<EmptyState text={t.ledger.noRows} />}
            columns={[
              { key: "acc", title: t.common.account, render: (r) => String(r.account), value: (r) => r.account },
              { key: "name", title: t.common.name, render: (r) => accountName(r.account), value: (r) => accountName(r.account) },
              { key: "bal", title: t.ledger.balance, align: "right", render: (r) => <Money ore={r.total} />, value: (r) => r.total, csv: (r) => plainOre(r.total) },
            ]} />
        )
      ) : account === undefined ? <p role="status">{t.common.loading}</p> : !account ? <EmptyState text={t.ledger.noRows} /> : (
        <AccountTable a={account} />
      )}
    </>
  );
}

function AccountTable({ a }: { a: LedgerAccount }) {
  const t = useAccT();
  let bal = a.opening;
  const rows = a.rows.map((r, i) => { bal += r.amount; return { ...r, i, bal }; });
  return (
    <DataTable rows={rows} rowKey={(r) => String(r.i)} caption={`${a.number} ${a.name}`} csvName={`konto-${a.number}`}
      columns={[
        { key: "date", title: t.common.date, render: (r) => r.date, value: (r) => r.date },
        { key: "ref", title: t.ledger.ref, render: (r) => <span className="font-mono">{r.ref}</span>, value: (r) => r.ref },
        { key: "text", title: t.common.text, render: (r) => r.text, value: (r) => r.text },
        { key: "d", title: t.common.debit, align: "right", render: (r) => (r.amount > 0n ? <Money ore={r.amount} /> : null), value: (r) => (r.amount > 0n ? r.amount : 0n), csv: (r) => (r.amount > 0n ? plainOre(r.amount) : "") },
        { key: "c", title: t.common.credit, align: "right", render: (r) => (r.amount < 0n ? <Money ore={-r.amount} /> : null), value: (r) => (r.amount < 0n ? -r.amount : 0n), csv: (r) => (r.amount < 0n ? plainOre(-r.amount) : "") },
        { key: "bal", title: t.ledger.balance, align: "right", render: (r) => <Money ore={r.bal} />, csv: (r) => plainOre(r.bal) },
      ]} />
  );
}
