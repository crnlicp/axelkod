// Invoice / quote / credit note editor. Customer first (it sets language and terms),
// then lines. The draft autosaves; totals, VAT, legal notes and OCR come from the
// canister's preview, which runs the same checks as issuing.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { DocKind, Lang, type Customer, type DocInput, type DocLine, type Item, type SalesDraft, type Snapshot } from "../../../../bindings/accounting";
import { AccountingError, ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { formatOre } from "../../../../admin/accounting/money";
import { docName, formatPct, formatQty, parsePct, parseQty } from "../../../../admin/accounting/sales";
import { ConfirmPost, type ConfirmLine } from "../../../../admin/accounting/ui/ConfirmPost";
import { HusEditor, emptyHus, fromHusInput, husProblem, toHusInput, type HusForm } from "../../../../admin/accounting/ui/HusEditor";
import { Money, MoneyInput, PageHead, input as inputCls, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

type Row = { key: number; itemId?: bigint; description: string; qty: string; unit: string; price: bigint | null; discount: string; vatCode: string; account: bigint };
let nextKey = 1;
const emptyRow = (): Row => ({ key: nextKey++, description: "", qty: "1", unit: "st", price: null, discount: "", vatCode: "U25", account: 3001n });
const fromLine = (l: DocLine): Row => ({ key: nextKey++, itemId: l.itemId, description: l.description, qty: formatQty(l.quantity), unit: l.unit, price: l.unitPrice, discount: l.discountBp ? formatPct(l.discountBp) : "", vatCode: l.vatCode, account: l.account });

type Form = {
  customerId: bigint | null; language: Lang; termsDays: string; currency: string; fx: string; fxDate: string; deliveryDate: string; validUntil: string;
  ourRef: string; yourRef: string; notes: string; rows: Row[];
};

const fxToRate = (s: string): bigint | null => {
  const m = /^(\d+)(?:[.,](\d{1,6}))?$/.exec(s.trim());
  return m ? BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0")) : null;
};
/** Editor rows that become document lines (an empty row is dropped). */
const kept = (rows: Row[]) => rows.filter((r) => r.description.trim() || r.price !== null);
const rateToFx = (r: bigint) => (Number(r) / 1_000_000).toLocaleString("sv-SE", { maximumFractionDigits: 6, useGrouping: false });

export default function SalesEditor() {
  const t = useAccT();
  const s = t.sales;
  const e = s.editor;
  const err = useErr();
  const { acc, data, href, canBook, accountName } = useAcc();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const draftParam = params.get("draft");
  const [kind, setKind] = useState<DocKind>((params.get("kind") as DocKind) || DocKind.invoice);
  const [draft, setDraft] = useState<SalesDraft | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState<Form>({
    customerId: null, language: Lang.sv, termsDays: String(data?.settings.invoiceTermsDays ?? 30n), currency: "SEK", fx: "", fxDate: "", deliveryDate: "", validUntil: "",
    ourRef: "", yourRef: "", notes: "", rows: [emptyRow()],
  });
  const [loaded, setLoaded] = useState(!draftParam);
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const [previewErr, setPreviewErr] = useState<{ text: string; field: string | null } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creditOfNumber, setCreditOfNumber] = useState<bigint | null>(null);
  const [hus, setHus] = useState<HusForm>(emptyHus());
  const dirty = useRef(false);
  useCrumbs([{ label: s.title, to: "/admin/accounting/sales/invoices" }, { label: draft ? e.draft(Number(draft.id)) : e[kind] }]);

  useEffect(() => {
    Promise.all([acc.listCustomers(), acc.listItems()]).then(([c, i]) => { setCustomers(ok(c).filter((x) => x.active)); setItems(ok(i).filter((x) => x.active)); })
      .catch((x) => setStatus({ ok: false, text: err(x) }));
  }, [acc, err]);

  // Load a draft (also those made by "Kreditera" and "Gör om till faktura").
  useEffect(() => {
    if (!draftParam || (draft && String(draft.id) === draftParam)) return;
    void (async () => {
      try {
        const d = ok(await acc.listSalesDrafts()).find((x) => String(x.id) === draftParam);
        if (!d) throw new Error(t.errors.notFound);
        const i = d.input;
        setDraft(d);
        setKind(d.kind);
        const rows = i.lines.length ? i.lines.map(fromLine) : [emptyRow()];
        setForm({
          customerId: i.customerId, language: i.language, termsDays: String(i.termsDays), currency: i.currency, fx: i.fxRate ? rateToFx(i.fxRate.rate) : "",
          fxDate: i.fxRate?.date ?? "", deliveryDate: i.deliveryDate ?? "", validUntil: i.validUntil ?? "", ourRef: i.ourRef ?? "", yourRef: i.yourRef ?? "",
          notes: i.notes ?? "", rows,
        });
        if (i.hus) setHus(await fromHusInput(acc, i.hus, rows.map((r) => r.key)));
        if (d.creditOf !== undefined) setCreditOfNumber(ok(await acc.getSalesDoc(d.creditOf)).doc.number);
        setLoaded(true);
      } catch (x) { setStatus({ ok: false, text: err(x) }); }
    })();
  }, [acc, draftParam, draft, err, t]);

  const update = (f: Partial<Form>) => { dirty.current = true; setForm((x) => ({ ...x, ...f })); };
  const setRow = (key: number, r: Partial<Row>) => update({ rows: form.rows.map((x) => (x.key === key ? { ...x, ...r } : x)) });

  const toInput = useCallback((): DocInput | null => {
    if (form.customerId === null) return null;
    const lines: DocLine[] = [];
    for (const r of kept(form.rows)) {
      lines.push({
        itemId: r.itemId, description: r.description, quantity: parseQty(r.qty) ?? 0n, unit: r.unit, unitPrice: r.price ?? 0n,
        discountBp: r.discount.trim() ? parsePct(r.discount) ?? 0n : 0n, vatCode: r.vatCode, account: r.account,
      });
    }
    const fx = fxToRate(form.fx);
    const opt = (v: string) => (v.trim() ? v.trim() : undefined);
    return {
      customerId: form.customerId, language: form.language, termsDays: BigInt(Math.max(0, Math.min(365, Number(form.termsDays) || 0))),
      currency: form.currency.trim().toUpperCase(), fxRate: form.currency !== "SEK" && fx !== null && form.fxDate ? { rate: fx, date: form.fxDate } : undefined,
      deliveryDate: opt(form.deliveryDate), validUntil: opt(form.validUntil), ourRef: opt(form.ourRef), yourRef: opt(form.yourRef), notes: opt(form.notes), lines,
    };
  }, [form]);

  const saveAndPreview = useCallback(async (quiet: boolean) => {
    const base = toInput();
    if (!base) return null;
    try {
      const input = kind === DocKind.creditNote ? base : { ...base, hus: await toHusInput(acc, hus, kept(form.rows).map((r) => r.key)) };
      const d = ok(await acc.saveSalesDraft(draft?.id ?? null, kind, input, draft?.creditOf ?? null, draft?.quoteOf ?? null));
      setDraft(d);
      dirty.current = false;
      setSavedAt(new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }));
      if (!draftParam) navigate(href(`/admin/accounting/sales/new?draft=${d.id}`), { replace: true });
      const p = await acc.previewSalesDraft(d.id);
      if (p.__kind__ === "ok") { setPreview(p.ok); setPreviewErr(null); return p.ok; }
      setPreview(null);
      setPreviewErr({ text: err(new AccountingError(p.err)), field: p.err.__kind__ === "invalid" ? p.err.invalid : null });
    } catch (x) { if (!quiet) setStatus({ ok: false, text: err(x) }); }
    return null;
  }, [acc, draft, kind, toInput, err, draftParam, navigate, href, hus, form.rows]);

  useEffect(() => {
    if (!loaded || !canBook || !dirty.current || form.customerId === null) return;
    const id = setTimeout(() => void saveAndPreview(true), 1500);
    return () => clearTimeout(id);
  }, [form, hus, loaded, canBook, saveAndPreview]);

  async function issue() {
    if (!draft) return;
    setBusy(true);
    try {
      const v = ok(await acc.issueSalesDraft(draft.id));
      navigate(href(`/admin/accounting/sales/docs/${v.doc.id}`), { state: { message: e.issued(s.kind[v.doc.kind], String(v.doc.number)) } });
    } catch (x) { setConfirm(false); setStatus({ ok: false, text: err(x) }); } finally { setBusy(false); }
  }

  async function removeDraft() {
    if (!draft) return;
    try { ok(await acc.deleteSalesDraft(draft.id)); navigate(href(kind === DocKind.quote ? "/admin/accounting/sales/quotes" : "/admin/accounting/sales/invoices")); }
    catch (x) { setStatus({ ok: false, text: err(x) }); }
  }

  // The voucher the issue will post (invoice method), for the confirm sheet.
  const confirmLines = useMemo((): ConfirmLine[] => {
    if (!preview || kind === DocKind.quote || data?.settings.accountingMethod === "cash") return [];
    const sign = kind === DocKind.creditNote ? -1n : 1n;
    const fx = (v: bigint) => (preview.fxRate ? (v * preview.fxRate.rate + 500_000n) / 1_000_000n : v);
    const m = new Map<bigint, bigint>();
    for (const l of preview.lines) m.set(l.account, (m.get(l.account) ?? 0n) - fx(l.net));
    for (const r of preview.vat) {
      const a = data?.vatCodes.find((c) => c.code === r.vatCode)?.account;
      if (a !== undefined && r.vat) m.set(a, (m.get(a) ?? 0n) - fx(r.vat));
    }
    const total = [...m.values()].reduce((a, b) => a - b, 0n);
    // ROT/RUT: the deduction is owed by Skatteverket (1513), the rest by the customer.
    const ded = preview.hus?.deduction ?? 0n;
    return [{ account: 1510n, amount: sign * (total - ded) }, { account: 1513n, amount: sign * ded }, ...[...m].map(([account, amount]) => ({ account, amount: sign * amount }))].filter((l) => l.amount !== 0n);
  }, [preview, kind, data]);

  if (!loaded) return <><p role="status">{t.common.loading}</p><Toast status={status} /></>;
  const revenue = (data?.accounts ?? []).filter((a) => a.kind === "revenue" && a.active);
  const vatCodes = (data?.vatCodes ?? []).filter((v) => v.active && v.kind !== "inputDomestic" && v.kind !== "reverseChargePurchase" && v.kind !== "importVat");
  const bad = (f: string) => previewErr?.field === f || previewErr?.field?.startsWith(`${f}[`) || undefined;
  const cur = form.currency || "SEK";
  const customer = customers.find((c) => c.id === form.customerId);
  const husOn = !!data?.settings.modules.rotRut && kind !== DocKind.creditNote;
  const husAllowed = customer?.kind === "person" && cur === "SEK";
  const husBad = husProblem(hus) !== null;

  return (
    <>
      <PageHead title={draft ? `${s.kind[kind]} · ${e.draft(Number(draft.id))}` : e[kind]}>
        {creditOfNumber !== null && <p className="text-muted">{s.doc.creditOf(String(creditOfNumber))}</p>}
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-6">
          <div className="card grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="s-cust" className={label}>{s.customer}</label>
              <div className="flex gap-3">
                <select id="s-cust" className={inputCls} value={form.customerId === null ? "" : String(form.customerId)} disabled={kind === DocKind.creditNote}
                  aria-invalid={bad("customerId") || bad("buyer.vatNr")}
                  onChange={(x) => {
                    const c = customers.find((y) => String(y.id) === x.target.value);
                    update({ customerId: c?.id ?? null, ...(c ? { language: c.language, termsDays: String(c.termsDays) } : {}) });
                  }}>
                  <option value="">{e.chooseCustomer}</option>
                  {customers.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}
                </select>
                <Link to={href("/admin/accounting/sales/customers?new=1")} className="mt-1 shrink-0 self-center text-sm">{e.newCustomer}</Link>
              </div>
            </div>
            <div>
              <label htmlFor="s-lang" className={label}>{e.language}</label>
              <select id="s-lang" className={inputCls} value={form.language} onChange={(x) => update({ language: x.target.value as Lang })}>
                <option value={Lang.sv}>Svenska</option><option value={Lang.en}>English</option>
              </select>
            </div>
            {kind === DocKind.invoice && (
              <div>
                <label htmlFor="s-terms" className={label}>{e.terms}</label>
                <input id="s-terms" type="number" min={0} max={365} className={inputCls} value={form.termsDays} onChange={(x) => update({ termsDays: x.target.value })} />
              </div>
            )}
            {kind === DocKind.quote && (
              <div>
                <label htmlFor="s-valid" className={label}>{e.validUntil}</label>
                <input id="s-valid" type="date" className={inputCls} value={form.validUntil} onChange={(x) => update({ validUntil: x.target.value })} aria-invalid={bad("validUntil")} />
              </div>
            )}
            <div>
              <label htmlFor="s-del" className={label}>{e.delivery} <span className="text-sm font-normal text-muted">({t.common.optional})</span></label>
              <input id="s-del" type="date" className={inputCls} value={form.deliveryDate} aria-describedby="s-del-hint" onChange={(x) => update({ deliveryDate: x.target.value })} />
              <p id="s-del-hint" className="mt-1 text-xs text-muted">{e.deliveryHint}</p>
            </div>
            <div>
              <label htmlFor="s-cur" className={label}>{e.currency}</label>
              <input id="s-cur" className={`${inputCls} uppercase`} maxLength={3} value={form.currency} disabled={kind === DocKind.creditNote}
                onChange={(x) => update({ currency: x.target.value.toUpperCase() })} aria-invalid={bad("currency")} />
            </div>
            {form.currency !== "SEK" && <>
              <div>
                <label htmlFor="s-fx" className={label}>{e.fxRate}</label>
                <input id="s-fx" inputMode="decimal" className={inputCls} value={form.fx} placeholder="11,2345" aria-describedby="s-fx-hint" aria-invalid={bad("fxRate")}
                  onChange={(x) => update({ fx: x.target.value })} />
              </div>
              <div>
                <label htmlFor="s-fxd" className={label}>{e.fxDate}</label>
                <input id="s-fxd" type="date" className={inputCls} value={form.fxDate} onChange={(x) => update({ fxDate: x.target.value })} />
              </div>
              <p id="s-fx-hint" className="text-xs text-muted sm:col-span-2">{e.fxHint}</p>
            </>}
            <div>
              <label htmlFor="s-your" className={label}>{e.yourRef}</label>
              <input id="s-your" className={inputCls} maxLength={100} value={form.yourRef} onChange={(x) => update({ yourRef: x.target.value })} />
            </div>
            <div>
              <label htmlFor="s-our" className={label}>{e.ourRef}</label>
              <input id="s-our" className={inputCls} maxLength={100} value={form.ourRef} onChange={(x) => update({ ourRef: x.target.value })} />
            </div>
          </div>

          <fieldset className="card">
            <legend className="sr-only">{e.lines}</legend>
            <h2 className="text-2xl">{e.lines}</h2>
            <ol className="mt-3 space-y-4">
              {form.rows.map((r, i) => (
                <li key={r.key} className="grid grid-cols-2 gap-2 border-b border-border pb-4 sm:grid-cols-6">
                  <select aria-label={e.item(i + 1)} className="col-span-2 rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5" value={r.itemId === undefined ? "" : String(r.itemId)}
                    onChange={(x) => {
                      const it = items.find((y) => String(y.id) === x.target.value);
                      setRow(r.key, it ? { itemId: it.id, description: it.name, unit: it.unit, price: it.priceExVat, vatCode: it.vatCode, account: it.account } : { itemId: undefined });
                    }}>
                    <option value="">{e.noItem}</option>
                    {items.map((it) => <option key={String(it.id)} value={String(it.id)}>{it.sku ? `${it.sku} – ` : ""}{it.name}</option>)}
                  </select>
                  <input aria-label={e.description(i + 1)} className="col-span-2 rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5 sm:col-span-4" maxLength={500}
                    value={r.description} aria-invalid={bad(`lines[${i}].description`)} onChange={(x) => setRow(r.key, { description: x.target.value })} />
                  <input aria-label={e.qty(i + 1)} inputMode="decimal" className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5 text-right" value={r.qty}
                    aria-invalid={parseQty(r.qty) === null || bad(`lines[${i}].quantity`) || undefined} onChange={(x) => setRow(r.key, { qty: x.target.value })} />
                  <input aria-label={e.unit(i + 1)} className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5" maxLength={20} value={r.unit} onChange={(x) => setRow(r.key, { unit: x.target.value })} />
                  <MoneyInput value={r.price} labelText={e.price(i + 1)} onChange={(v) => setRow(r.key, { price: v })} />
                  <input aria-label={e.discount(i + 1)} inputMode="decimal" placeholder="%" className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5 text-right" value={r.discount}
                    aria-invalid={(r.discount.trim() !== "" && parsePct(r.discount) === null) || undefined} onChange={(x) => setRow(r.key, { discount: x.target.value })} />
                  <select aria-label={e.vat(i + 1)} className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5" value={r.vatCode} aria-invalid={bad(`lines[${i}].vatCode`)}
                    onChange={(x) => {
                      const acct = revenue.find((a) => a.vatCode === x.target.value)?.number;
                      setRow(r.key, { vatCode: x.target.value, ...(acct !== undefined ? { account: acct } : {}) });
                    }}>
                    {vatCodes.map((v) => <option key={v.code} value={v.code}>{v.code} – {v.name}</option>)}
                  </select>
                  <select aria-label={e.account(i + 1)} className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5" value={String(r.account)} aria-invalid={bad(`lines[${i}].account`)}
                    onChange={(x) => setRow(r.key, { account: BigInt(x.target.value) })}>
                    {revenue.map((a) => <option key={String(a.number)} value={String(a.number)}>{String(a.number)} {a.name}</option>)}
                  </select>
                  <button type="button" aria-label={e.removeLine(i + 1)} disabled={form.rows.length <= 1} onClick={() => update({ rows: form.rows.filter((x) => x.key !== r.key) })}
                    className="justify-self-end text-xl leading-none text-muted hover:text-[var(--error)] disabled:opacity-30">×</button>
                </li>
              ))}
            </ol>
            <button type="button" className="mt-3 text-sm font-semibold text-accent" onClick={() => update({ rows: [...form.rows, emptyRow()] })}>+ {e.addLine}</button>
          </fieldset>

          {husOn && <HusEditor form={hus} onChange={(f) => { dirty.current = true; setHus(f); }} rows={kept(form.rows)} allowed={husAllowed} bad={(f) => bad(f)} />}
          {kind === DocKind.creditNote && preview?.hus && <p className="card text-sm">{t.rotRut.editor.credit}</p>}

          <div className="card">
            <label htmlFor="s-notes" className={label}>{e.notes}</label>
            <textarea id="s-notes" rows={3} maxLength={2000} className={inputCls} value={form.notes} onChange={(x) => update({ notes: x.target.value })} />
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-labelledby="st-h">
          <div className="card space-y-3 text-sm">
            <h2 id="st-h" className="text-2xl">{e.totals}</h2>
            {previewErr && <p role="alert" className="rounded-lg border border-[var(--error)]/60 p-2 text-[var(--error)]">{previewErr.text}</p>}
            {preview ? (
              <>
                <dl className="grid grid-cols-[1fr_auto] gap-y-1">
                  <dt className="text-muted">{e.net}</dt><dd className="text-right"><Money ore={preview.totalNet} /> {cur}</dd>
                  {preview.vat.map((r) => <div key={r.vatCode} className="contents"><dt className="text-muted">{e.vatTotal} {formatPct(r.rateBp)} %</dt><dd className="text-right"><Money ore={r.vat} /></dd></div>)}
                  <dt className="font-semibold">{e.total}</dt><dd className="text-right font-semibold" aria-live="polite"><Money ore={preview.total} /> {cur}</dd>
                  {preview.totalVatSek !== undefined && <><dt className="text-muted">{e.vatTotal} SEK</dt><dd className="text-right"><Money ore={preview.totalVatSek} /></dd></>}
                  {preview.hus && <>
                    <dt className="text-muted">{t.rotRut.editor.deduction} ({t.rotRut.kind[preview.hus.kind]})</dt><dd className="text-right">−<Money ore={preview.hus.deduction} /></dd>
                    <dt className="font-semibold">{t.rotRut.editor.toPay}</dt><dd className="text-right font-semibold"><Money ore={preview.total - preview.hus.deduction} /> {cur}</dd>
                  </>}
                </dl>
                {preview.legalNotes.length > 0 && <div><p className="text-muted">{e.legal}</p><ul>{preview.legalNotes.map((n) => <li key={n} className="font-semibold">{n}</li>)}</ul></div>}
                {preview.ocr && <p><span className="text-muted">{e.ocr}</span> {preview.ocr}</p>}
              </>
            ) : !previewErr && <p className="text-muted">{e.previewHint}</p>}
            {canBook && (
              <div className="flex flex-col gap-2 pt-2">
                <button type="button" className="btn btn-primary justify-center" disabled={!preview || dirty.current || busy || (husOn && husBad)}
                  onClick={async () => { if (await saveAndPreview(false)) setConfirm(true); }}>{e.issue[kind]}</button>
                <button type="button" className="btn btn-secondary justify-center" disabled={form.customerId === null} onClick={() => void saveAndPreview(false)}>{e.preview}</button>
                {draft && <button type="button" className="text-sm text-muted hover:text-[var(--error)]" onClick={() => void removeDraft()}>{e.deleteDraft}</button>}
                {savedAt && <p className="text-xs text-muted" aria-live="polite">{e.saved(savedAt)}</p>}
              </div>
            )}
          </div>
        </aside>
      </div>
      <ConfirmPost open={confirm && !!preview} onClose={() => setConfirm(false)} onConfirm={() => void issue()} busy={busy}
        title={e.confirmTitle[kind]} creates={preview ? e.creates(s.kind[kind], String(preview.number)) : ""} date={preview?.issueDate ?? ""} lines={confirmLines}
        button={e.issue[kind]}
        extra={kind === DocKind.quote ? <p className="mt-3 text-sm text-muted">{e.quoteNoVoucher}</p> : data?.settings.accountingMethod === "cash" ? <p className="mt-3 text-sm text-muted">{e.cashNoVoucher}</p> : preview ? <p className="mt-3 text-sm">{docName(t, { kind, number: preview.number })} · {formatOre(preview.total)} {cur} · {accountName(1510n)}</p> : null} />
      <Toast status={status} />
    </>
  );
}
