// Lön › Anställda: master data in plaintext, personnummer, address and bank account
// encrypted in the browser with the pii-v1 vetKey (C16) and shown only on "Visa".
import { useCallback, useEffect, useState } from "react";
import type { Employee, EmployeeInput } from "../../../../bindings/accounting";
import { errField, ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { canPayroll, decryptPii, encryptPii, normalizePnr, suggestedColumn } from "../../../../admin/accounting/payroll";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { SectionTabs, payrollTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, Money, MoneyInput, PageHead, input, label } from "../../../../admin/accounting/ui/kit";
import { IconPlus } from "../../../../components/Icons";
import { Toast } from "../../../../admin/toast";

type Form = {
  name: string; email: string; pnr: string; address: string; bank: string; employedFrom: string; employedTo: string;
  payKind: "monthly" | "hourly"; pay: bigint | null; taxKind: "table" | "flat" | "none"; table: string; column: string; flat: string;
  jamkning: string; vacationRule: "procentregeln" | "sammaloneregeln"; vacationDays: string; ownerOrRelated: boolean; vaxaFrom: string;
  workplaceStreet: string; workplaceCity: string; active: boolean;
};

const empty = (): Form => ({
  name: "", email: "", pnr: "", address: "", bank: "", employedFrom: today(), employedTo: "", payKind: "monthly", pay: null, taxKind: "table",
  table: "33", column: "1", flat: "30", jamkning: "", vacationRule: "procentregeln", vacationDays: "25", ownerOrRelated: false, vaxaFrom: "",
  workplaceStreet: "", workplaceCity: "", active: true,
});

export default function Employees() {
  const t = useAccT();
  const x = t.payroll.employees;
  const err = useErr();
  const { acc, role } = useAcc();
  const [rows, setRows] = useState<Employee[] | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<{ id: bigint | null; f: Form } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: t.payroll.title, to: "/admin/accounting/payroll" }, { label: t.payroll.tabs.employees }]);
  const load = useCallback(() => acc.listEmployees().then((r) => setRows(ok(r))).catch((e) => setStatus({ ok: false, text: err(e) })), [acc, err]);
  useEffect(() => { void load(); }, [load]);

  async function reveal(e: Employee) {
    try { setShown({ ...shown, [String(e.id)]: await decryptPii(acc, e.personnummerEnc) }); } catch (er) { setStatus({ ok: false, text: err(er) }); }
  }

  async function open(e: Employee | null) {
    if (!e) { setEdit({ id: null, f: empty() }); return; }
    try {
      const [pnr, address, bank] = await Promise.all([decryptPii(acc, e.personnummerEnc), e.addressEnc ? decryptPii(acc, e.addressEnc) : "", e.bankAccountEnc ? decryptPii(acc, e.bankAccountEnc) : ""]);
      setEdit({ id: e.id, f: {
        name: e.name, email: e.email ?? "", pnr, address, bank, employedFrom: e.employedFrom, employedTo: e.employedTo ?? "",
        payKind: e.pay.__kind__ === "monthly" ? "monthly" : "hourly", pay: e.pay.__kind__ === "monthly" ? e.pay.monthly : e.pay.hourly,
        taxKind: e.tax.__kind__, table: e.tax.__kind__ === "table" ? String(e.tax.table.table) : "33", column: e.tax.__kind__ === "table" ? String(e.tax.table.column) : "1",
        flat: e.tax.__kind__ === "flat" ? String(Number(e.tax.flat) / 100) : "30", jamkning: e.jamkning ?? "", vacationRule: e.vacationRule,
        vacationDays: String(e.vacationDays), ownerOrRelated: e.ownerOrRelated, vaxaFrom: e.vaxaFrom ?? "", workplaceStreet: e.workplaceStreet ?? "",
        workplaceCity: e.workplaceCity ?? "", active: e.active,
      } });
    } catch (er) { setStatus({ ok: false, text: err(er) }); }
  }

  return (
    <>
      <PageHead title={t.payroll.title} actions={canPayroll(role) ? <button type="button" className="btn btn-primary" onClick={() => void open(null)}><IconPlus className="h-4 w-4" /> {x.new}</button> : null}>
        <SectionTabs {...payrollTabs(t.payroll)} />
      </PageHead>
      <p className="mb-4 text-sm text-muted">{x.encrypted}</p>
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(e) => String(e.id)} caption={t.payroll.tabs.employees} empty={<EmptyState text={x.empty} />}
          onOpen={canPayroll(role) ? (e) => void open(e) : undefined}
          columns={[
            { key: "n", title: x.name, render: (e) => e.name, value: (e) => e.name },
            { key: "p", title: x.personnummer, render: (e) => shown[String(e.id)] ?? <button type="button" className="text-sm underline" onClick={(ev) => { ev.stopPropagation(); void reveal(e); }}>{x.show}<span className="sr-only"> {e.name}</span></button> },
            { key: "b", title: x.birthYear, secondary: true, render: (e) => String(e.birthYear), value: (e) => e.birthYear },
            { key: "f", title: x.employedFrom, secondary: true, render: (e) => e.employedFrom, value: (e) => e.employedFrom },
            { key: "l", title: x.pay, align: "right", render: (e) => <><Money ore={e.pay.__kind__ === "monthly" ? e.pay.monthly : e.pay.hourly} /> {e.pay.__kind__ === "monthly" ? x.monthly : x.hourly}</> },
            { key: "t", title: x.tax, secondary: true, render: (e) => (e.tax.__kind__ === "table" ? `${e.tax.table.table}:${e.tax.table.column}` : e.tax.__kind__ === "flat" ? `${Number(e.tax.flat) / 100} %` : "–") },
          ]} />
      )}
      {edit && <EmployeeDialog id={edit.id} initial={edit.f} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); setStatus({ ok: true, text: x.saved }); await load(); }} />}
      <Toast status={status} />
    </>
  );
}

function EmployeeDialog({ id, initial, onClose, onSaved }: { id: bigint | null; initial: Form; onClose: () => void; onSaved: () => void }) {
  const t = useAccT();
  const x = t.payroll.employees;
  const err = useErr();
  const { acc } = useAcc();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const set = (p: Partial<Form>) => setF({ ...f, ...p });
  const year = Number(today().slice(0, 4));

  async function save() {
    const pnr = normalizePnr(f.pnr);
    if (!pnr) { setBad("personnummer"); setError(x.invalidPnr); return; }
    setBusy(true);
    setError(null);
    try {
      const enc = async (s: string) => (s.trim() ? await encryptPii(acc, s.trim()) : undefined);
      const [personnummerEnc, addressEnc, bankAccountEnc] = await Promise.all([encryptPii(acc, pnr), enc(f.address), enc(f.bank)]);
      const pay = f.pay ?? 0n;
      const input: EmployeeInput = {
        name: f.name, email: f.email.trim() || undefined, birthYear: BigInt(pnr.slice(0, 4)), employedFrom: f.employedFrom, employedTo: f.employedTo || undefined,
        pay: f.payKind === "monthly" ? { __kind__: "monthly", monthly: pay } : { __kind__: "hourly", hourly: pay },
        tax: f.taxKind === "table" ? { __kind__: "table", table: { table: BigInt(f.table || "0"), column: BigInt(f.column || "0") } }
          : f.taxKind === "flat" ? { __kind__: "flat", flat: BigInt(Math.round(Number(f.flat.replace(",", ".")) * 100)) } : { __kind__: "none", none: null },
        jamkning: f.jamkning.trim() || undefined, vacationRule: f.vacationRule as EmployeeInput["vacationRule"], vacationDays: BigInt(f.vacationDays || "0"),
        ownerOrRelated: f.ownerOrRelated, vaxaFrom: f.vaxaFrom.trim() || undefined, costCenter: undefined, active: f.active,
        personnummerEnc, addressEnc, bankAccountEnc, workplaceStreet: f.workplaceStreet.trim() || undefined, workplaceCity: f.workplaceCity.trim() || undefined,
      };
      ok(await acc.saveEmployee(id, input));
      onSaved();
    } catch (e) { setBad(errField(e)); setError(err(e)); } finally { setBusy(false); }
  }

  const text = (key: keyof Form, title: string, extra: { type?: string; max?: number; hint?: string; required?: boolean } = {}) => (
    <div><label htmlFor={`emp-${key}`} className={label}>{title}</label>
      <input id={`emp-${key}`} type={extra.type ?? "text"} className={input} maxLength={extra.max ?? 100} required={extra.required} value={f[key] as string}
        aria-invalid={bad === key || undefined} aria-describedby={extra.hint ? `emp-${key}-hint` : undefined} onChange={(e) => set({ [key]: e.target.value } as Partial<Form>)} />
      {extra.hint && <p id={`emp-${key}-hint`} className="mt-1 text-xs text-muted">{extra.hint}</p>}</div>
  );
  const pnr = normalizePnr(f.pnr);

  return (
    <Dialog open onClose={onClose} title={id === null ? x.new : x.edit} wide
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>{t.common.cancel}</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{t.common.save}</button></>}>
      <p className="mb-4 text-sm text-muted">{x.encrypted}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {text("name", x.name, { required: true })}
        {text("pnr", x.personnummer, { max: 13, required: true, hint: "ÅÅÅÅMMDDNNNN" })}
        {text("address", x.address, { max: 200 })}
        {text("bank", x.bankAccount, { max: 40 })}
        {text("email", x.email, { type: "email", max: 254 })}
        {text("employedFrom", x.employedFrom, { type: "date" })}
        {text("employedTo", x.employedTo, { type: "date" })}
        <fieldset className="sm:col-span-2"><legend className={label}>{x.pay}</legend>
          <div className="mt-1 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2"><input type="radio" name="emp-pay" checked={f.payKind === "monthly"} onChange={() => set({ payKind: "monthly" })} /> {x.monthly}</label>
            <label className="flex items-center gap-2"><input type="radio" name="emp-pay" checked={f.payKind === "hourly"} onChange={() => set({ payKind: "hourly" })} /> {x.hourly}</label>
            <div className="min-w-40"><MoneyInput labelText={x.pay} value={f.pay} onChange={(v) => set({ pay: v })} /></div>
          </div></fieldset>
        <fieldset className="sm:col-span-2"><legend className={label}>{x.tax}</legend>
          <div className="mt-1 grid gap-3 sm:grid-cols-3">
            <div><label htmlFor="emp-taxKind" className="text-sm text-muted">{x.tax}</label>
              <select id="emp-taxKind" className={input} value={f.taxKind} onChange={(e) => set({ taxKind: e.target.value as Form["taxKind"] })}>
                <option value="table">{x.taxTable}</option><option value="flat">{x.flat}</option><option value="none">{x.taxNone}</option>
              </select></div>
            {f.taxKind === "table" && <>
              {text("table", x.taxTable, { max: 2 })}
              {text("column", x.taxColumn, { max: 1, hint: pnr ? `${x.taxColumn} ${suggestedColumn(Number(pnr.slice(0, 4)), year)}` : undefined })}
            </>}
            {f.taxKind === "flat" && text("flat", x.flat, { max: 5, hint: x.flatHint })}
          </div></fieldset>
        {text("jamkning", x.jamkning, { max: 200 })}
        <div><label htmlFor="emp-vac" className={label}>{x.vacationRule}</label>
          <select id="emp-vac" className={input} value={f.vacationRule} onChange={(e) => set({ vacationRule: e.target.value as Form["vacationRule"] })}>
            <option value="procentregeln">{x.procentregeln}</option><option value="sammaloneregeln">{x.sammaloneregeln}</option>
          </select></div>
        {text("vacationDays", x.vacationDays, { max: 3 })}
        {text("workplaceStreet", x.workplaceStreet, { max: 50 })}
        {text("workplaceCity", x.workplaceCity, { max: 50 })}
        <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={f.ownerOrRelated} onChange={(e) => set({ ownerOrRelated: e.target.checked, vaxaFrom: e.target.checked ? "" : f.vaxaFrom })} /> {x.ownerOrRelated}</label>
        {!f.ownerOrRelated && text("vaxaFrom", x.vaxaFrom, { max: 6, hint: x.vaxaHint })}
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> {x.active}</label>
      </div>
      {error && <p role="alert" className="mt-3 text-[var(--error)]">{error}</p>}
    </Dialog>
  );
}
