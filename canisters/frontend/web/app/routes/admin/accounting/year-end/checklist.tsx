// Bokslut: the year-end checklist (spec §3.6) as a stepper. Each step shows what is left
// and links to it; the tax step books the closing voucher; locking is the last, owner-only step.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { StepState, Variant_bank_taxAccount, type Status, type TaxCalc, type TaxInput, type VoucherLine } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { agmDue, annualReportDue, ink2Due } from "../../../../admin/accounting/deadlines";
import { formatOre } from "../../../../admin/accounting/money";
import { ConfirmPost } from "../../../../admin/accounting/ui/ConfirmPost";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { SectionTabs, yearEndTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { Stepper, type Step } from "../../../../admin/accounting/ui/Stepper";
import { EmptyState, Money, MoneyInput, PageHead } from "../../../../admin/accounting/ui/kit";

type Msg = { ok: boolean; text: string } | null;

/** The closing voucher as the canister books it (lib/YearEnd.mo closingLines). */
function closingLines(c: TaxCalc): { account: bigint; amount: bigint; text?: string }[] {
  const ls: { account: bigint; amount: bigint; text?: string }[] = [];
  for (const r of c.reversals) ls.push({ account: r.account, amount: r.amount }, { account: 8819n, amount: -r.amount });
  if (c.fundAccount !== undefined) ls.push({ account: 8811n, amount: c.fund }, { account: c.fundAccount, amount: -c.fund });
  if (c.tax !== 0n) ls.push({ account: 8910n, amount: c.tax }, { account: 2512n, amount: -c.tax });
  if (c.resultAfterTax !== 0n) ls.push({ account: 8999n, amount: c.resultAfterTax }, { account: 2099n, amount: -c.resultAfterTax });
  return ls;
}

export default function YearEndChecklist() {
  const t = useAccT();
  const y = t.yearEnd;
  const err = useErr();
  const ctx = useAcc();
  const { acc, year, canBook, isOwner, href } = ctx;
  const [st, setSt] = useState<Status | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useCrumbs([{ label: y.title, to: "/admin/accounting/year-end" }, { label: y.tabs.checklist }]);

  const yearId = year?.id;
  const load = useCallback(async () => { if (yearId !== undefined) setSt(ok(await acc.yearEndStatus(yearId))); }, [acc, yearId]);
  // Keyed on the year id: ctx.reload() after a save gives a new year object, which must not reset the open step.
  useEffect(() => { setSt(null); setStep(null); void load().catch((e) => setMsg({ ok: false, text: err(e) })); }, [load, err]);
  const done = async (text: string) => { setMsg({ ok: true, text }); await Promise.all([load(), ctx.reload()]); };
  const fail = (e: unknown) => setMsg({ ok: false, text: err(e) });

  if (!year) return <><PageHead title={y.title}><SectionTabs {...yearEndTabs(y)} /></PageHead><EmptyState text={t.common.loading} /></>;
  const firstTodo = st?.steps.find((s) => s.state === StepState.todo)?.id;
  const steps: Step[] = (st?.steps ?? []).map((s) => ({
    key: s.id, title: y.steps[s.id] ?? s.id,
    state: s.state === StepState.todo ? (s.id === firstTodo ? "current" : "todo") : "done",
    note: s.state === StepState.notApplicable ? y.na : s.state === StepState.todo && s.count !== undefined && s.count > 0n ? y.open(String(s.count)) : undefined,
  }));
  const active = step ?? firstTodo ?? "tax";
  const cur = st?.steps.find((s) => s.id === active);
  const locked = st?.fiscalYear.status === "locked";
  const ended = year.end < today();

  return (
    <>
      <PageHead title={y.title}><SectionTabs {...yearEndTabs(y)} /></PageHead>
      <p className="mb-4 text-sm text-muted">{y.intro}</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mb-4 ${msg.ok ? "text-accent" : "text-[var(--error)]"}`}>{msg.text}</p>}
      {!st ? <p role="status">{t.common.loading}</p> : (
        <div className="grid items-start gap-6 lg:grid-cols-[20rem_1fr]">
          <div className="space-y-6">
            <nav aria-label={y.title} className="card p-2"><Stepper steps={steps} onSelect={setStep} /></nav>
            <section aria-labelledby="ye-dates" className="card text-sm">
              <h2 id="ye-dates" className="mb-2 font-semibold">{y.deadlines.title}</h2>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                <dt className="text-muted">{y.deadlines.ink2}</dt><dd>{ink2Due(year.end)}</dd>
                <dt className="text-muted">{y.deadlines.agm}</dt><dd>{agmDue(year.end)}</dd>
                <dt className="text-muted">{y.deadlines.annualReport}</dt><dd>{annualReportDue(year.end)}</dd>
              </dl>
            </section>
          </div>
          <section aria-labelledby="ye-step" className="card space-y-4">
            <h2 id="ye-step" className="text-lg font-semibold">{y.steps[active]}</h2>
            {cur?.state === StepState.notApplicable && <p className="text-muted">{y.na}</p>}
            {active === "inventory" && cur?.state !== StepState.notApplicable && <><p>{y.inventory.text}</p><Link className="btn btn-secondary" to={href("/admin/accounting/assets/counts")}>{y.inventory.go}</Link></>}
            {active === "depreciation" && <>
              <p>{cur?.state === StepState.done ? y.depreciation.done : y.depreciation.text(String(cur?.count ?? 0n))}</p>
              <Link className="btn btn-secondary" to={href("/admin/accounting/assets")}>{y.depreciation.go}</Link>
            </>}
            {active === "accruals" && <Confirm id="accruals" text={y.accruals.text} label={y.accruals.confirm} checked={st.closing.confirmed.includes("accruals")} disabled={!canBook || locked}
              link={<Link className="btn btn-secondary" to={href("/admin/accounting/ledger/new")}>{y.accruals.go}</Link>}
              onChange={(v) => acc.confirmYearEndStep(year.id, "accruals", v).then(ok).then(() => done(y.saved)).catch(fail)} />}
            {active === "cash" && cur?.state !== StepState.notApplicable && <Cash yearId={year.id} end={year.end} booked={st.closing.cashVoucherId !== undefined} canBook={canBook && !locked} onDone={() => done(y.cash.done)} onError={fail} />}
            {(active === "bank" || active === "taxAccount") && <Statement which={active} ledger={cur?.amount ?? 0n} saved={active === "bank" ? st.closing.bankStatement : st.closing.taxStatement}
              canBook={canBook && !locked} onSave={(v) => acc.setStatementBalance(year.id, active === "bank" ? Variant_bank_taxAccount.bank : Variant_bank_taxAccount.taxAccount, v).then(ok).then(() => done(y.saved)).catch(fail)} />}
            {active === "vat" && <>
              <p>{cur?.state === StepState.done ? y.vat.done : y.vat.text(String(cur?.count ?? 0n))}</p>
              <Link className="btn btn-secondary" to={href("/admin/accounting/vat")}>{y.vat.go}</Link>
            </>}
            {active === "payroll" && cur?.state !== StepState.notApplicable && <Confirm id="payroll"
              text={`${cur?.count ? `${y.payroll.text(String(cur.count))} ` : ""}${y.payroll.check}`} label={y.payroll.confirm} checked={st.closing.confirmed.includes("payroll")} disabled={!canBook || locked}
              link={<Link className="btn btn-secondary" to={href("/admin/accounting/payroll/agi")}>{y.payroll.go}</Link>}
              onChange={(v) => acc.confirmYearEndStep(year.id, "payroll", v).then(ok).then(() => done(y.saved)).catch(fail)} />}
            {active === "tax" && <Tax st={st} canBook={canBook && !locked} onDone={() => done(y.tax.done)} onError={fail} />}
            {active === "lock" && <Lock canLock={st.canLock} ended={ended} locked={locked} isOwner={isOwner}
              onLock={() => acc.lockFiscalYear(year.id).then(ok).then(() => done(y.lock.done)).catch(fail)} />}
            {active === "transfer" && <>
              <p>{y.transfer.text}</p>
              {isOwner && <button type="button" className="btn btn-primary" disabled={!locked || st.closing.transferredTo !== undefined}
                onClick={() => acc.transferBalances(year.id).then(ok).then(() => done(y.transfer.done)).catch(fail)}>{y.transfer.button}</button>}
            </>}
          </section>
        </div>
      )}
    </>
  );
}

function Confirm({ id, text, label, checked, disabled, link, onChange }: { id: string; text: string; label: string; checked: boolean; disabled: boolean; link: React.ReactNode; onChange: (v: boolean) => void }) {
  return (
    <>
      <p>{text}</p>
      <div className="flex flex-wrap items-center gap-4">
        {link}
        <label htmlFor={`ye-${id}`} className="flex items-center gap-2">
          <input id={`ye-${id}`} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
          {label}
        </label>
      </div>
    </>
  );
}

function Statement({ which, ledger, saved, canBook, onSave }: { which: "bank" | "taxAccount"; ledger: bigint; saved?: bigint; canBook: boolean; onSave: (v: bigint | null) => void }) {
  const t = useAccT();
  const s = t.yearEnd.statement;
  const { href } = useAcc();
  const [value, setValue] = useState<bigint | null>(saved ?? null);
  return (
    <>
      <p>{s.ledger(formatOre(ledger, true))}</p>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); onSave(value); }}>
        <label className="block max-w-xs flex-1" htmlFor="ye-statement">
          <span className="font-medium">{which === "bank" ? s.bank : s.taxAccount}</span>
          <MoneyInput id="ye-statement" labelText={which === "bank" ? s.bank : s.taxAccount} value={value} onChange={setValue} allowNegative className="mt-1" />
        </label>
        {canBook && <button type="submit" className="btn btn-primary">{s.save}</button>}
        <Link className="btn btn-secondary" to={href(which === "bank" ? "/admin/accounting/bank" : "/admin/accounting/bank/tax")}>{which === "bank" ? s.goBank : s.goTax}</Link>
      </form>
      {saved !== undefined && <p role="note" className={saved === ledger ? "text-accent" : "text-[var(--error)]"}>{saved === ledger ? s.match : s.diff(formatOre(saved - ledger, true))}</p>}
    </>
  );
}

function Cash({ yearId, end, booked, canBook, onDone, onError }: { yearId: bigint; end: string; booked: boolean; canBook: boolean; onDone: () => void; onError: (e: unknown) => void }) {
  const t = useAccT();
  const c = t.yearEnd.cash;
  const { acc } = useAcc();
  const [lines, setLines] = useState<VoucherLine[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { acc.previewCashYearEnd(yearId).then((r) => setLines(ok(r))).catch(onError); }, [acc, yearId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (booked) return <p>{c.done}</p>;
  return (
    <>
      <p>{c.text}</p>
      {!lines ? <p role="status">{t.common.loading}</p> : lines.length === 0 ? <p>{c.none}</p> : <>
        {canBook && <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>{c.book}</button>}
        <ConfirmPost open={open} onClose={() => setOpen(false)} title={c.book} creates={c.creates} date={end} lines={lines} button={c.book} busy={busy}
          onConfirm={async () => { setBusy(true); try { ok(await acc.bookCashYearEnd(yearId)); setOpen(false); onDone(); } catch (e) { onError(e); } finally { setBusy(false); } }} />
      </>}
    </>
  );
}

function Tax({ st, canBook, onDone, onError }: { st: Status; canBook: boolean; onDone: () => void; onError: (e: unknown) => void }) {
  const t = useAccT();
  const x = t.yearEnd.tax;
  const { acc, href } = useAcc();
  const stored = st.closing.taxInput;
  const [input, setInput] = useState<TaxInput>(stored ?? { deficitIn: 0n, fund: 0n, otherAdd: 0n, otherDeduct: 0n });
  const [calc, setCalc] = useState<TaxCalc | null>(st.closing.tax ?? null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const booked = st.closing.closingVoucherId !== undefined;
  const fy = st.fiscalYear;
  const preview = useCallback(async (i: TaxInput) => { try { setCalc(ok(await acc.previewYearEndTax(fy.id, i))); } catch (e) { onError(e); } }, [acc, fy.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!booked) void preview(input); }, [booked]); // eslint-disable-line react-hooks/exhaustive-deps
  const field = (key: keyof TaxInput, labelText: string, wholeKronor = false) => (
    <label className="block" htmlFor={`ye-${key}`}>
      <span className="font-medium">{labelText}</span>
      <MoneyInput id={`ye-${key}`} labelText={labelText} value={input[key]} className="mt-1"
        onChange={(v) => setInput({ ...input, [key]: wholeKronor && v !== null ? (v / 100n) * 100n : v ?? 0n })} />
    </label>
  );
  const row = (key: string, v: bigint, strong = false) => {
    const label = x.rows[key];
    return (
      <tr key={key} className="border-t border-border">
        <th scope="row" className={`py-1 text-left ${strong ? "font-semibold" : "font-normal"}`}>{typeof label === "function" ? label((Number(calc?.params.corporateTaxBp ?? 0n) / 100).toLocaleString("sv-SE")) : label}</th>
        <td className={`py-1 text-right ${strong ? "font-semibold" : ""}`}><Money ore={v} /></td>
      </tr>
    );
  };
  return (
    <>
      <p>{x.text}</p>
      {booked && st.closing.closingVoucherId !== undefined && <p><Link to={href(`/admin/accounting/ledger/${st.closing.closingVoucherId}`)}>{x.voucher}</Link></p>}
      {!booked && (
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void preview(input); }}>
          {field("deficitIn", x.deficitIn)}
          <div>{field("fund", x.fund, true)}{calc && <p className="mt-1 text-sm text-muted">{x.fundMax(formatOre(calc.fundMax, true))}</p>}</div>
          {field("otherAdd", x.otherAdd)}
          {field("otherDeduct", x.otherDeduct)}
          <div className="sm:col-span-2"><button type="submit" className="btn btn-secondary">{x.calc}</button></div>
        </form>
      )}
      {calc && (
        <table className="w-full max-w-xl text-sm">
          <caption className="sr-only">{t.yearEnd.steps.tax}</caption>
          <tbody>
            {row("result", calc.result)}
            {calc.nonDeductible !== 0n && row("nonDeductible", calc.nonDeductible)}
            {calc.taxFree !== 0n && row("taxFree", -calc.taxFree)}
            {calc.schablon !== 0n && row("schablon", calc.schablon)}
            {calc.reversed !== 0n && row("reversed", calc.reversed)}
            {calc.deficitIn !== 0n && row("deficitIn", -calc.deficitIn)}
            {row("base", calc.base, true)}
            {calc.fund !== 0n && row("fund", -calc.fund)}
            {calc.deficitOut !== 0n ? row("deficitOut", calc.deficitOut) : row("taxable", calc.taxable)}
            {row("tax", calc.tax, true)}
            {row("after", calc.resultAfterTax, true)}
          </tbody>
        </table>
      )}
      {calc && <p className="text-xs text-muted">{x.params(String(calc.params.year), (Number(calc.params.corporateTaxBp) / 100).toLocaleString("sv-SE"))}</p>}
      {!booked && canBook && calc && <>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>{x.book}</button>
        <ConfirmPost open={open} onClose={() => setOpen(false)} title={x.book} creates={x.creates} date={fy.end} lines={closingLines(calc)} button={x.book} busy={busy}
          onConfirm={async () => { setBusy(true); try { ok(await acc.bookYearEnd(fy.id, input)); setOpen(false); onDone(); } catch (e) { onError(e); } finally { setBusy(false); } }} />
      </>}
    </>
  );
}

function Lock({ canLock, ended, locked, isOwner, onLock }: { canLock: boolean; ended: boolean; locked: boolean; isOwner: boolean; onLock: () => void }) {
  const t = useAccT();
  const l = t.yearEnd.lock;
  const [open, setOpen] = useState(false);
  if (locked) return <p>{l.done}</p>;
  return (
    <>
      <p>{l.text}</p>
      {!ended && <p className="text-muted">{l.notEnded}</p>}
      {ended && !canLock && <p className="text-muted">{l.blocked}</p>}
      {isOwner && <button type="button" className="btn btn-primary" disabled={!ended || !canLock} onClick={() => setOpen(true)}>{l.button}</button>}
      <Dialog open={open} onClose={() => setOpen(false)} title={l.button}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>{t.common.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={() => { setOpen(false); onLock(); }}>{l.button}</button>
        </>}>
        <p>{l.confirm}</p>
      </Dialog>
    </>
  );
}

