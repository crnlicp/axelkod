// Lön › Lönekörning: Underlag (lines per employee) → Granska (calculated payslips) →
// Godkänn (series P) → Utbetald (series B). Calculation is the canister's (C24).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { RunStatus, type Employee, type PayItem, type PayLine, type PayRun, type Payslip, type SlipInput } from "../../../../bindings/accounting";
import { errField, ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { meta } from "../../../../admin/accounting/ledger";
import { formatOre } from "../../../../admin/accounting/money";
import { canPayroll, decryptPii } from "../../../../admin/accounting/payroll";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { SectionTabs, payrollTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { Stepper, type Step } from "../../../../admin/accounting/ui/Stepper";
import { DocRef, Money, MoneyInput, PageHead, input, label } from "../../../../admin/accounting/ui/kit";
import { IconPlus } from "../../../../components/Icons";
import { Toast } from "../../../../admin/toast";

type Line = { code: string; text: string; qty: string; rate: bigint | null };
type Input = { employeeId: bigint; lines: Line[]; taxOverride: bigint | null };

const qtyOf = (s: string) => BigInt(Math.round(Number(s.replace(",", ".") || "0") * 1000));
const amountOf = (l: Line) => ((l.rate ?? 0n) * qtyOf(l.qty)) / 1000n;
const toLines = (ls: PayLine[]): Line[] => ls.map((l) => ({ code: l.code, text: l.text ?? "", qty: String(Number(l.quantity) / 1000).replace(".", ","), rate: l.rate }));

export default function PayRunPage() {
  const t = useAccT();
  const x = t.payroll.run;
  const err = useErr();
  const navigate = useNavigate();
  const { id } = useParams();
  const ctx = useAcc();
  const { acc, role, href } = ctx;
  const [run, setRun] = useState<PayRun | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<PayItem[]>([]);
  const [inputs, setInputs] = useState<Input[]>([]);
  const [step, setStep] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [paidDate, setPaidDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const can = canPayroll(role);

  const load = useCallback(async () => {
    const [r, e, i] = await Promise.all([acc.getPayRun(BigInt(id ?? "0")), acc.listEmployees(), acc.listPayItems()]);
    const run = ok(r);
    setRun(run);
    setEmployees(ok(e));
    setItems(ok(i).filter((p) => p.active));
    setInputs(run.inputs.map((s) => ({ employeeId: s.employeeId, lines: toLines(s.lines), taxOverride: s.taxOverride ?? null })));
  }, [acc, id]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);
  useCrumbs([{ label: t.payroll.title, to: "/admin/accounting/payroll" }, { label: run ? x.title(run.period) : "…" }]);

  const draft = run?.status === RunStatus.draft;
  const steps: Step[] = run ? [
    { key: "input", title: x.steps.input, state: draft ? "current" : "done" },
    { key: "review", title: x.steps.review, state: draft ? "todo" : "done" },
    { key: "approve", title: x.steps.approve, state: draft ? "todo" : "done" },
    { key: "paid", title: x.steps.paid, state: run.status === RunStatus.paid ? "done" : run.status === RunStatus.approved ? "current" : "todo" },
  ] : [];
  const active = step ?? steps.find((s) => s.state === "current")?.key ?? "review";
  const name = (eid: bigint) => employees.find((e) => e.id === eid)?.name ?? `#${eid}`;

  async function save() {
    if (!run) return;
    setBusy(true);
    try {
      const body: SlipInput[] = inputs.map((i) => ({
        employeeId: i.employeeId, taxOverride: i.taxOverride ?? undefined,
        lines: i.lines.map((l) => ({ code: l.code, text: l.text.trim() || undefined, quantity: qtyOf(l.qty), rate: l.rate ?? 0n, amount: amountOf(l) })),
      }));
      setRun(ok(await acc.savePayRun(run.id, run.paymentDate, body)));
      setBad(null);
      setStatus({ ok: true, text: x.saved });
      setStep("review");
    } catch (e) { setBad(errField(e)); setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  async function act(f: () => ReturnType<typeof acc.approvePayRun>, text: string) {
    setBusy(true);
    try { setRun(ok(await f())); setStatus({ ok: true, text }); setStep(null); } catch (e) { setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); setConfirm(false); }
  }

  const setLine = (ei: number, li: number, p: Partial<Line>) =>
    setInputs(inputs.map((inp, i) => (i !== ei ? inp : { ...inp, lines: inp.lines.map((l, j) => (j === li ? { ...l, ...p } : l)) })));

  return (
    <>
      <PageHead title={run ? x.title(run.period) : t.payroll.title}><SectionTabs {...payrollTabs(t.payroll)} /></PageHead>
      {!run ? <p role="status">{t.common.loading}</p> : (
        <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
          <div className="card self-start"><Stepper steps={steps} onSelect={setStep} />
            <p className="mt-3 text-sm text-muted">{t.payroll.runs.paymentDate}: {run.paymentDate}</p></div>
          <div className="space-y-4">
            {active === "input" && (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
                {inputs.map((inp, ei) => {
                  const en = name(inp.employeeId);
                  return (
                    <fieldset key={String(inp.employeeId)} className="card space-y-3" disabled={!draft || !can}>
                      <legend className="px-1 text-lg font-semibold">{en}</legend>
                      {inp.lines.map((l, li) => (
                        <div key={li} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-12">
                          <div className="sm:col-span-3"><label htmlFor={`l-${ei}-${li}-c`} className="text-sm text-muted">{x.line(x.code, li + 1)}</label>
                            <select id={`l-${ei}-${li}-c`} aria-label={`${x.line(x.code, li + 1)}, ${en}`} className={input} value={l.code} aria-invalid={bad?.includes("code") || undefined} onChange={(e) => setLine(ei, li, { code: e.target.value })}>
                              {items.map((it) => <option key={it.code} value={it.code}>{it.code} – {it.name}</option>)}
                            </select></div>
                          <div className="sm:col-span-3"><label htmlFor={`l-${ei}-${li}-t`} className="text-sm text-muted">{x.line(x.text, li + 1)}</label>
                            <input id={`l-${ei}-${li}-t`} aria-label={`${x.line(x.text, li + 1)}, ${en}`} className={input} maxLength={100} value={l.text} onChange={(e) => setLine(ei, li, { text: e.target.value })} /></div>
                          <div className="sm:col-span-2"><label htmlFor={`l-${ei}-${li}-q`} className="text-sm text-muted">{x.line(x.quantity, li + 1)}</label>
                            <input id={`l-${ei}-${li}-q`} aria-label={`${x.line(x.quantity, li + 1)}, ${en}`} inputMode="decimal" className={input} value={l.qty} onChange={(e) => setLine(ei, li, { qty: e.target.value })} /></div>
                          <div className="sm:col-span-2"><span className="text-sm text-muted">{x.line(x.rate, li + 1)}</span>
                            <MoneyInput labelText={`${x.line(x.rate, li + 1)}, ${en}`} allowNegative value={l.rate} onChange={(v) => setLine(ei, li, { rate: v })} /></div>
                          <div className="flex items-end justify-between gap-2 sm:col-span-2">
                            <span className="pb-2 tabular-nums"><Money ore={amountOf(l)} /></span>
                            <button type="button" aria-label={`${x.removeLine(li + 1)}, ${en}`} className="text-sm text-[var(--error)] underline" onClick={() => setInputs(inputs.map((v, i) => (i === ei ? { ...v, lines: v.lines.filter((_, j) => j !== li) } : v)))}>
                              {x.removeLine(li + 1)}</button>
                          </div>
                        </div>
                      ))}
                      <div className="flex flex-wrap items-end gap-4">
                        <button type="button" aria-label={`${x.addLine}, ${en}`} className="btn btn-secondary" onClick={() => setInputs(inputs.map((v, i) => (i === ei ? { ...v, lines: [...v.lines, { code: items[0]?.code ?? "LON", text: "", qty: "1", rate: null }] } : v)))}>
                          <IconPlus className="h-4 w-4" /> {x.addLine}</button>
                        <div className="min-w-48"><span className="text-sm text-muted">{x.taxOverride}</span>
                          <MoneyInput labelText={`${x.taxOverride}, ${en}`} value={inp.taxOverride} onChange={(v) => setInputs(inputs.map((w, i) => (i === ei ? { ...w, taxOverride: v } : w)))} /></div>
                      </div>
                    </fieldset>
                  );
                })}
                {draft && can && <div className="flex flex-wrap gap-2">
                  <button type="submit" className="btn btn-primary" disabled={busy}>{x.calculate}</button>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={async () => {
                    try { ok(await acc.deletePayRun(run.id)); navigate(href("/admin/accounting/payroll")); } catch (e) { setStatus({ ok: false, text: err(e) }); }
                  }}>{x.deleteDraft}</button>
                </div>}
              </form>
            )}
            {active === "review" && <Review run={run} employees={employees} items={items} />}
            {active === "approve" && (
              <div className="card space-y-3">
                {run.voucherId !== undefined ? <p>{x.voucher}: <DocRef id={run.voucherId} label={`#${run.voucherId}`} /></p> : <>
                  <p>{x.approveBody}</p>
                  {can && draft && <button type="button" className="btn btn-primary" onClick={() => setConfirm(true)}>{x.approve}</button>}
                </>}
              </div>
            )}
            {active === "paid" && (
              <div className="card space-y-3">
                {run.paidVoucherId !== undefined ? <p>{x.voucher}: <DocRef id={run.paidVoucherId} label={`#${run.paidVoucherId}`} /></p>
                  : run.status !== RunStatus.approved ? <p className="text-muted">{x.steps.approve}</p> : <>
                    <div><label htmlFor="paid-date" className={label}>{x.paidDate}</label>
                      <input id="paid-date" type="date" max={today()} className={input} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></div>
                    {can && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(() => acc.markPayRunPaid(run.id, paidDate), x.paidDone)}>{x.markPaid}</button>}
                  </>}
              </div>
            )}
          </div>
        </div>
      )}
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={x.approveTitle}
        footer={<><button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>{t.common.cancel}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run && void act(() => acc.approvePayRun(run.id), x.approved)}>{x.approve}</button></>}>
        <p>{x.approveBody}</p>
      </Dialog>
      <Toast status={status} />
    </>
  );
}

function Review({ run, employees, items }: { run: PayRun; employees: Employee[]; items: PayItem[] }) {
  const t = useAccT();
  const x = t.payroll.run;
  const ctx = useAcc();
  const sum = (f: (s: Payslip) => bigint) => run.slips.reduce((a, s) => a + f(s), 0n);
  const itemName = useMemo(() => new Map(items.map((i) => [i.code, i.name])), [items]);
  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{x.steps.review}</caption>
          <thead><tr className="text-left">
            <th scope="col">{x.employee}</th><th scope="col" className="text-right">{x.cash}</th><th scope="col" className="text-right">{x.benefits}</th>
            <th scope="col" className="text-right">{t.payroll.runs.tax}</th><th scope="col" className="text-right">{t.payroll.runs.net}</th>
            <th scope="col" className="text-right">{t.payroll.runs.fees}</th><th scope="col">{t.payroll.employees.category}</th><th scope="col"><span className="sr-only">PDF</span></th>
          </tr></thead>
          <tbody>
            {run.slips.map((s) => (
              <tr key={String(s.employeeId)} className="border-t border-border">
                <td className="py-1">{s.name}</td><td className="text-right"><Money ore={s.cash} /></td><td className="text-right"><Money ore={s.benefits} /></td>
                <td className="text-right"><Money ore={s.tax} /></td><td className="text-right font-semibold"><Money ore={s.net} /></td>
                <td className="text-right"><Money ore={s.fees} /></td><td>{x.category[s.feeCategory]}</td>
                <td><PdfActions preview={false} label={x.payslip} fileName={`lonespecifikation-${run.period}-${s.employeeId}.pdf`} job={async () => {
                  const e = employees.find((v) => v.id === s.employeeId);
                  const pnr = e ? await decryptPii(ctx.acc, e.personnummerEnc) : "";
                  return {
                    template: "payslip@1" as const, meta: meta(ctx, "Lönespecifikation", run.period, [`Utbetalning ${run.paymentDate}`]),
                    facts: [["Anställd", s.name], ["Personnummer", pnr], ["Period", run.period], ["Utbetalningsdag", run.paymentDate],
                      ["Skatteavdrag", e?.tax.__kind__ === "table" ? `Tabell ${e.tax.table.table}, kolumn ${e.tax.table.column}` : e?.tax.__kind__ === "flat" ? `${Number(e.tax.flat) / 100} %` : "Enligt beslut"]],
                    lines: s.lines.map((l) => ({ text: `${itemName.get(l.code) ?? l.code}${l.text ? ` – ${l.text}` : ""}`, quantity: String(Number(l.quantity) / 1000).replace(".", ","), rate: l.rate, amount: l.amount })),
                    totals: [["Kontant lön", s.cash], ["Skattepliktiga förmåner", s.benefits], ["Skattefria ersättningar", s.taxFree], ["Avdragen skatt", -s.tax], ["Nettoavdrag", -s.netDeductions], ["Att utbetala", s.net]],
                    agi: s.agi.map((f) => [`Ruta ${String(f.code).padStart(3, "0")}`, Number(f.code) === 50 || Number(f.code) === 51 ? "Ja" : `${f.amount} kr`] as [string, string]),
                  };
                }} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-border font-semibold">
            <td>{x.totals}</td><td className="text-right"><Money ore={sum((s) => s.cash)} /></td><td className="text-right"><Money ore={sum((s) => s.benefits)} /></td>
            <td className="text-right"><Money ore={sum((s) => s.tax)} /></td><td className="text-right"><Money ore={sum((s) => s.net)} /></td>
            <td className="text-right"><Money ore={sum((s) => s.fees)} /></td><td colSpan={2} /></tr></tfoot>
        </table>
      </div>
      <p className="text-sm text-muted">{x.vacation}: {formatOre(sum((s) => s.vacationAccrual), true)} · {x.vacationFees}: {formatOre(sum((s) => s.vacationFees), true)}</p>
    </div>
  );
}
