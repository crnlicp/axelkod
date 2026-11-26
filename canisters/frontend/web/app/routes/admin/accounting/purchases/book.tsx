// Booking workbench: the received file on the left (decrypted in the browser), the
// form on the right. Supplier first: it sets the VAT treatment and default account.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  PurchaseKind, Treatment, Variant_bank_cash, type Attachment, type PurchaseInput, type PurchaseView, type Supplier,
} from "../../../../bindings/accounting";
import { errField, ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { openDocument } from "../../../../admin/accounting/crypto";
import { formatOre } from "../../../../admin/accounting/money";
import { RATES, REVERSE, previewLines, suggestedAccount, vatOf } from "../../../../admin/accounting/purchases";
import { AccountPicker } from "../../../../admin/accounting/ui/AccountPicker";
import { ConfirmPost } from "../../../../admin/accounting/ui/ConfirmPost";
import { EMPTY_SUPPLIER, SupplierDialog } from "../../../../admin/accounting/ui/SupplierDialog";
import { DocRef, Money, MoneyInput, PageHead, input, label } from "../../../../admin/accounting/ui/kit";
import { IconPlus } from "../../../../components/Icons";
import { Toast } from "../../../../admin/toast";

type Line = { account: bigint | null; net: bigint | null; rateBp: bigint; vat: bigint | null; vatTouched: boolean; text: string };
type Form = {
  kind: PurchaseKind; supplierId: bigint | null; payee: string; paidFrom: Variant_bank_cash; docDate: string; dueDate: string; docNumber: string;
  paymentRef: string; description: string; currency: string; fx: string; fxDate: string; treatment: Treatment; creditOf: bigint | null; lines: Line[];
};

const emptyLine = (account: bigint | null = null): Line => ({ account, net: null, rateBp: 2500n, vat: null, vatTouched: false, text: "" });
const fxToRate = (s: string): bigint | null => {
  const m = /^(\d+)(?:[.,](\d{1,6}))?$/.exec(s.trim());
  return m ? BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0")) : null;
};
const opt = (s: string) => (s.trim() ? s.trim() : undefined);

export default function Book() {
  const t = useAccT();
  const p = t.purchases;
  const w = p.workbench;
  const err = useErr();
  const navigate = useNavigate();
  const { id } = useParams();
  const { acc, vault, data, href } = useAcc();
  const [file, setFile] = useState<{ a: Attachment; url: string | null } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [earlier, setEarlier] = useState<PurchaseView[]>([]);
  const [f, setF] = useState<Form>({
    kind: PurchaseKind.supplierInvoice, supplierId: null, payee: "", paidFrom: Variant_bank_cash.bank, docDate: today(), dueDate: "", docNumber: "",
    paymentRef: "", description: "", currency: "SEK", fx: "", fxDate: today(), treatment: Treatment.domestic, creditOf: null, lines: [emptyLine()],
  });
  const [bad, setBad] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PurchaseInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PurchaseView | null>(null);
  const [newSupplier, setNewSupplier] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: p.title, to: "/admin/accounting/purchases" }, { label: w.title }]);

  const attachmentId = BigInt(id ?? "0");
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    (async () => {
      try {
        const a = ok(await acc.getAttachment(attachmentId));
        if (!live) return;
        setFile({ a, url: null });
        if (a.mime === "application/pdf" || a.mime === "image/jpeg" || a.mime === "image/png") {
          url = URL.createObjectURL(await openDocument(acc, vault, a));
          if (live) setFile({ a, url });
        }
      } catch (e) { if (live) setFileError(err(e)); }
    })();
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [acc, vault, attachmentId, err]);

  const loadSuppliers = useCallback(async () => {
    setSuppliers(ok(await acc.listSuppliers()).filter((s) => s.active));
    setEarlier(ok(await acc.listPurchases([], 0n, 200n)).items);
  }, [acc]);
  useEffect(() => { void loadSuppliers().catch((e) => setStatus({ ok: false, text: err(e) })); }, [loadSuppliers, err]);

  const set = (x: Partial<Form>) => setF((c) => ({ ...c, ...x }));
  const setLine = (i: number, x: Partial<Line>) => setF((c) => ({
    ...c, lines: c.lines.map((l, j) => {
      if (j !== i) return l;
      const n = { ...l, ...x };
      if (!n.vatTouched && ("net" in x || "rateBp" in x)) n.vat = n.net === null ? null : vatOf(n.net, n.rateBp);
      if (REVERSE.has(c.treatment) && "rateBp" in x) n.account = suggestedAccount(c.treatment, n.rateBp) ?? n.account;
      return n;
    }),
  }));

  /** A supplier sets the treatment and the account: its default, else the last purchase's. */
  function chooseSupplier(sid: bigint | null) {
    const s = suppliers.find((x) => x.id === sid);
    if (!s) { set({ supplierId: null }); return; }
    const last = earlier.find((v) => v.purchase.supplierId === sid)?.purchase.lines[0]?.account;
    const account = s.defaultAccount ?? last ?? suggestedAccount(s.treatment, 2500n);
    setF((c) => ({ ...c, supplierId: sid, treatment: s.treatment, currency: s.country === "SE" ? "SEK" : c.currency, lines: c.lines.map((l, i) => (i === 0 && l.account === null ? { ...l, account } : l)) }));
  }

  function chooseTreatment(tr: Treatment) {
    setF((c) => ({ ...c, treatment: tr, lines: c.lines.map((l) => (tr === Treatment.importVat ? { ...l, account: 2645n, rateBp: l.rateBp === 0n ? 2500n : l.rateBp } : REVERSE.has(tr) ? { ...l, account: suggestedAccount(tr, l.rateBp === 0n ? 2500n : l.rateBp) ?? l.account, rateBp: l.rateBp === 0n ? 2500n : l.rateBp } : l)) }));
  }

  const domestic = f.treatment === Treatment.domestic;
  const reverse = REVERSE.has(f.treatment);
  // Import VAT (tullräkning): the lines are the tax base; nothing is payable (V3, 13:35).
  const isImport = f.treatment === Treatment.importVat;
  const lineVat = (l: Line) => (domestic ? l.vat ?? 0n : 0n);
  const total = isImport ? 0n : f.lines.reduce((s, l) => s + (l.net ?? 0n) + lineVat(l), 0n);
  const rcVat = reverse || isImport ? f.lines.reduce((s, l) => s + vatOf(l.net ?? 0n, l.rateBp), 0n) : 0n;
  const openInvoices = useMemo(() => earlier.filter((v) => v.purchase.kind === PurchaseKind.supplierInvoice && v.purchase.supplierId === f.supplierId && v.balance > 0n), [earlier, f.supplierId]);
  const hint = f.supplierId !== null ? earlier.find((v) => v.purchase.supplierId === f.supplierId) : undefined;

  function build(): PurchaseInput | null {
    const fxRate = f.currency !== "SEK" ? fxToRate(f.fx) : null;
    if (f.currency !== "SEK" && !fxRate) { setBad("fxRate"); setStatus({ ok: false, text: t.errors.invalid(t.errors.fields.fxRate) }); return null; }
    if (f.lines.some((l) => (l.account === null && !isImport) || l.net === null)) { setBad("lines"); setStatus({ ok: false, text: t.errors.invalid(t.errors.fields["lines[].amount"]) }); return null; }
    return {
      kind: f.kind, supplierId: f.supplierId ?? undefined, payee: opt(f.payee), docDate: f.docDate, dueDate: opt(f.dueDate), docNumber: opt(f.docNumber),
      currency: f.currency, fxRate: fxRate ? { rate: fxRate, date: f.fxDate } : undefined, treatment: f.treatment, total,
      lines: f.lines.map((l) => ({ account: isImport ? 2645n : l.account!, net: l.net!, rateBp: f.treatment === Treatment.noVat || (domestic && lineVat(l) === 0n && l.rateBp === 0n) ? 0n : l.rateBp, vat: lineVat(l), text: opt(l.text) })),
      paymentRef: opt(f.paymentRef), paidFrom: f.kind === PurchaseKind.receipt ? f.paidFrom : undefined, creditOf: f.kind === PurchaseKind.creditNote ? f.creditOf ?? undefined : undefined,
      description: f.description.trim(), attachmentIds: [attachmentId],
    };
  }

  async function book() {
    if (!confirm) return;
    setBusy(true);
    try {
      const v = ok(await acc.bookPurchase(confirm));
      setConfirm(null);
      setDone(v);
      setStatus({ ok: true, text: w.done });
    } catch (e) { setConfirm(null); setBad(errField(e)); setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  async function next() {
    const inbox = ok(await acc.listInbox());
    navigate(href(inbox.length ? `/admin/accounting/purchases/book/${inbox[0].id}` : "/admin/accounting/purchases"));
  }

  const cashDeferred = data?.settings.accountingMethod === "cash" && !isImport && (f.kind === PurchaseKind.supplierInvoice || f.kind === PurchaseKind.creditNote);
  const needsSupplier = f.kind === PurchaseKind.supplierInvoice || f.kind === PurchaseKind.creditNote;
  const inv = (k: string) => (bad === k ? true : undefined);

  return (
    <>
      <PageHead title={w.title} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="wb-file" className="card lg:sticky lg:top-24 lg:self-start">
          <h2 id="wb-file" className="mb-3 text-xl">{w.file}{file ? `: ${file.a.filename}` : ""}</h2>
          {fileError ? <p role="alert" className="text-[var(--error)]">{fileError}</p>
            : !file ? <p role="status">{w.fileLoading}</p>
            : file.url && file.a.mime === "application/pdf" ? <iframe src={file.url} title={file.a.filename} className="h-[70vh] w-full rounded-lg border border-border bg-white" />
            : file.url ? <img src={file.url} alt={file.a.filename} className="max-h-[70vh] w-full rounded-lg object-contain" />
            : <p className="text-muted">{w.fileNoPreview}</p>}
        </section>

        {done ? (
          <section className="card space-y-4" aria-live="polite">
            <p className="text-lg font-semibold">{w.done}</p>
            {done.purchase.voucherId !== undefined && <p><DocRef id={done.purchase.voucherId} label={t.voucher.title(`#${done.purchase.voucherId}`)} /></p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={() => void next()}>{w.next}</button>
              <Link to={href("/admin/accounting/purchases")} className="btn btn-secondary">{t.common.back}</Link>
            </div>
          </section>
        ) : (
          <form className="card space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); const x = build(); if (x) { setBad(null); setConfirm(x); } }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="wb-kind" className={label}>{w.kind}</label>
                <select id="wb-kind" className={input} value={f.kind} onChange={(e) => set({ kind: e.target.value as PurchaseKind })}>
                  {Object.values(PurchaseKind).map((k) => <option key={k} value={k}>{p.kind[k]}</option>)}
                </select></div>
              <div>
                <label htmlFor="wb-sup" className={label}>{w.supplier}{needsSupplier ? "" : ` (${t.common.optional})`}</label>
                <div className="flex gap-2">
                  <select id="wb-sup" className={input} value={f.supplierId === null ? "" : String(f.supplierId)} aria-invalid={inv("supplierId")}
                    onChange={(e) => chooseSupplier(e.target.value ? BigInt(e.target.value) : null)}>
                    <option value="">{w.chooseSupplier}</option>
                    {suppliers.map((s) => <option key={String(s.id)} value={String(s.id)}>{s.name}</option>)}
                  </select>
                  <button type="button" className="btn btn-secondary mt-1 px-3" onClick={() => setNewSupplier(true)} aria-label={w.newSupplier} title={w.newSupplier}><IconPlus className="h-5 w-5" /></button>
                </div>
                {hint && <p className="mt-1 text-xs text-muted">{w.suggested(`${hint.purchase.lines[0]?.account ?? ""} · ${p.treatment[hint.purchase.treatment]}`)}</p>}
              </div>
              {f.kind === PurchaseKind.expenseClaim && <div><label htmlFor="wb-payee" className={label}>{w.payee}</label><input id="wb-payee" className={input} value={f.payee} aria-invalid={inv("payee")} onChange={(e) => set({ payee: e.target.value })} /></div>}
              {f.kind === PurchaseKind.receipt && <div><label htmlFor="wb-from" className={label}>{w.paidFrom}</label>
                <select id="wb-from" className={input} value={f.paidFrom} onChange={(e) => set({ paidFrom: e.target.value as Variant_bank_cash })}>
                  <option value={Variant_bank_cash.bank}>{w.bank}</option><option value={Variant_bank_cash.cash}>{w.cash}</option>
                </select></div>}
              {f.kind === PurchaseKind.creditNote && <div><label htmlFor="wb-cr" className={label}>{w.creditOf} ({t.common.optional})</label>
                <select id="wb-cr" className={input} value={f.creditOf === null ? "" : String(f.creditOf)} aria-invalid={inv("creditOf")} onChange={(e) => set({ creditOf: e.target.value ? BigInt(e.target.value) : null })}>
                  <option value="">–</option>
                  {openInvoices.map((v) => <option key={String(v.purchase.id)} value={String(v.purchase.id)}>{v.purchase.docNumber ?? v.purchase.id.toString()} ({formatOre(v.balance)})</option>)}
                </select></div>}
              <div><label htmlFor="wb-date" className={label}>{w.docDate}</label><input id="wb-date" type="date" max={today()} className={input} value={f.docDate} aria-invalid={inv("docDate")} onChange={(e) => set({ docDate: e.target.value })} /></div>
              {(f.kind === PurchaseKind.supplierInvoice || f.kind === PurchaseKind.expenseClaim) && <div><label htmlFor="wb-due" className={label}>{w.dueDate} ({t.common.optional})</label><input id="wb-due" type="date" className={input} value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></div>}
              <div><label htmlFor="wb-no" className={label}>{w.docNumber} ({t.common.optional})</label><input id="wb-no" className={input} maxLength={60} value={f.docNumber} onChange={(e) => set({ docNumber: e.target.value })} /></div>
              {f.kind === PurchaseKind.supplierInvoice && <div><label htmlFor="wb-ocr" className={label}>{w.paymentRef} ({t.common.optional})</label><input id="wb-ocr" className={input} maxLength={60} value={f.paymentRef} onChange={(e) => set({ paymentRef: e.target.value })} /></div>}
              <div className="sm:col-span-2"><label htmlFor="wb-desc" className={label}>{w.description}</label><input id="wb-desc" className={input} maxLength={200} value={f.description} aria-invalid={inv("description")} onChange={(e) => set({ description: e.target.value })} /></div>
              <div><label htmlFor="wb-cur" className={label}>{w.currency}</label><input id="wb-cur" className={input} maxLength={3} value={f.currency} aria-invalid={inv("currency")} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} /></div>
              {f.currency !== "SEK" && <>
                <div><label htmlFor="wb-fx" className={label}>{w.fxRate}</label><input id="wb-fx" inputMode="decimal" className={input} value={f.fx} aria-invalid={inv("fxRate")} onChange={(e) => set({ fx: e.target.value })} /></div>
                <div><label htmlFor="wb-fxd" className={label}>{w.fxDate}</label><input id="wb-fxd" type="date" className={input} value={f.fxDate} onChange={(e) => set({ fxDate: e.target.value })} /></div>
              </>}
              <div className="sm:col-span-2"><label htmlFor="wb-tr" className={label}>{w.treatment}</label>
                <select id="wb-tr" className={input} value={f.treatment} aria-describedby="wb-tr-hint" onChange={(e) => chooseTreatment(e.target.value as Treatment)}>
                  {Object.values(Treatment).map((x) => <option key={x} value={x}>{p.treatment[x]}</option>)}
                </select>
                <p id="wb-tr-hint" className="mt-1 text-xs text-muted">{isImport ? p.importHint : p.treatmentHint}</p></div>
            </div>

            <fieldset className="space-y-3">
              <legend className={label}>{w.lines}</legend>
              {f.lines.map((l, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-6">
                  {!isImport && <div className="sm:col-span-6"><AccountPicker labelText={w.account(i + 1)} value={l.account} invalid={bad === "account" || bad === "lines"} onChange={(a) => setLine(i, { account: a?.number ?? null })} /></div>}
                  <div className="sm:col-span-2"><span className="text-sm text-muted">{w.net(i + 1)}</span><MoneyInput labelText={w.net(i + 1)} value={l.net} onChange={(v) => setLine(i, { net: v })} /></div>
                  {f.treatment !== Treatment.noVat && <div className="sm:col-span-2"><label htmlFor={`wb-r${i}`} className="text-sm text-muted">{w.rate(i + 1)}</label>
                    <select id={`wb-r${i}`} className={input} value={String(l.rateBp)} aria-invalid={inv("rateBp")} onChange={(e) => setLine(i, { rateBp: BigInt(e.target.value) })}>
                      {RATES.filter((r) => !(reverse || isImport) || r > 0n).map((r) => <option key={String(r)} value={String(r)}>{Number(r) / 100} %</option>)}
                    </select></div>}
                  {domestic && <div className="sm:col-span-2"><span className="text-sm text-muted">{w.vat(i + 1)}</span><MoneyInput labelText={w.vat(i + 1)} value={l.vat} onChange={(v) => setLine(i, { vat: v, vatTouched: true })} /></div>}
                  <div className="sm:col-span-5"><label htmlFor={`wb-t${i}`} className="sr-only">{w.text(i + 1)}</label><input id={`wb-t${i}`} placeholder={w.text(i + 1)} className={input} maxLength={200} value={l.text} onChange={(e) => setLine(i, { text: e.target.value })} /></div>
                  {f.lines.length > 1 && <button type="button" className="text-sm text-[var(--error)] underline sm:self-end" onClick={() => set({ lines: f.lines.filter((_, j) => j !== i) })}>{w.removeLine(i + 1)}</button>}
                </div>
              ))}
              <button type="button" className="btn btn-secondary" onClick={() => set({ lines: [...f.lines, emptyLine(f.lines[0]?.account ?? null)] })}><IconPlus className="h-4 w-4" /> {w.addLine}</button>
            </fieldset>

            <div className="rounded-lg border border-border p-3">
              <p className="flex justify-between font-semibold"><span>{w.total}</span><span><Money ore={total} /> {f.currency}</span></p>
              <p className="text-xs text-muted">{w.totalHint}</p>
              {(reverse || isImport) && <p className="mt-1 text-sm">{w.computedVat(formatOre(rcVat, true))}</p>}
              {cashDeferred && <p className="mt-1 text-sm text-muted">{w.cashMethod}</p>}
            </div>
            <button type="submit" className="btn btn-primary">{w.check}</button>
          </form>
        )}
      </div>
      {confirm && <ConfirmPost open onClose={() => setConfirm(null)} onConfirm={() => void book()} title={w.confirmTitle} busy={busy}
        creates={w.creates("L")} date={confirm.docDate} lines={previewLines(confirm)} button={p.book}
        extra={cashDeferred ? <p className="mt-4 text-sm">{w.cashMethod}</p> : undefined} />}
      {newSupplier && <SupplierDialog id={null} initial={EMPTY_SUPPLIER} onClose={() => setNewSupplier(false)}
        onSaved={async (s) => { setNewSupplier(false); setStatus({ ok: true, text: p.suppliers.saved }); await loadSuppliers(); setSuppliers((xs) => (xs.some((x) => x.id === s.id) ? xs : [...xs, s])); chooseSupplierLater(s); }} />}
      <Toast status={status} />
    </>
  );

  function chooseSupplierLater(s: Supplier) {
    setF((c) => ({ ...c, supplierId: s.id, treatment: s.treatment, lines: c.lines.map((l, i) => (i === 0 && l.account === null ? { ...l, account: s.defaultAccount ?? suggestedAccount(s.treatment, 2500n) } : l)) }));
  }
}
