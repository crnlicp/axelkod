// CSV import stepper for bank statements and the tax account: file → columns →
// preview → import. Parsing happens in the browser; the canister skips duplicates.
// The bank mapping is saved on the bank account; the tax mapping in this browser.
import { useEffect, useMemo, useState } from "react";
import { Link, useMatches } from "react-router";
import { TaxKind, type BankAccount, type CsvMapping, type ImportResult, type TaxRow } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { bankRows, guessDelimiter, parseCsv, taxRows } from "../../../../admin/accounting/purchases";
import { SectionTabs, bankTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { Stepper, type Step } from "../../../../admin/accounting/ui/Stepper";
import { Money, PageHead, input, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

const TAX_MAPPING = "axelkod:acc-tax-mapping";
const DEFAULT: CsvMapping = { delimiter: ";", skipRows: 1n, dateCol: 0n, amountCol: 1n, textCol: 2n, decimalComma: true };
const STEPS = ["file", "map", "preview", "done"] as const;
type StepKey = (typeof STEPS)[number];

function savedTaxMapping(): CsvMapping | null {
  try {
    const x = JSON.parse(localStorage.getItem(TAX_MAPPING) ?? "null") as Record<string, string | boolean | null> | null;
    if (!x) return null;
    const n = (k: string) => (x[k] === null || x[k] === undefined ? undefined : BigInt(x[k] as string));
    return { delimiter: String(x.delimiter), skipRows: n("skipRows")!, dateCol: n("dateCol")!, amountCol: n("amountCol")!, textCol: n("textCol")!, decimalComma: Boolean(x.decimalComma), referenceCol: n("referenceCol"), counterpartyCol: n("counterpartyCol") };
  } catch { return null; }
}

export default function Import() {
  const tax = useMatches().some((m) => m.id === "acc-tax-import");
  const t = useAccT();
  const b = t.bank;
  const x = b.import;
  const err = useErr();
  const { acc, canBook, href } = useAcc();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState<bigint | null>(null);
  const [step, setStep] = useState<StepKey>("file");
  const [text, setText] = useState("");
  const [m, setM] = useState<CsvMapping>(DEFAULT);
  const [kinds, setKinds] = useState<Record<number, TaxKind>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: b.title, to: "/admin/accounting/bank" }, ...(tax ? [{ label: b.tabs.tax, to: "/admin/accounting/bank/tax" }] : []), { label: tax ? b.tax.importTitle : x.title }]);

  useEffect(() => {
    if (tax) return;
    acc.listBankAccounts().then((r) => { const xs = ok(r); setAccounts(xs); setAccountId(xs[0]?.id ?? null); }).catch((e) => setStatus({ ok: false, text: err(e) }));
  }, [acc, err, tax]);

  const table = useMemo(() => (text ? parseCsv(text, m.delimiter) : []), [text, m.delimiter]);
  const parsed = useMemo(() => (tax ? taxRows(table, m) : bankRows(table, m)), [table, m, tax]);
  const width = Math.max(0, ...table.slice(0, 10).map((r) => r.length));
  const sampleRow = table[Number(m.skipRows)] ?? [];

  async function choose(file: File) {
    const raw = await file.text();
    setText(raw);
    const remembered = tax ? savedTaxMapping() : accounts.find((a) => a.id === accountId)?.mapping;
    setM(remembered ?? { ...DEFAULT, delimiter: guessDelimiter(raw) });
    setKinds({});
    setStep("map");
  }

  async function run() {
    setBusy(true);
    try {
      if (tax) {
        const rows: TaxRow[] = (parsed.rows as TaxRow[]).map((r, i) => ({ ...r, kind: kinds[i] ?? r.kind }));
        setResult(ok(await acc.importTaxRows(rows)));
        try { localStorage.setItem(TAX_MAPPING, JSON.stringify(m, (_, v) => (typeof v === "bigint" ? v.toString() : v))); } catch { /* convenience only */ }
      } else {
        const a = accounts.find((y) => y.id === accountId);
        if (!a) return;
        setResult(ok(await acc.importBankRows(a.id, parsed.rows)));
        const { id, ...rest } = a;
        ok(await acc.saveBankAccount(id, { ...rest, mapping: m }));
      }
      setStep("done");
    } catch (e) { setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  const steps: Step[] = STEPS.map((k, i) => ({ key: k, title: x.steps[k], state: k === step ? "current" : i < STEPS.indexOf(step) ? "done" : "todo" }));
  const col = (k: "dateCol" | "amountCol" | "textCol" | "referenceCol" | "counterpartyCol", optional = false) => (
    <div>
      <label htmlFor={`im-${k}`} className={label}>{x[k]}</label>
      <select id={`im-${k}`} className={input} value={m[k] === undefined ? "" : String(m[k])}
        onChange={(e) => setM({ ...m, [k]: e.target.value === "" ? undefined : BigInt(e.target.value) })}>
        {optional && <option value="">{x.noColumn}</option>}
        {Array.from({ length: width }, (_, i) => <option key={i} value={i}>{x.column(i + 1, (sampleRow[i] ?? "").slice(0, 30))}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <PageHead title={b.title}><SectionTabs {...bankTabs(b)} /></PageHead>
      <h2 className="mb-4 text-2xl">{tax ? b.tax.importTitle : x.title}</h2>
      <Stepper steps={steps} onSelect={(k) => { if (STEPS.indexOf(k as StepKey) < STEPS.indexOf(step) && step !== "done") setStep(k as StepKey); }} />
      <div className="card mt-6 space-y-4">
        {step === "file" && (
          <>
            {!tax && accounts.length > 0 && <div><label htmlFor="im-acc" className={label}>{x.target}</label>
              <select id="im-acc" className={input} value={accountId === null ? "" : String(accountId)} onChange={(e) => setAccountId(BigInt(e.target.value))}>
                {accounts.map((a) => <option key={String(a.id)} value={String(a.id)}>{a.name} ({String(a.ledgerAccount)})</option>)}
              </select></div>}
            {tax && <p className="text-sm text-muted">{b.tax.intro}</p>}
            <div><label htmlFor="im-file" className={label}>{x.file}</label>
              <input id="im-file" type="file" accept=".csv,text/csv,text/plain" className={input} aria-describedby="im-file-hint" disabled={!canBook}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); }} />
              <p id="im-file-hint" className="mt-1 text-sm text-muted">{x.fileHint}</p></div>
          </>
        )}
        {step === "map" && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label htmlFor="im-del" className={label}>{x.delimiter}</label>
                <select id="im-del" className={input} value={m.delimiter} onChange={(e) => setM({ ...m, delimiter: e.target.value })}>
                  <option value=";">;</option><option value=",">,</option><option value={"\t"}>Tab</option>
                </select></div>
              <div><label htmlFor="im-skip" className={label}>{x.skipRows}</label>
                <input id="im-skip" type="number" min={0} max={50} className={input} value={String(m.skipRows)} onChange={(e) => setM({ ...m, skipRows: BigInt(Math.max(0, Math.min(50, Number(e.target.value) || 0))) })} /></div>
              <label className="flex items-center gap-2 self-end"><input type="checkbox" checked={m.decimalComma} onChange={(e) => setM({ ...m, decimalComma: e.target.checked })} /> {x.decimalComma}</label>
              {col("dateCol")}{col("amountCol")}{col("textCol")}
              {!tax && col("referenceCol", true)}{!tax && col("counterpartyCol", true)}
            </div>
            <p aria-live="polite">{x.rows(parsed.rows.length)}{parsed.errors.length > 0 && <span className="block text-[var(--error)]">{x.errors(parsed.errors.slice(0, 20).join(", "))}</span>}</p>
            <div className="flex gap-3"><button type="button" className="btn btn-secondary" onClick={() => setStep("file")}>{t.common.back}</button>
              <button type="button" className="btn btn-primary" disabled={parsed.rows.length === 0} onClick={() => setStep("preview")}>{t.common.next}</button></div>
          </>
        )}
        {step === "preview" && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{x.steps.preview}</caption>
                <thead><tr className="text-left text-muted"><th scope="col" className="py-1">{b.date}</th><th scope="col" className="py-1">{b.text}</th><th scope="col" className="py-1 text-right">{b.amount}</th>{tax && <th scope="col" className="py-1">{b.tax.kind}</th>}</tr></thead>
                <tbody>
                  {parsed.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1">{r.date}</td><td className="py-1">{r.text}</td><td className="py-1 text-right"><Money ore={r.amount} /></td>
                      {tax && <td className="py-1"><label className="sr-only" htmlFor={`im-k${i}`}>{b.tax.kind} {i + 1}</label>
                        <select id={`im-k${i}`} className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1" value={kinds[i] ?? (r as TaxRow).kind} onChange={(e) => setKinds({ ...kinds, [i]: e.target.value as TaxKind })}>
                          {Object.values(TaxKind).map((k) => <option key={k} value={k}>{b.tax.kinds[k]}</option>)}
                        </select></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>{x.rows(parsed.rows.length)}</p>
            <div className="flex gap-3"><button type="button" className="btn btn-secondary" onClick={() => setStep("map")}>{t.common.back}</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}>{x.importButton}</button></div>
          </>
        )}
        {step === "done" && result && (
          <>
            <p className="text-lg font-semibold" aria-live="polite">{x.result(Number(result.added), Number(result.duplicates))}</p>
            <Link to={href(tax ? "/admin/accounting/bank/tax" : "/admin/accounting/bank")} className="btn btn-primary">{tax ? b.tabs.tax : x.toMatching}</Link>
          </>
        )}
      </div>
      <Toast status={status} />
    </>
  );
}
