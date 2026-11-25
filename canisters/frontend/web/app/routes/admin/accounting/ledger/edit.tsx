// Voucher editor: separate debit/credit columns, live difference, drafts that
// autosave to the canister, templates, attachments, then a confirm sheet to post.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Attachment, VoucherInput, VoucherLine } from "../../../../bindings/accounting";
import { errField, ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { ref } from "../../../../admin/accounting/ledger";
import { AccountPicker } from "../../../../admin/accounting/ui/AccountPicker";
import { ConfirmPost } from "../../../../admin/accounting/ui/ConfirmPost";
import { DropZone } from "../../../../admin/accounting/ui/DropZone";
import { Money, MoneyInput, PageHead, input, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

type Row = { key: number; account: bigint | null; debit: bigint | null; credit: bigint | null; vatCode: string; text: string };
let nextKey = 1;
const emptyRow = (): Row => ({ key: nextKey++, account: null, debit: null, credit: null, vatCode: "", text: "" });
const fromLine = (l: VoucherLine): Row => ({
  key: nextKey++, account: l.account, debit: l.amount > 0n ? l.amount : null, credit: l.amount < 0n ? -l.amount : null, vatCode: l.vatCode ?? "", text: l.text ?? "",
});

type Form = { series: string; date: string; description: string; counterparty: string; rows: Row[]; attachments: Attachment[] };

// [account, usual side, VAT code]
const TEMPLATES: Record<string, [number, "d" | "c", string?][]> = {
  sale: [[1930, "d"], [3001, "c"], [2611, "c", "U25"]],
  purchase: [[6110, "d"], [2641, "d", "I"], [1930, "c"]],
};

export default function VoucherEditor() {
  const t = useAccT();
  const e = t.editor;
  const err = useErr();
  const { acc, data, href, canBook } = useAcc();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const draftParam = params.get("draft");
  const [draftId, setDraftId] = useState<bigint | null>(draftParam ? BigInt(draftParam) : null);
  const [form, setForm] = useState<Form>({ series: "A", date: today(), description: "", counterparty: "", rows: [emptyRow(), emptyRow()], attachments: [] });
  const [loaded, setLoaded] = useState(!draftParam);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const dropRef = useRef<HTMLDivElement>(null);
  useCrumbs([{ label: t.ledger.title, to: "/admin/accounting/ledger" }, { label: draftId !== null ? e.draftTitle(Number(draftId)) : e.title }]);

  useEffect(() => {
    // After the first autosave the URL gets ?draft=<id>; the form already holds that draft.
    if (!draftParam || (loaded && String(draftId) === draftParam)) return;
    let live = true;
    void (async () => {
      try {
        const d = ok(await acc.listDrafts()).find((x) => String(x.id) === draftParam);
        if (!d) throw new Error(t.errors.notFound);
        const atts = await Promise.all(d.attachmentIds.map(async (id) => ok(await acc.getAttachment(id))));
        if (live) {
          setForm({ series: d.series, date: d.eventDate, description: d.description, counterparty: d.counterparty ?? "", rows: d.lines.map(fromLine), attachments: atts });
          setLoaded(true);
        }
      } catch (x) { if (live) setStatus({ ok: false, text: err(x) }); }
    })();
    return () => { live = false; };
  }, [acc, draftParam, err, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill a replacement for a corrected voucher (?from=<id>).
  useEffect(() => {
    const from = params.get("from");
    if (!from || draftParam) return;
    void acc.getVoucher(BigInt(from)).then((r) => {
      const v = ok(r);
      setForm((f) => ({ ...f, series: v.series, description: v.description, counterparty: v.counterparty ?? "", rows: v.lines.map(fromLine) }));
    }).catch((x) => setStatus({ ok: false, text: err(x) }));
  }, [acc, params, draftParam, err]);

  useEffect(() => { if (params.get("upload")) dropRef.current?.scrollIntoView(); }, [params, loaded]);

  const update = (f: Partial<Form>) => { dirty.current = true; setForm((x) => ({ ...x, ...f })); };
  const setRow = (key: number, r: Partial<Row>) => update({ rows: form.rows.map((x) => (x.key === key ? { ...x, ...r } : x)) });

  const lines: VoucherLine[] = useMemo(() => form.rows
    .filter((r) => r.account !== null || r.debit || r.credit)
    .map((r) => ({
      account: r.account ?? 0n, amount: (r.debit ?? 0n) - (r.credit ?? 0n),
      ...(r.vatCode ? { vatCode: r.vatCode } : {}), ...(r.text.trim() ? { text: r.text.trim() } : {}),
    })), [form.rows]);
  const debit = lines.reduce((a, l) => (l.amount > 0n ? a + l.amount : a), 0n);
  const credit = lines.reduce((a, l) => (l.amount < 0n ? a - l.amount : a), 0n);
  const diff = debit - credit;

  const toInput = useCallback((): VoucherInput => ({
    series: form.series, eventDate: form.date, description: form.description.trim(), lines,
    attachmentIds: form.attachments.map((a) => a.id), ...(form.counterparty.trim() ? { counterparty: form.counterparty.trim() } : {}),
  }), [form, lines]);

  const problems: string[] = [];
  if (!form.description.trim()) problems.push(t.errors.fields.description);
  if (lines.length < 2) problems.push(t.errors.fields.lines);
  if (lines.some((l) => l.account === 0n)) problems.push(t.errors.fields["lines[].account"]);
  if (lines.some((l) => l.amount === 0n)) problems.push(t.errors.fields["lines[].amount"]);
  if (diff !== 0n) problems.push(e.unbalanced);

  const saveDraft = useCallback(async (quiet: boolean) => {
    try {
      const d = ok(await acc.saveDraft(draftId, toInput()));
      setDraftId(d.id);
      dirty.current = false;
      const at = new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
      setSavedAt(at);
      if (!quiet) setStatus({ ok: true, text: e.draftSaved(at) });
      if (!draftParam) navigate(href(`/admin/accounting/ledger/new?draft=${d.id}`), { replace: true });
    } catch (x) { if (!quiet) setStatus({ ok: false, text: err(x) }); }
  }, [acc, draftId, toInput, e, err, draftParam, navigate, href]);

  // Autosave a few seconds after the last change, once there is something to keep.
  useEffect(() => {
    if (!loaded || !canBook || !dirty.current || !form.description.trim()) return;
    const id = setTimeout(() => void saveDraft(true), 4000);
    return () => clearTimeout(id);
  }, [form, loaded, canBook, saveDraft]);

  async function post() {
    setBusy(true);
    setBadField(null);
    try {
      let v;
      if (draftId !== null) { ok(await acc.saveDraft(draftId, toInput())); v = ok(await acc.postDraft(draftId)); }
      else v = ok(await acc.postVoucher(toInput()));
      dirty.current = false;
      setConfirm(false);
      navigate(href(`/admin/accounting/ledger/${v.id}`), { state: { posted: e.posted(ref(v)) } });
    } catch (x) {
      setConfirm(false);
      setBadField(errField(x));
      setStatus({ ok: false, text: err(x) });
    } finally { setBusy(false); }
  }

  async function removeDraft() {
    if (draftId === null) return;
    try {
      ok(await acc.deleteDraft(draftId));
      navigate(href("/admin/accounting/ledger/drafts"), { state: { posted: e.draftDeleted } });
    } catch (x) { setStatus({ ok: false, text: err(x) }); }
  }

  function applyTemplate(name: string) {
    const tpl = TEMPLATES[name];
    if (!tpl) return;
    // Accounts and VAT codes only; the amounts are entered per voucher.
    update({ rows: tpl.map(([account, , vat]) => ({ ...emptyRow(), account: BigInt(account), vatCode: vat ?? "" })) });
  }

  if (!loaded) return <><p role="status">{t.common.loading}</p><Toast status={status} /></>;
  const fieldErr = (f: string) => badField === f || badField?.startsWith(`${f}[`);
  const vatCodes = (data?.vatCodes ?? []).filter((v) => v.active);

  return (
    <>
      <PageHead title={draftId !== null ? e.draftTitle(Number(draftId)) : e.title} />
      {problems.length > 0 && (lines.length > 0 || form.description) && (
        <div role="status" className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <p className="font-semibold">{e.summaryTitle(problems.length)}</p>
          <ul className="mt-1 list-inside list-disc">{problems.map((p) => <li key={p}>{e.fieldError(p)}</li>)}</ul>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          <div className="card grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="v-series" className={label}>{e.series}</label>
              <select id="v-series" className={input} value={form.series} onChange={(x) => update({ series: x.target.value })} aria-invalid={fieldErr("series") || undefined}>
                {data?.series.filter((s) => s.code !== "C").map((s) => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="v-date" className={label}>{e.date}</label>
              <input id="v-date" type="date" className={input} value={form.date} onChange={(x) => update({ date: x.target.value })} aria-invalid={fieldErr("eventDate") || undefined} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="v-text" className={label}>{e.description}</label>
              <input id="v-text" className={input} maxLength={500} value={form.description} onChange={(x) => update({ description: x.target.value })} aria-invalid={fieldErr("description") || undefined} />
            </div>
            <div>
              <label htmlFor="v-cp" className={label}>{e.counterparty} <span className="text-sm font-normal text-muted">({t.common.optional})</span></label>
              <input id="v-cp" className={input} maxLength={200} value={form.counterparty} onChange={(x) => update({ counterparty: x.target.value })} />
            </div>
            <div>
              <label htmlFor="v-tpl" className={label}>{e.templates}</label>
              <select id="v-tpl" className={input} value="" onChange={(x) => applyTemplate(x.target.value)}>
                <option value="">{e.template.none}</option>
                <option value="sale">{e.template.sale}</option>
                <option value="purchase">{e.template.purchase}</option>
              </select>
            </div>
          </div>

          <fieldset className="card">
            <legend className="sr-only">{e.lines}</legend>
            <h2 className="text-2xl">{e.lines}</h2>
            <div className="mt-3 hidden grid-cols-[minmax(10rem,2fr)_7rem_7rem_6rem_minmax(6rem,1fr)_2rem] gap-2 text-sm font-semibold text-muted md:grid" aria-hidden="true">
              <span>{t.common.account}</span><span className="text-right">{t.common.debit}</span><span className="text-right">{t.common.credit}</span><span>VAT</span><span>{t.common.text}</span><span />
            </div>
            <ol className="mt-1 space-y-2">
              {form.rows.map((r, i) => (
                <li key={r.key} className="grid grid-cols-2 gap-2 border-b border-border pb-2 md:grid-cols-[minmax(10rem,2fr)_7rem_7rem_6rem_minmax(6rem,1fr)_2rem] md:border-0 md:pb-0">
                  <div className="col-span-2 md:col-span-1">
                    <AccountPicker value={r.account} labelText={e.lineAccount(i + 1)} invalid={badField === `lines[${i}].account`}
                      onChange={(a) => setRow(r.key, { account: a?.number ?? null, vatCode: r.vatCode || (a?.vatCode ?? "") })} />
                  </div>
                  <MoneyInput value={r.debit} labelText={e.lineDebit(i + 1)} onChange={(v) => setRow(r.key, { debit: v, credit: v ? null : r.credit })} />
                  <MoneyInput value={r.credit} labelText={e.lineCredit(i + 1)} onChange={(v) => setRow(r.key, { credit: v, debit: v ? null : r.debit })} />
                  <select aria-label={e.lineVat(i + 1)} value={r.vatCode} onChange={(x) => setRow(r.key, { vatCode: x.target.value })}
                    className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5">
                    <option value="">{e.vatNone}</option>
                    {vatCodes.map((v) => <option key={v.code} value={v.code}>{v.code}</option>)}
                  </select>
                  <input aria-label={e.lineText(i + 1)} value={r.text} maxLength={200} className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5"
                    onChange={(x) => setRow(r.key, { text: x.target.value })}
                    onKeyDown={(x) => { if (x.key === "Tab" && !x.shiftKey && i === form.rows.length - 1) update({ rows: [...form.rows, emptyRow()] }); }} />
                  <button type="button" aria-label={e.removeLine(i + 1)} disabled={form.rows.length <= 2}
                    onClick={() => update({ rows: form.rows.filter((x) => x.key !== r.key) })}
                    className="rounded-md text-xl leading-none text-muted hover:text-[var(--error)] disabled:opacity-30">×</button>
                </li>
              ))}
            </ol>
            <button type="button" className="mt-3 text-sm font-semibold text-accent" onClick={() => update({ rows: [...form.rows, emptyRow()] })}>+ {e.addLine}</button>
          </fieldset>

          <div ref={dropRef} className="card">
            <h2 className="text-2xl">{e.attachments}</h2>
            {form.attachments.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {form.attachments.map((a) => (
                  <li key={String(a.id)} className="flex items-center justify-between gap-3">
                    <span>{a.filename}</span>
                    <button type="button" className="text-muted hover:text-[var(--error)]" onClick={() => update({ attachments: form.attachments.filter((x) => x.id !== a.id) })}>{t.common.remove}</button>
                  </li>
                ))}
              </ul>
            )}
            {canBook && <div className="mt-3"><DropZone onUploaded={(a) => setForm((f) => { dirty.current = true; return { ...f, attachments: [...f.attachments, a] }; })} /></div>}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-labelledby="totals-h">
          <div className="card space-y-2">
            <h2 id="totals-h" className="text-2xl">{e.totals}</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt className="text-muted">{t.common.debit}</dt><dd className="text-right"><Money ore={debit} /></dd>
              <dt className="text-muted">{t.common.credit}</dt><dd className="text-right"><Money ore={credit} /></dd>
              <dt className="font-semibold">{t.common.difference}</dt>
              <dd className={`text-right font-semibold ${diff === 0n ? "text-accent" : "text-[var(--error)]"}`} aria-live="polite"><Money ore={diff} /></dd>
            </dl>
            <p className="text-sm text-muted" aria-live="polite">{diff === 0n && lines.length >= 2 ? e.balanced : ""}</p>
            {canBook && (
              <div className="flex flex-col gap-2 pt-2">
                <button type="button" className="btn btn-primary justify-center" disabled={problems.length > 0} onClick={() => setConfirm(true)}>{e.post}</button>
                <button type="button" className="btn btn-secondary justify-center" onClick={() => void saveDraft(false)} disabled={!form.description.trim()}>{e.saveDraft}</button>
                {draftId !== null && <button type="button" className="text-sm text-muted hover:text-[var(--error)]" onClick={() => void removeDraft()}>{e.deleteDraft}</button>}
                {savedAt && <p className="text-xs text-muted" aria-live="polite">{e.draftSaved(savedAt)}</p>}
              </div>
            )}
          </div>
        </aside>
      </div>
      <ConfirmPost open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void post()} busy={busy}
        title={e.confirmTitle} creates={e.confirmCreates(form.series)} date={form.date} lines={lines} button={e.confirmButton} />
      <Toast status={status} />
    </>
  );
}
