// Leverantörsfakturor (with credit notes) and Kvitton & utlägg: booked documents with
// payment status; supplier invoices and expense claims can be paid from here.
import { useCallback, useEffect, useState } from "react";
import { useMatches } from "react-router";
import { PurchaseKind, type PurchaseView } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { SectionTabs, purchaseTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { DocRef, EmptyState, Money, MoneyInput, PageHead, StatusChip, input, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

const tone = (s: string) => (s === "paid" ? "good" : s === "overdue" ? "bad" : s === "partiallyPaid" ? "warn" : "neutral") as "good" | "bad" | "warn" | "neutral";

export default function PurchaseList() {
  const receipts = useMatches().some((m) => m.id === "acc-receipts");
  const t = useAccT();
  const p = t.purchases;
  const l = p.list;
  const err = useErr();
  const { acc, canBook } = useAcc();
  const [rows, setRows] = useState<PurchaseView[] | null>(null);
  const [paying, setPaying] = useState<PurchaseView | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const kinds = receipts ? [PurchaseKind.receipt, PurchaseKind.expenseClaim] : [PurchaseKind.supplierInvoice, PurchaseKind.creditNote];
  useCrumbs([{ label: p.title, to: "/admin/accounting/purchases" }, { label: receipts ? p.tabs.receipts : p.tabs.invoices }]);
  const load = useCallback(() => acc.listPurchases(kinds, 0n, 200n).then((r) => setRows(ok(r).items)).catch((e) => setStatus({ ok: false, text: err(e) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [acc, err, receipts]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  return (
    <>
      <PageHead title={p.title}><SectionTabs {...purchaseTabs(p)} /></PageHead>
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(x) => String(x.purchase.id)} caption={receipts ? p.tabs.receipts : p.tabs.invoices} csvName={receipts ? "kvitton" : "leverantorsfakturor"}
          empty={<EmptyState text={receipts ? l.emptyReceipts : l.emptyInvoices} />}
          columns={[
            { key: "d", title: l.date, render: (x) => x.purchase.docDate, value: (x) => x.purchase.docDate },
            { key: "s", title: l.supplier, render: (x) => <>{x.supplierName}<span className="block text-xs text-muted">{p.kind[x.purchase.kind]}</span></>, value: (x) => x.supplierName },
            { key: "n", title: l.number, secondary: true, render: (x) => x.purchase.docNumber ?? "", value: (x) => x.purchase.docNumber ?? "" },
            { key: "f", title: l.due, secondary: true, render: (x) => x.purchase.dueDate ?? "", value: (x) => x.purchase.dueDate ?? "" },
            { key: "t", title: l.total, align: "right", render: (x) => <><Money ore={x.purchase.kind === PurchaseKind.creditNote ? -x.purchase.total : x.purchase.total} /> {x.purchase.currency !== "SEK" ? x.purchase.currency : ""}</>, value: (x) => x.purchase.total },
            { key: "b", title: l.balance, align: "right", render: (x) => (x.balance > 0n ? <Money ore={x.balance} /> : ""), value: (x) => x.balance },
            { key: "st", title: l.status, render: (x) => <StatusChip tone={tone(x.status)}>{p.status[x.status]}</StatusChip>, value: (x) => x.status },
            { key: "v", title: l.voucher, render: (x) => (x.purchase.voucherId !== undefined ? <DocRef id={x.purchase.voucherId} label={`#${x.purchase.voucherId}`} /> : ""), },
            { key: "a", title: "", render: (x) => (canBook && x.balance > 0n ? <button type="button" className="btn btn-secondary px-3 py-1 text-sm" onClick={() => setPaying(x)}>{l.pay}</button> : null) },
          ]} />
      )}
      {paying && <PayDialog view={paying} onClose={() => setPaying(null)} onDone={async () => { setPaying(null); setStatus({ ok: true, text: p.pay.done }); await load(); }} />}
      <Toast status={status} />
    </>
  );
}

function PayDialog({ view, onClose, onDone }: { view: PurchaseView; onClose: () => void; onDone: () => void }) {
  const t = useAccT();
  const x = t.purchases.pay;
  const err = useErr();
  const { acc } = useAcc();
  const cur = view.purchase.currency;
  const [f, setF] = useState({ date: today(), amount: view.balance as bigint | null, amountSek: null as bigint | null, reference: view.purchase.paymentRef ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    try {
      ok(await acc.paySupplier({ purchaseId: view.purchase.id, date: f.date, amount: f.amount ?? 0n, amountSek: cur !== "SEK" ? f.amountSek ?? undefined : undefined, reference: f.reference.trim() || undefined }));
      onDone();
    } catch (e) { setError(err(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={onClose} title={x.title}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>{t.common.cancel}</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{x.save}</button></>}>
      <p className="mb-4">{view.supplierName}{view.purchase.docNumber ? `, ${view.purchase.docNumber}` : ""}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="sp-date" className={label}>{x.date}</label><input id="sp-date" type="date" max={today()} className={input} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><span className={label}>{x.amount} ({cur})</span><MoneyInput value={f.amount} labelText={x.amount} onChange={(v) => setF({ ...f, amount: v })} /></div>
        {cur !== "SEK" && <div><span className={label}>{x.amountSek}</span><MoneyInput value={f.amountSek} labelText={x.amountSek} onChange={(v) => setF({ ...f, amountSek: v })} /></div>}
        <div className="sm:col-span-2"><label htmlFor="sp-ref" className={label}>{x.reference}</label><input id="sp-ref" className={input} maxLength={100} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
      </div>
      {error && <p role="alert" className="mt-3 text-[var(--error)]">{error}</p>}
      <p className="mt-4 text-sm">{t.confirm.irreversible}</p>
    </Dialog>
  );
}
