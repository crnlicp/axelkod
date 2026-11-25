// Bank › Skattekonto: imported tax-account transactions, booked against 1630 by kind
// (V24), payments linked to the bank voucher; the balance compared with 1630.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { TaxKind, type TaxEntry, type TaxSummary } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { guessTaxKind } from "../../../../admin/accounting/purchases";
import { AccountPicker } from "../../../../admin/accounting/ui/AccountPicker";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { SectionTabs, bankTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { DocRef, EmptyState, Money, MoneyInput, PageHead, StatusChip, input, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

const LINKED = new Set<TaxKind>([TaxKind.payment, TaxKind.refund]);

export default function Tax() {
  const t = useAccT();
  const b = t.bank;
  const x = b.tax;
  const err = useErr();
  const { acc, canBook, href } = useAcc();
  const [rows, setRows] = useState<TaxEntry[] | null>(null);
  const [sum, setSum] = useState<TaxSummary | null>(null);
  const [act, setAct] = useState<TaxEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: b.title, to: "/admin/accounting/bank" }, { label: b.tabs.tax }]);
  const load = useCallback(async () => {
    setRows(ok(await acc.listTaxEntries(0n, 500n)).items);
    setSum(ok(await acc.taxAccountSummary()));
  }, [acc]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);

  return (
    <>
      <PageHead title={b.title} actions={canBook ? <>
        <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>{x.add}</button>
        <Link to={href("/admin/accounting/bank/tax/import")} className="btn btn-primary">{x.importTitle}</Link>
      </> : null}><SectionTabs {...bankTabs(b)} /></PageHead>
      <p className="mb-4 text-sm text-muted">{x.intro}</p>
      {sum && (
        <dl className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="card"><dt className="text-sm text-muted">{x.balance}</dt><dd className="text-2xl"><Money ore={sum.balance} unit /></dd></div>
          <div className="card"><dt className="text-sm text-muted">{x.ledger}</dt><dd className="text-2xl"><Money ore={sum.ledger} unit /></dd></div>
          <div className="card"><dt className="text-sm text-muted">{x.diff}</dt><dd className="text-2xl"><Money ore={sum.balance - sum.ledger} unit /></dd>
            {sum.unbooked > 0n && <dd className="mt-1"><StatusChip tone="warn">{x.unbooked(Number(sum.unbooked))}</StatusChip></dd>}</div>
        </dl>
      )}
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(e) => String(e.id)} caption={b.tabs.tax} csvName="skattekonto" empty={<EmptyState text={x.empty} />}
          columns={[
            { key: "d", title: b.date, render: (e) => e.date, value: (e) => e.date },
            { key: "t", title: b.text, render: (e) => e.text, value: (e) => e.text },
            { key: "k", title: x.kind, secondary: true, render: (e) => x.kinds[e.kind], value: (e) => e.kind },
            { key: "a", title: b.amount, align: "right", render: (e) => <Money ore={e.amount} />, value: (e) => e.amount },
            { key: "v", title: "", render: (e) => (e.voucherId !== undefined ? <DocRef id={e.voucherId} label={`#${e.voucherId}`} />
              : canBook ? <button type="button" className="btn btn-secondary px-3 py-1 text-sm" onClick={() => setAct(e)}>{LINKED.has(e.kind) ? x.link : x.book}</button> : null) },
          ]} />
      )}
      {act && <ActDialog entry={act} onClose={() => setAct(null)} onDone={async () => { setAct(null); setStatus({ ok: true, text: x.done }); await load(); }} />}
      {adding && <AddDialog onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await load(); }} />}
      <Toast status={status} />
    </>
  );
}

function ActDialog({ entry, onClose, onDone }: { entry: TaxEntry; onClose: () => void; onDone: () => void }) {
  const t = useAccT();
  const x = t.bank.tax;
  const err = useErr();
  const { acc } = useAcc();
  const [kind, setKind] = useState(entry.kind);
  const [account, setAccount] = useState<bigint | null>(null);
  const [voucherId, setVoucherId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linked = LINKED.has(kind);
  async function save() {
    setBusy(true);
    try {
      if (kind !== entry.kind) ok(await acc.setTaxKind(entry.id, kind));
      if (linked) ok(await acc.linkTaxEntry(entry.id, BigInt(voucherId)));
      else ok(await acc.bookTaxEntry(entry.id, kind === TaxKind.other ? account : null));
      onDone();
    } catch (e) { setError(err(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={onClose} title={linked ? x.link : x.book}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>{t.common.cancel}</button>
        <button type="button" className="btn btn-primary" disabled={busy || (linked && !/^\d+$/.test(voucherId)) || (kind === TaxKind.other && account === null)} onClick={() => void save()}>{linked ? t.bank.match.linkButton : x.book}</button></>}>
      <p className="mb-4">{entry.date} · {entry.text} · <Money ore={entry.amount} unit /></p>
      <div className="space-y-4">
        <div><label htmlFor="tx-k" className={label}>{x.kind}</label>
          <select id="tx-k" className={input} value={kind} onChange={(e) => setKind(e.target.value as TaxKind)}>
            {Object.values(TaxKind).map((k) => <option key={k} value={k}>{x.kinds[k]}</option>)}
          </select></div>
        {kind === TaxKind.other && <AccountPicker labelText={x.account} value={account} onChange={(a) => setAccount(a?.number ?? null)} />}
        {linked && <><p className="text-sm text-muted">{x.linkHint}</p>
          <div><label htmlFor="tx-v" className={label}>{t.bank.match.voucherId}</label><input id="tx-v" inputMode="numeric" className={input} value={voucherId} onChange={(e) => setVoucherId(e.target.value)} /></div></>}
      </div>
      {error && <p role="alert" className="mt-3 text-[var(--error)]">{error}</p>}
      {!linked && <p className="mt-4 text-sm">{t.confirm.irreversible}</p>}
    </Dialog>
  );
}

function AddDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useAccT();
  const b = t.bank;
  const err = useErr();
  const { acc } = useAcc();
  const [f, setF] = useState({ date: today(), text: "", amount: null as bigint | null, kind: TaxKind.vat as TaxKind, touched: false });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    try {
      ok(await acc.importTaxRows([{ date: f.date, text: f.text.trim(), amount: f.amount ?? 0n, kind: f.kind }]));
      onDone();
    } catch (e) { setError(err(e)); }
  }
  return (
    <Dialog open onClose={onClose} title={b.tax.add}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>{t.common.cancel}</button><button type="button" className="btn btn-primary" disabled={!f.amount} onClick={() => void save()}>{t.common.save}</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="ta-d" className={label}>{b.date}</label><input id="ta-d" type="date" className={input} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><span className={label}>{b.amount}</span><MoneyInput allowNegative labelText={b.amount} value={f.amount} onChange={(v) => setF({ ...f, amount: v, kind: f.touched ? f.kind : guessTaxKind(f.text, v ?? 0n) })} /></div>
        <div className="sm:col-span-2"><label htmlFor="ta-t" className={label}>{b.text}</label><input id="ta-t" className={input} maxLength={300} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value, kind: f.touched ? f.kind : guessTaxKind(e.target.value, f.amount ?? 0n) })} /></div>
        <div className="sm:col-span-2"><label htmlFor="ta-k" className={label}>{b.tax.kind}</label>
          <select id="ta-k" className={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as TaxKind, touched: true })}>
            {Object.values(TaxKind).map((k) => <option key={k} value={k}>{b.tax.kinds[k]}</option>)}
          </select></div>
      </div>
      {error && <p role="alert" className="mt-3 text-[var(--error)]">{error}</p>}
    </Dialog>
  );
}
