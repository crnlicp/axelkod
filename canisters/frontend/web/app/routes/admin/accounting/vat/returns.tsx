// Moms › Momsdeklaration: periods per the settings, and per period the guided flow
// Kontrollera → Lås och bokför avräkning → Ladda ner fil → Markera inlämnad → Betalning.
// Box values come from the canister; the file is built from the stored values (V3).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { TaxKind, type Box, type Preview, type TaxEntry, type VatReturn } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { hex } from "../../../../admin/accounting/canonical";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { meta } from "../../../../admin/accounting/ledger";
import { saveFile } from "../../../../admin/accounting/pdf/client";
import { BOX_SV, SECTIONS, SECTION_SV, boxValue, latin1, vatPeriods, vatXml, type Period } from "../../../../admin/accounting/vat";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { SectionTabs, vatTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { Stepper, type Step } from "../../../../admin/accounting/ui/Stepper";
import { DocRef, EmptyState, Money, PageHead, StatusChip, fmtTime, input, label } from "../../../../admin/accounting/ui/kit";
import { useAdminLang } from "../../../../admin/i18n";
import { Toast } from "../../../../admin/toast";

type State = "open" | "locked" | "filed" | "paid" | "late";
const tone = (s: State) => (s === "paid" ? "good" : s === "late" ? "bad" : s === "open" ? "neutral" : "warn") as "good" | "bad" | "warn" | "neutral";

function stateOf(p: Period, r: VatReturn | undefined, now: string): State {
  if (r?.taxEntryId !== undefined) return "paid";
  if (r?.filedAt !== undefined) return "filed";
  if (p.due < now) return "late";
  return r ? "locked" : "open";
}

export default function VatReturns() {
  const t = useAccT();
  const v = t.vat;
  const err = useErr();
  const ctx = useAcc();
  const { acc, data, canBook } = ctx;
  const [params, setParams] = useSearchParams();
  const [returns, setReturns] = useState<VatReturn[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const now = today();
  const periods = useMemo(() => (data ? vatPeriods(data.settings.vatPeriod, data.years, now, true) : []), [data, now]);
  const selected = periods.find((p) => p.from === params.get("p")) ?? periods.find((p) => p.to < now) ?? periods[0];
  useCrumbs([{ label: v.title, to: "/admin/accounting/vat" }, { label: v.tabs.returns }]);

  const loadReturns = useCallback(() => acc.listVatReturns().then((r) => setReturns(ok(r))), [acc]);
  const loadPreview = useCallback(async () => {
    if (!selected) return;
    setPreview(null);
    setPreview(ok(await acc.vatPreview(selected.from, selected.to)));
  }, [acc, selected?.from, selected?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadReturns().catch((e) => setStatus({ ok: false, text: err(e) })); }, [loadReturns, err]);
  useEffect(() => { setStep(null); void loadPreview().catch((e) => setStatus({ ok: false, text: err(e) })); }, [loadPreview, err]);

  async function refresh(text: string) {
    setStatus({ ok: true, text });
    await Promise.all([loadReturns(), loadPreview(), ctx.reload()]);
  }

  const r = preview?.filed;
  const ended = selected ? selected.to < now : false;
  const steps: Step[] = [
    { key: "check", title: v.steps.check, state: r ? "done" : "current" },
    { key: "lock", title: v.steps.lock, state: r ? "done" : ended ? "todo" : "later", note: !r && !ended ? v.afterEnd : undefined },
    { key: "file", title: v.steps.file, state: r ? "done" : "todo" },
    { key: "filed", title: v.steps.filed, state: r?.filedAt !== undefined ? "done" : r ? "current" : "todo" },
    { key: "pay", title: v.steps.pay, state: r?.taxEntryId !== undefined ? "done" : r?.filedAt !== undefined ? "current" : "todo" },
  ];
  const active = step ?? steps.find((s) => s.state === "current")?.key ?? "check";

  return (
    <>
      <PageHead title={v.title}><SectionTabs {...vatTabs(v)} /></PageHead>
      <p className="mb-4 text-sm text-muted">{v.intro}</p>
      {!periods.length ? <EmptyState text={v.noPeriods} /> : !returns ? <p role="status">{t.common.loading}</p> : (
        <div className="grid items-start gap-6 lg:grid-cols-[17rem_1fr]">
          <nav aria-label={v.periods} className="card max-h-[32rem] overflow-y-auto p-2">
            <ul className="space-y-1">
              {periods.map((p) => {
                const s = stateOf(p, returns.find((x) => x.from === p.from), now);
                return (
                  <li key={p.from}>
                    <button type="button" aria-current={p.from === selected?.from ? "true" : undefined} onClick={() => setParams({ p: p.from })}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-strong aria-[current=true]:bg-[var(--brand-soft)]">
                      <span><span className="block font-medium">{p.label}</span><span className="block text-xs text-muted">{v.due} {p.due}</span></span>
                      <StatusChip tone={tone(s)}>{v.state[s]}</StatusChip>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <section aria-labelledby="vat-period" className="space-y-6">
            <div className="card">
              <h2 id="vat-period" className="mb-4 text-xl font-semibold">{selected?.label} <span className="text-base font-normal text-muted">({selected?.from} – {selected?.to})</span></h2>
              <Stepper steps={steps} onSelect={setStep} />
            </div>
            {!preview || !selected ? <p role="status">{t.common.loading}</p> : (
              <div className="card space-y-4">
                <h3 className="text-lg font-semibold">{steps.find((s) => s.key === active)?.title}</h3>
                {active === "check" && <Check preview={preview} />}
                {active === "lock" && (r ? <Facts r={r} /> : <Lock period={selected} ended={ended} canBook={canBook} onDone={() => refresh(v.lockedDone)} onError={(e) => setStatus({ ok: false, text: err(e) })} />)}
                {active === "file" && (r ? <FileStep r={r} period={selected} /> : <p className="text-muted">{v.steps.lock}</p>)}
                {active === "filed" && (r ? <Filed r={r} canBook={canBook} onDone={() => refresh(v.filedDone)} onError={(e) => setStatus({ ok: false, text: err(e) })} /> : <p className="text-muted">{v.steps.lock}</p>)}
                {active === "pay" && (r ? <Pay r={r} canBook={canBook} onDone={() => refresh(v.paidDone)} onError={(e) => setStatus({ ok: false, text: err(e) })} /> : <p className="text-muted">{v.steps.lock}</p>)}
              </div>
            )}
          </section>
        </div>
      )}
      <Toast status={status} />
    </>
  );
}

function BoxTable({ boxes, exact }: { boxes: Box[]; exact?: Box[] }) {
  const v = useAccT().vat;
  const pay = boxValue(boxes, 49);
  return (
    <div className="space-y-4">
      {SECTIONS.map(([sec, nums]) => (
        <table key={sec} className="w-full text-sm">
          <caption className="mb-1 text-left font-semibold">{sec}. {SECTION_SV[sec]}</caption>
          <thead className="sr-only"><tr><th scope="col">{v.box}</th><th scope="col">{v.title}</th><th scope="col">{v.kronor}</th>{exact && <th scope="col">{v.withOre}</th>}</tr></thead>
          <tbody>
            {nums.map((b) => (
              <tr key={b} className="border-t border-border">
                <td className="w-10 py-1 tabular-nums text-muted">{String(b).padStart(2, "0")}</td>
                <td className="py-1">{b === 49 ? `${BOX_SV[b]} (${pay < 0n ? v.refund : v.payable})` : BOX_SV[b]}</td>
                <td className={`py-1 text-right tabular-nums ${b === 49 ? "font-semibold" : ""}`}>{boxValue(boxes, b).toLocaleString("sv-SE")}</td>
                {exact && <td className="w-28 py-1 text-right text-xs text-muted"><Money ore={boxValue(exact, b)} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function Check({ preview }: { preview: Preview }) {
  const v = useAccT().vat;
  return (
    <>
      {!preview.filed && (
        <section aria-labelledby="vat-checks">
          <h4 id="vat-checks" className="font-medium">{v.warningsTitle}</h4>
          {preview.warnings.length === 0 ? <p className="text-sm text-muted">{v.noWarnings}</p> : (
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {preview.warnings.map((w) => <li key={w.code}>{v.warnings[w.code]?.(Number(w.count)) ?? w.code}</li>)}
            </ul>
          )}
        </section>
      )}
      <BoxTable boxes={preview.boxes} exact={preview.exact} />
    </>
  );
}

function Lock({ period, ended, canBook, onDone, onError }: { period: Period; ended: boolean; canBook: boolean; onDone: () => void; onError: (e: unknown) => void }) {
  const t = useAccT();
  const v = t.vat;
  const { acc } = useAcc();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ended) return <p>{v.notEnded}</p>;
  async function lock() {
    setBusy(true);
    try { ok(await acc.lockVatReturn(period.from, period.to, note.trim() || null)); setOpen(false); onDone(); }
    catch (e) { setOpen(false); onError(e); } finally { setBusy(false); }
  }
  return (
    <>
      <div><label htmlFor="vat-note" className={label}>{v.note}</label>
        <textarea id="vat-note" className={input} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      {canBook && <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>{v.lockButton}</button>}
      <Dialog open={open} onClose={() => setOpen(false)} title={v.lockTitle}
        footer={<><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>{t.common.cancel}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void lock()}>{v.lockButton}</button></>}>
        <p>{v.lockBody(period.to)}</p>
      </Dialog>
    </>
  );
}

function Facts({ r }: { r: VatReturn }) {
  const v = useAccT().vat;
  const { t: at } = useAdminLang();
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
      <dt className="text-muted">{v.lockedAt}</dt><dd>{fmtTime(r.lockedAt, at.locale)}</dd>
      <dt className="text-muted">{v.lockedBy}</dt><dd className="break-all">{r.lockedBy.toText()}</dd>
      <dt className="text-muted">{v.settlement}</dt>
      <dd>{r.settlementVoucherId !== undefined ? <DocRef id={r.settlementVoucherId} label={`#${r.settlementVoucherId}`} /> : v.noSettlement}</dd>
      <dt className="text-muted">{v.hash}</dt><dd><code>{hex(Uint8Array.from(r.voucherHash)).slice(0, 16)}</code> ({v.sources(Number(r.voucherCount))})</dd>
      {r.note && <><dt className="text-muted">{v.note}</dt><dd>{r.note}</dd></>}
      {r.filedAt !== undefined && <><dt className="text-muted">{v.filedAt}</dt><dd>{fmtTime(r.filedAt, at.locale)}{r.receiptRef ? ` · ${r.receiptRef}` : ""}</dd></>}
    </dl>
  );
}

function FileStep({ r, period }: { r: VatReturn; period: Period }) {
  const v = useAccT().vat;
  const ctx = useAcc();
  const company = ctx.data?.company;
  const name = `momsdeklaration-${period.to.slice(0, 7)}`;
  return (
    <>
      <p className="text-sm">{v.fileIntro}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={!company}
          onClick={() => saveFile(new Blob([latin1(vatXml(company!.orgNr, period.to, r.boxes, r.note))], { type: "application/xml" }), `${name}.xml`)}>{v.xml}</button>
        <PdfActions label={v.pdf} fileName={`${name}.pdf`} job={async () => ({
          template: "vat-return@1" as const,
          meta: meta(ctx, "Momsdeklaration", period.to.slice(0, 7), [`Period ${period.from} – ${period.to}`]),
          boxes: r.boxes,
          facts: [["Period", `${period.from} – ${period.to}`], ["Låst", fmtTime(r.lockedAt, "sv-SE")], ["Underlag", `${r.voucherCount} verifikationer, ${hex(Uint8Array.from(r.voucherHash)).slice(0, 16)}`],
            ...(r.settlementVoucherId !== undefined ? [["Avräkning", `#${r.settlementVoucherId}`] as [string, string]] : []), ...(r.note ? [["Upplysning", r.note] as [string, string]] : [])],
        })} />
      </div>
      <Facts r={r} />
      <BoxTable boxes={r.boxes} />
    </>
  );
}

function Filed({ r, canBook, onDone, onError }: { r: VatReturn; canBook: boolean; onDone: () => void; onError: (e: unknown) => void }) {
  const v = useAccT().vat;
  const { acc } = useAcc();
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  if (r.filedAt !== undefined) return <Facts r={r} />;
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try { ok(await acc.markVatReturnFiled(r.id, ref.trim() || null)); onDone(); } catch (x) { onError(x); } finally { setBusy(false); }
    }}>
      <div><label htmlFor="vat-receipt" className={label}>{v.receipt}</label><input id="vat-receipt" className={input} maxLength={100} value={ref} onChange={(e) => setRef(e.target.value)} /></div>
      {canBook && <button type="submit" className="btn btn-primary" disabled={busy}>{v.markFiled}</button>}
    </form>
  );
}

function Pay({ r, canBook, onDone, onError }: { r: VatReturn; canBook: boolean; onDone: () => void; onError: (e: unknown) => void }) {
  const t = useAccT();
  const v = t.vat;
  const { acc } = useAcc();
  const [entries, setEntries] = useState<TaxEntry[] | null>(null);
  const amount = -boxValue(r.boxes, 49) * 100n;
  useEffect(() => { acc.listTaxEntries(0n, 500n).then((x) => setEntries(ok(x).items)).catch(onError); }, [acc]); // eslint-disable-line react-hooks/exhaustive-deps
  if (r.taxEntryId !== undefined) return <p>{v.paidWith} #{String(r.taxEntryId)}</p>;
  if (!entries) return <p role="status">{t.common.loading}</p>;
  const fits = entries.filter((e) => e.kind === TaxKind.vat && e.voucherId !== undefined && e.amount === amount);
  return (
    <>
      <p className="text-sm">{v.payIntro} (<Money ore={amount} unit />)</p>
      {fits.length === 0 ? <p className="text-sm text-muted">{v.payNone}</p> : (
        <ul className="space-y-2">
          {fits.map((e) => (
            <li key={String(e.id)} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <span>{e.date} · {e.text} · <Money ore={e.amount} /></span>
              {canBook && <button type="button" className="btn btn-secondary px-3 py-1 text-sm" onClick={async () => {
                try { ok(await acc.linkVatPayment(r.id, e.id)); onDone(); } catch (x) { onError(x); }
              }}>{v.payLink}</button>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
