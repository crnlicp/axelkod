// Lön › Inställningar: tax tables read in from Skatteverket's file (V10), pay items
// (lönearter) and the payroll parameters with their source (owner-editable, V8–V11).
import { useCallback, useEffect, useState } from "react";
import { ItemKind, type Params, type PayItem, type TaxTableInfo } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { hex } from "../../../../admin/accounting/canonical";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { formatOre } from "../../../../admin/accounting/money";
import { canPayroll, parseTaxTables } from "../../../../admin/accounting/payroll";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { SectionTabs, payrollTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, PageHead, fmtTime, input, label } from "../../../../admin/accounting/ui/kit";
import { useAdminLang } from "../../../../admin/i18n";
import { Toast } from "../../../../admin/toast";

/** Editable numeric parameters: key, unit ("bp" = percent × 100, "ore" = kronor). */
const FIELDS: [keyof Params, "bp" | "ore" | "n"][] = [
  ["feeFullBp", "bp"], ["feePensionBp", "bp"], ["pensionAge", "n"], ["zeroBornBefore", "n"], ["yearThreshold", "ore"], ["flatTaxBp", "bp"],
  ["vacationPercentBp", "bp"], ["vacationSupplementBp", "bp"], ["vaxaRefundBp", "bp"], ["vaxaCap", "ore"], ["vaxaCapBefore202405", "ore"], ["vaxaMonths", "n"],
  ["mileageOwn", "ore"], ["mileageBenefitCar", "ore"], ["mileageElectric", "ore"], ["perDiemFull", "ore"], ["perDiemHalf", "ore"],
  ["perDiemAfter3Months", "ore"], ["perDiemNight", "ore"], ["mealBreakfast", "ore"], ["mealLunch", "ore"], ["mealFull", "ore"], ["prisbasbelopp", "ore"],
];
const show = (v: bigint, u: string) => (u === "bp" ? (Number(v) / 100).toLocaleString("sv-SE") : u === "ore" ? formatOre(v) : String(v));
const parse = (s: string, u: string) => (u === "n" ? BigInt(s.trim()) : BigInt(Math.round(Number(s.replace(/\s/g, "").replace(",", ".")) * 100)));

export default function PayrollSettings() {
  const t = useAccT();
  const x = t.payroll.settings;
  const err = useErr();
  const { acc, role, isOwner } = useAcc();
  const { t: at } = useAdminLang();
  const [tables, setTables] = useState<TaxTableInfo[] | null>(null);
  const [items, setItems] = useState<PayItem[]>([]);
  const [params, setParams] = useState<Params | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [year, setYear] = useState(today().slice(0, 4));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: t.payroll.title, to: "/admin/accounting/payroll" }, { label: t.payroll.tabs.settings }]);
  const load = useCallback(async () => {
    const [tb, it, p] = await Promise.all([acc.listTaxTables(), acc.listPayItems(), acc.getPayrollParams()]);
    setTables(ok(tb)); setItems(ok(it));
    const pp = ok(p);
    setParams(pp);
    setForm(Object.fromEntries([...FIELDS.map(([k, u]) => [k, show(pp[k] as bigint, u)]), ["source", pp.source]]));
  }, [acc]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);

  async function importFile(file: File) {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const all = parseTaxTables(new TextDecoder("utf-8").decode(bytes));
      // Only the tables employees use (C24).
      const used = new Set(ok(await acc.listEmployees()).flatMap((e) => (e.tax.__kind__ === "table" ? [Number(e.tax.table.table)] : [])));
      const pick = [...all.keys()].filter((n) => used.size === 0 || used.has(n));
      for (const n of pick) ok(await acc.importTaxTable(BigInt(year), BigInt(n), all.get(n)!, sha));
      setStatus({ ok: true, text: x.imported(pick.length) });
      await load();
    } catch (e) { setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  async function saveParams() {
    if (!params) return;
    try {
      const next = { ...params, source: form.source };
      for (const [k, u] of FIELDS) (next as Record<string, unknown>)[k] = parse(form[k] ?? "", u);
      ok(await acc.setPayrollParams(next));
      setStatus({ ok: true, text: x.paramsSaved });
      await load();
    } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }

  const kindName = (k: ItemKind) => x.kinds[k];
  return (
    <>
      <PageHead title={t.payroll.title}><SectionTabs {...payrollTabs(t.payroll)} /></PageHead>
      <section aria-labelledby="pt-tables" className="card mb-6 space-y-3">
        <h2 id="pt-tables" className="text-lg font-semibold">{x.tables}</h2>
        <p className="text-sm text-muted">{x.tablesIntro}</p>
        {canPayroll(role) && <div className="flex flex-wrap items-end gap-4">
          <div><label htmlFor="pt-year" className={label}>{x.year}</label><input id="pt-year" inputMode="numeric" maxLength={4} className={input} value={year} onChange={(e) => setYear(e.target.value)} /></div>
          <div><label htmlFor="pt-file" className={label}>{x.file}</label>
            <input id="pt-file" type="file" accept=".txt,text/plain" disabled={busy} className={input} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} /></div>
        </div>}
        {!tables ? <p role="status">{t.common.loading}</p> : tables.length === 0 ? <p className="text-sm">{x.noTables}</p> : (
          <DataTable rows={tables} rowKey={(r) => `${r.year}-${r.table}`} caption={x.tables}
            columns={[
              { key: "y", title: x.year, render: (r) => String(r.year), value: (r) => r.year },
              { key: "t", title: t.payroll.employees.taxTable, render: (r) => String(r.table), value: (r) => r.table },
              { key: "r", title: x.rows, align: "right", render: (r) => String(r.rows), value: (r) => r.rows },
              { key: "s", title: "SHA-256", secondary: true, render: (r) => <code>{hex(Uint8Array.from(r.sha256)).slice(0, 16)}</code> },
              { key: "i", title: "", secondary: true, render: (r) => fmtTime(r.importedAt, at.locale) },
            ]} />
        )}
      </section>
      <section aria-labelledby="pt-items" className="mb-6">
        <h2 id="pt-items" className="mb-2 text-lg font-semibold">{x.items}</h2>
        <DataTable rows={items} rowKey={(i) => i.code} caption={x.items} empty={<EmptyState text="–" />}
          columns={[
            { key: "c", title: x.code, render: (i) => i.code, value: (i) => i.code },
            { key: "n", title: x.name, render: (i) => i.name, value: (i) => i.name },
            { key: "k", title: x.kind, render: (i) => kindName(i.kind), value: (i) => i.kind },
            { key: "a", title: x.agiField, align: "right", render: (i) => (i.agiField !== undefined ? String(i.agiField).padStart(3, "0") : "–") },
            { key: "acc", title: x.account, align: "right", render: (i) => (i.account !== undefined ? String(i.account) : "–") },
            { key: "v", title: x.vacationBearing, render: (i) => (i.vacationBearing ? t.common.yes : t.common.no) },
          ]} />
      </section>
      {params && (
        <form aria-labelledby="pt-params" className="card space-y-4" onSubmit={(e) => { e.preventDefault(); void saveParams(); }}>
          <h2 id="pt-params" className="text-lg font-semibold">{x.params} {String(params.year)}</h2>
          {!isOwner && <p className="text-sm text-muted">{x.ownerOnly}</p>}
          <fieldset disabled={!isOwner} className="grid gap-3 sm:grid-cols-3">
            {FIELDS.map(([k, u]) => (
              <div key={k}><label htmlFor={`pp-${k}`} className="text-sm text-muted">{x.paramNames[k] ?? k}{u === "bp" ? " (%)" : u === "ore" ? " (kr)" : ""}</label>
                <input id={`pp-${k}`} className={input} inputMode="decimal" value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
            ))}
            <div className="sm:col-span-3"><label htmlFor="pp-source" className={label}>{x.source}</label>
              <textarea id="pp-source" className={input} rows={2} maxLength={500} value={form.source ?? ""} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
          </fieldset>
          {params.youth && <p className="text-sm text-muted">{x.youth(params.youth.fromPeriod, params.youth.toPeriod, `${params.youth.minAge}–${params.youth.maxAge}`, (Number(params.youth.bp) / 100).toLocaleString("sv-SE"), formatOre(params.youth.cap, true))}</p>}
          {isOwner && <button type="submit" className="btn btn-primary">{x.saveParams}</button>}
        </form>
      )}
      <Toast status={status} />
    </>
  );
}
