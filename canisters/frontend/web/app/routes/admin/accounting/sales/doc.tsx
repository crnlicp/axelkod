// An issued sales document: lines from the stored snapshot (shown only when its hash
// matches), PDF and e-invoice, payments, credit notes, reminders, quote actions.
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { DocKind, PaymentMethod, Variant_accepted_declined, type AuditEntry, type DocView, type Reminder } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { hex } from "../../../../admin/accounting/canonical";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { matches, snapshot as encodeSnapshot } from "../../../../admin/accounting/encode";
import { saveFile } from "../../../../admin/accounting/pdf/client";
import { docJob, docName, formatPct, formatQty, reminderJob, statusOf } from "../../../../admin/accounting/sales";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { DocRef, HashBadge, LockChip, Money, MoneyInput, PageHead, StatusChip, fmtTime, input, label } from "../../../../admin/accounting/ui/kit";
import { useAdminLang } from "../../../../admin/i18n";
import { Toast } from "../../../../admin/toast";

type Loaded = { v: DocView; hashOk: boolean; reminders: Reminder[]; audit: AuditEntry[]; refs: Map<bigint, string> };

export default function SalesDocPage() {
  const t = useAccT();
  const s = t.sales;
  const err = useErr();
  const { acc, href, canBook, accountName } = useAcc();
  const { t: at } = useAdminLang();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [d, setD] = useState<Loaded | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>((location.state as { message?: string } | null)?.message ? { ok: true, text: (location.state as { message: string }).message } : null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      const v = ok(await acc.getSalesDoc(BigInt(id!)));
      const related = [...v.credits, ...v.invoices, ...(v.doc.creditOf !== undefined ? [v.doc.creditOf] : []), ...(v.doc.quoteOf !== undefined ? [v.doc.quoteOf] : [])];
      const [hashOk, rems, audit, rel] = await Promise.all([
        matches(encodeSnapshot(v.doc.snapshot), v.doc.contentHash),
        v.reminders.length ? acc.listReminders(0n, 200n).then((r) => ok(r).items.filter((x) => x.salesDocId === v.doc.id)) : Promise.resolve([]),
        acc.auditFor("salesDoc", v.doc.id).then(ok),
        Promise.all(related.map(async (r) => ok(await acc.getSalesDoc(r)).doc)),
      ]);
      setD({ v, hashOk, reminders: rems, audit, refs: new Map(rel.map((x) => [x.id, docName(t, x)])) });
    } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }, [acc, id, err, t]);
  useEffect(() => { void load(); }, [load]);

  const title = d ? docName(t, d.v.doc) : "…";
  useCrumbs([{ label: s.title, to: "/admin/accounting/sales/invoices" }, { label: title }]);
  if (!d) return <><p role="status">{t.common.loading}</p><Toast status={status} /></>;
  const { v } = d;
  const x = v.doc.snapshot;
  const st = statusOf(v.status);
  const cur = x.currency;
  const isInvoice = v.doc.kind === DocKind.invoice;
  const isQuote = v.doc.kind === DocKind.quote;

  async function run(f: () => Promise<void>) {
    try { await f(); } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }

  const peppol = () => run(async () => {
    const { toUbl, PeppolError } = await import("../../../../admin/accounting/peppol");
    try {
      saveFile(new Blob([toUbl(x)], { type: "application/xml" }), `${v.doc.kind === DocKind.creditNote ? "kreditfaktura" : "faktura"}-${x.number}.xml`);
    } catch (e) {
      if (e instanceof PeppolError) setStatus({ ok: false, text: s.doc.peppolMissing }); else throw e;
    }
  });

  const actions = (
    <>
      {d.hashOk && <PdfActions fileName={`${docName(t, v.doc).toLowerCase().replace(/\s+/g, "-")}.pdf`} job={() => docJob(v.doc, acc)} />}
      {d.hashOk && !isQuote && <button type="button" className="btn btn-secondary" onClick={() => void peppol()}>{s.doc.peppol}</button>}
      {canBook && isInvoice && v.balance > 0n && <button type="button" className="btn btn-primary" onClick={() => setPaying(true)}>{s.doc.registerPayment}</button>}
      {canBook && isInvoice && x.hus && v.paid > 0n && <Link className="btn btn-secondary no-underline" to={href(`/admin/accounting/rot-rut?invoice=${v.doc.id}`)}>{t.rotRut.doc.claim}</Link>}
      {canBook && isInvoice && v.credited < v.payable && (
        <button type="button" className="btn btn-secondary" onClick={() => run(async () => { const dr = ok(await acc.creditDraftFrom(v.doc.id)); navigate(href(`/admin/accounting/sales/new?draft=${dr.id}`)); })}>{s.doc.credit}</button>
      )}
      {canBook && isInvoice && v.overdue && (
        <button type="button" className="btn btn-secondary" onClick={() => run(async () => { const r = ok(await acc.createReminder(v.doc.id, today())); setStatus({ ok: true, text: s.reminder.created(String(r.number)) }); await load(); })}>{s.doc.remind}</button>
      )}
      {canBook && isQuote && v.status.__kind__ === "quote" && v.status.quote === "sent" && <>
        <button type="button" className="btn btn-secondary" onClick={() => run(async () => { ok(await acc.setQuoteStatus(v.doc.id, Variant_accepted_declined.accepted)); await load(); })}>{s.doc.accept}</button>
        <button type="button" className="btn btn-secondary" onClick={() => run(async () => { ok(await acc.setQuoteStatus(v.doc.id, Variant_accepted_declined.declined)); await load(); })}>{s.doc.decline}</button>
      </>}
      {canBook && isQuote && (
        <button type="button" className="btn btn-secondary" onClick={() => run(async () => { const dr = ok(await acc.invoiceDraftFromQuote(v.doc.id)); navigate(href(`/admin/accounting/sales/new?draft=${dr.id}`)); })}>{s.doc.toInvoice}</button>
      )}
    </>
  );

  const ref = (i: bigint) => <Link to={href(`/admin/accounting/sales/docs/${i}`)}>{d.refs.get(i) ?? `#${i}`}</Link>;

  return (
    <>
      <PageHead title={title} actions={actions}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={st.tone}>{s.status[st.key]}</StatusChip>
          <LockChip />
          {v.doc.creditOf !== undefined && <span className="text-sm">{s.doc.creditOf(d.refs.get(v.doc.creditOf) ?? "")}</span>}
          {v.doc.quoteOf !== undefined && <span className="text-sm">{s.doc.fromQuote(d.refs.get(v.doc.quoteOf) ?? "")}</span>}
        </div>
      </PageHead>

      {!d.hashOk ? <p role="alert" className="card text-[var(--error)]">{s.doc.hashBad}</p> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="card overflow-x-auto" aria-labelledby="doc-lines">
            <h2 id="doc-lines" className="text-2xl">{x.buyer.name}</h2>
            <p className="text-sm text-muted">{x.buyer.address.street}, {x.buyer.address.postalCode} {x.buyer.address.city} {x.buyer.address.country !== "SE" ? x.buyer.address.country : ""}{x.buyer.vatNr ? ` · ${x.buyer.vatNr}` : ""}</p>
            <table className="mt-4 w-full text-sm">
              <caption className="sr-only">{s.editor.lines}</caption>
              <thead><tr className="border-b border-border text-left text-muted">
                <th scope="col" className="py-2">{t.common.text}</th><th scope="col" className="py-2 text-right">{s.quantity}</th>
                <th scope="col" className="py-2 text-right">{t.common.amount}</th><th scope="col" className="py-2 text-right">VAT</th>
              </tr></thead>
              <tbody>
                {x.lines.map((l, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-2">{l.description}<span className="block text-xs text-muted">{formatQty(l.quantity)} {l.unit} × <Money ore={l.unitPrice} />{l.discountBp ? ` − ${formatPct(l.discountBp)} %` : ""} · {String(l.account)} {accountName(l.account)}</span></td>
                    <td className="py-2 text-right">{formatQty(l.quantity)}</td>
                    <td className="py-2 text-right"><Money ore={l.net} /></td>
                    <td className="py-2 text-right">{formatPct(l.rateBp)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto mt-4 grid max-w-xs grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt className="text-muted">{s.editor.net}</dt><dd className="text-right"><Money ore={x.totalNet} /> {cur}</dd>
              <dt className="text-muted">{s.editor.vatTotal}</dt><dd className="text-right"><Money ore={x.totalVat} /> {cur}</dd>
              <dt className="font-semibold">{s.editor.total}</dt><dd className="text-right font-semibold"><Money ore={x.total} /> {cur}</dd>
              {x.hus && <>
                <dt className="text-muted">{t.rotRut.doc.deduction} ({t.rotRut.kind[x.hus.kind]})</dt><dd className="text-right">−<Money ore={x.hus.deduction} /></dd>
                <dt className="font-semibold">{t.rotRut.doc.payable}</dt><dd className="text-right font-semibold"><Money ore={x.total - x.hus.deduction} /> {cur}</dd>
                {v.payable > x.total - x.hus.deduction && <><dt className="text-muted">{t.rotRut.doc.refused}</dt><dd className="text-right"><Money ore={v.payable - (x.total - x.hus.deduction)} /></dd></>}
              </>}
            </dl>
            {x.legalNotes.map((n) => <p key={n} className="mt-2 font-semibold">{n}</p>)}
          </section>

          <aside className="space-y-6">
            <section className="card text-sm" aria-label={s.doc.timeline}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
                <dt className="text-muted">{s.issueDate}</dt><dd>{x.issueDate}</dd>
                {x.deliveryDate && <><dt className="text-muted">{s.editor.delivery}</dt><dd>{x.deliveryDate}</dd></>}
                {x.dueDate && <><dt className="text-muted">{s.due}</dt><dd>{x.dueDate}</dd></>}
                {x.validUntil && <><dt className="text-muted">{s.validUntil}</dt><dd>{x.validUntil}</dd></>}
                {x.ocr && <><dt className="text-muted">OCR</dt><dd className="font-mono">{x.ocr}</dd></>}
                {isInvoice && <>
                  <dt className="text-muted">{s.doc.paid}</dt><dd><Money ore={v.paid} /> {cur}</dd>
                  {v.credited > 0n && <><dt className="text-muted">{s.doc.credited}</dt><dd><Money ore={v.credited} /> {cur}</dd></>}
                  <dt className="font-semibold">{s.balance}</dt><dd className="font-semibold"><Money ore={v.balance} /> {cur}</dd>
                </>}
                {v.doc.voucherId !== undefined && <><dt className="text-muted">{s.doc.voucher}</dt><dd><DocRef id={v.doc.voucherId} label={`#${v.doc.voucherId}`} search={href("")} /></dd></>}
                <dt className="text-muted">{t.voucher.retain}</dt><dd>{v.doc.retainUntil}</dd>
                <dt className="text-muted">{t.voucher.hash}</dt><dd><HashBadge hash={hex(Uint8Array.from(v.doc.contentHash))} state="ok" okText={s.doc.hashOk} /></dd>
              </dl>
            </section>
            {(v.credits.length > 0 || v.invoices.length > 0) && (
              <section className="card text-sm" aria-label={s.doc.credits}>
                <ul className="space-y-1">{[...v.credits, ...v.invoices].map((c) => <li key={String(c)}>{ref(c)}</li>)}</ul>
              </section>
            )}
            {isInvoice && (
              <section className="card text-sm" aria-labelledby="pay-h">
                <h2 id="pay-h" className="text-xl">{s.doc.payments}</h2>
                {v.payments.length ? <ul className="mt-2 space-y-1">{v.payments.map((p) => (
                  <li key={String(p.id)} className="flex justify-between gap-2"><span>{p.date} · {s.payment.methods[p.method]}</span><span><Money ore={p.amount} /> <DocRef id={p.voucherId} label={`#${p.voucherId}`} search={href("")} /></span></li>
                ))}</ul> : <p className="mt-2 text-muted">{s.payment.empty}</p>}
              </section>
            )}
            {d.reminders.length > 0 && (
              <section className="card text-sm" aria-labelledby="rem-h">
                <h2 id="rem-h" className="text-xl">{s.doc.reminders}</h2>
                <ul className="mt-2 space-y-2">{d.reminders.map((r) => (
                  <li key={String(r.id)} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{String(r.number)} · {r.date} · <Money ore={r.fee + r.interest} /></span>
                    <PdfActions preview={false} label="PDF" fileName={`paminnelse-${r.number}.pdf`} job={() => reminderJob(r)} />
                  </li>
                ))}</ul>
              </section>
            )}
            <section className="card text-sm" aria-labelledby="audit-h">
              <h2 id="audit-h" className="text-xl">{t.voucher.audit}</h2>
              <ol className="mt-2 space-y-2">
                {d.audit.map((a) => <li key={String(a.seq)}><span className="font-semibold">{a.action}</span> · {fmtTime(a.at, at.locale)}</li>)}
              </ol>
            </section>
          </aside>
        </div>
      )}
      {paying && <PaymentDialog view={v} onClose={() => setPaying(false)} onDone={async (m) => { setPaying(false); setStatus({ ok: true, text: m }); await load(); }} />}
      <Toast status={status} />
    </>
  );
}

function PaymentDialog({ view, onClose, onDone }: { view: DocView; onClose: () => void; onDone: (m: string) => void }) {
  const t = useAccT();
  const p = t.sales.payment;
  const err = useErr();
  const { acc } = useAcc();
  const cur = view.doc.snapshot.currency;
  const [f, setF] = useState({ date: today(), amount: view.balance as bigint | null, amountSek: null as bigint | null, interest: null as bigint | null, fees: null as bigint | null, method: PaymentMethod.bankgiro, reference: view.doc.snapshot.ocr ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    try {
      ok(await acc.registerPayment({
        salesDocId: view.doc.id, date: f.date, amount: f.amount ?? 0n, amountSek: cur !== "SEK" ? f.amountSek ?? undefined : undefined,
        interest: f.interest ?? 0n, fees: f.fees ?? 0n, method: f.method, reference: f.reference.trim() || undefined,
      }));
      onDone(p.done);
    } catch (e) { setError(err(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={onClose} title={p.title}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>{t.common.cancel}</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{p.save}</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="p-date" className={label}>{p.date}</label><input id="p-date" type="date" max={today()} className={input} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><span className={label}>{p.amount} ({cur})</span><MoneyInput value={f.amount} labelText={p.amount} onChange={(v) => setF({ ...f, amount: v })} /></div>
        {cur !== "SEK" && <div><span className={label}>{p.amountSek}</span><MoneyInput value={f.amountSek} labelText={p.amountSek} onChange={(v) => setF({ ...f, amountSek: v })} /></div>}
        <div><span className={label}>{p.interest}</span><MoneyInput value={f.interest} labelText={p.interest} onChange={(v) => setF({ ...f, interest: v })} /></div>
        <div><span className={label}>{p.fees}</span><MoneyInput value={f.fees} labelText={p.fees} onChange={(v) => setF({ ...f, fees: v })} /></div>
        <div><label htmlFor="p-m" className={label}>{p.method}</label>
          <select id="p-m" className={input} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}>
            {Object.values(PaymentMethod).map((m) => <option key={m} value={m}>{p.methods[m]}</option>)}
          </select></div>
        <div className="sm:col-span-2"><label htmlFor="p-ref" className={label}>{p.reference}</label><input id="p-ref" className={input} maxLength={100} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
      </div>
      {error && <p role="alert" className="mt-3 text-[var(--error)]">{error}</p>}
      <p className="mt-4 text-sm">{t.confirm.irreversible}</p>
    </Dialog>
  );
}
