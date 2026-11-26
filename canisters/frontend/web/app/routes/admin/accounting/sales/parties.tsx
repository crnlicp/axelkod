// Kunder and Artiklar: lists with an edit dialog each (one module, two routes).
import { useCallback, useEffect, useState } from "react";
import { useMatches, useSearchParams } from "react-router";
import { Lang, Variant_person_company, Variant_service_goods, type Customer, type CustomerInput, type Item, type ItemInput } from "../../../../bindings/accounting";
import { errField, ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { plainOre } from "../../../../admin/accounting/money";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { SalesTabs } from "../../../../admin/accounting/ui/SalesTabs";
import { ViesCheck } from "../../../../admin/accounting/ui/ViesCheck";
import { EmptyState, Money, MoneyInput, PageHead, input, label } from "../../../../admin/accounting/ui/kit";
import { IconPlus } from "../../../../components/Icons";
import { Toast } from "../../../../admin/toast";

export default function Parties() {
  const items = useMatches().some((m) => m.id === "acc-items");
  return items ? <Items /> : <Customers />;
}

const EMPTY_CUSTOMER: CustomerInput = {
  kind: Variant_person_company.company, name: "", address: { street: "", postalCode: "", city: "", country: "SE" }, termsDays: 30n, language: Lang.sv,
  reminderFeeAgreed: false, active: true,
};

function Customers() {
  const t = useAccT();
  const s = t.sales;
  const c = s.customers;
  const err = useErr();
  const { acc, canBook } = useAcc();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [edit, setEdit] = useState<{ id: bigint | null; v: CustomerInput } | null>(params.get("new") ? { id: null, v: EMPTY_CUSTOMER } : null);
  const [bad, setBad] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: s.title, to: "/admin/accounting/sales/invoices" }, { label: s.tabs.customers }]);
  const load = useCallback(() => acc.listCustomers().then((r) => setRows(ok(r))).catch((e) => setStatus({ ok: false, text: err(e) })), [acc, err]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!edit) return;
    const v = edit.v;
    const opt = (x?: string) => (x?.trim() ? x.trim() : undefined);
    try {
      ok(await acc.saveCustomer(edit.id, { ...v, orgNr: opt(v.orgNr), vatNr: opt(v.vatNr), email: opt(v.email), peppolId: opt(v.peppolId) }));
      setEdit(null);
      setBad(null);
      if (params.get("new")) setParams((p) => { p.delete("new"); return p; });
      setStatus({ ok: true, text: c.saved });
      await load();
    } catch (e) { setBad(errField(e)); setStatus({ ok: false, text: err(e) }); }
  }

  const set = (f: Partial<CustomerInput>) => setEdit((x) => (x ? { ...x, v: { ...x.v, ...f } } : x));
  const setAddr = (f: Partial<CustomerInput["address"]>) => setEdit((x) => (x ? { ...x, v: { ...x.v, address: { ...x.v.address, ...f } } } : x));
  const field = (id: string, text: string, value: string, on: (v: string) => void, extra: Record<string, unknown> = {}) => (
    <div><label htmlFor={id} className={label}>{text}</label><input id={id} className={input} value={value} onChange={(e) => on(e.target.value)} aria-invalid={bad === id.replace("cu-", "") || undefined} {...extra} /></div>
  );

  return (
    <>
      <PageHead title={s.title} actions={canBook ? <button type="button" className="btn btn-primary" onClick={() => setEdit({ id: null, v: EMPTY_CUSTOMER })}><IconPlus className="h-5 w-5" /> {c.new}</button> : null}><SalesTabs /></PageHead>
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(x) => String(x.id)} caption={s.tabs.customers} csvName="kunder" empty={<EmptyState text={c.empty} />}
          onOpen={canBook ? (x) => { const { id, ...v } = x; setEdit({ id, v }); } : undefined}
          columns={[
            { key: "n", title: c.name, render: (x) => x.name, value: (x) => x.name },
            { key: "o", title: c.orgNr, render: (x) => x.orgNr ?? "", value: (x) => x.orgNr ?? "" },
            { key: "v", title: c.vatNr, secondary: true, render: (x) => x.vatNr ?? "", value: (x) => x.vatNr ?? "" },
            { key: "c", title: c.city, render: (x) => `${x.address.city}${x.address.country !== "SE" ? `, ${x.address.country}` : ""}`, value: (x) => x.address.city },
            { key: "t", title: c.terms, secondary: true, render: (x) => String(x.termsDays), value: (x) => x.termsDays },
            { key: "a", title: c.active, secondary: true, render: (x) => (x.active ? t.common.yes : t.common.no), value: (x) => (x.active ? 1 : 0) },
          ]} />
      )}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id === null ? c.new : c.edit} wide
        footer={<><button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>{t.common.cancel}</button><button type="button" className="btn btn-primary" onClick={() => void save()}>{t.common.save}</button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="sm:col-span-2"><legend className={label}>{c.kind}</legend>
              <div className="mt-1 flex gap-4">
                {[Variant_person_company.company, Variant_person_company.person].map((k) => (
                  <label key={k} className="flex items-center gap-2"><input type="radio" name="cu-kind" checked={edit.v.kind === k} onChange={() => set({ kind: k })} /> {k === "company" ? c.company : c.person}</label>
                ))}
              </div>
            </fieldset>
            {field("cu-name", c.name, edit.v.name, (v) => set({ name: v }))}
            {field("cu-orgNr", c.orgNr, edit.v.orgNr ?? "", (v) => set({ orgNr: v }))}
            <div><label htmlFor="cu-vatNr" className={label}>{c.vatNr}</label>
              <input id="cu-vatNr" className={input} value={edit.v.vatNr ?? ""} aria-describedby="cu-vat-hint" aria-invalid={bad === "vatNr" || undefined} onChange={(e) => set({ vatNr: e.target.value })} />
              <p id="cu-vat-hint" className="mt-1 text-xs text-muted">{c.vatHint}</p>
              <ViesCheck vatNr={edit.v.vatNr ?? ""} /></div>
            {field("cu-email", c.email, edit.v.email ?? "", (v) => set({ email: v }), { type: "email" })}
            {field("cu-address.street", c.street, edit.v.address.street, (v) => setAddr({ street: v }))}
            {field("cu-address.postalCode", c.postalCode, edit.v.address.postalCode, (v) => setAddr({ postalCode: v }))}
            {field("cu-address.city", c.city, edit.v.address.city, (v) => setAddr({ city: v }))}
            {field("cu-address.country", c.country, edit.v.address.country, (v) => setAddr({ country: v.toUpperCase() }), { maxLength: 2 })}
            {field("cu-peppolId", c.peppolId, edit.v.peppolId ?? "", (v) => set({ peppolId: v }))}
            {field("cu-termsDays", c.terms, String(edit.v.termsDays), (v) => set({ termsDays: BigInt(Math.max(0, Math.min(365, Number(v) || 0))) }), { type: "number", min: 0, max: 365 })}
            <div><label htmlFor="cu-lang" className={label}>{c.language}</label>
              <select id="cu-lang" className={input} value={edit.v.language} onChange={(e) => set({ language: e.target.value as Lang })}><option value={Lang.sv}>Svenska</option><option value={Lang.en}>English</option></select></div>
            <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={edit.v.reminderFeeAgreed} onChange={(e) => set({ reminderFeeAgreed: e.target.checked })} /> {c.feeAgreed}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.v.active} onChange={(e) => set({ active: e.target.checked })} /> {c.active}</label>
          </div>
        )}
      </Dialog>
      <Toast status={status} />
    </>
  );
}

const EMPTY_ITEM: ItemInput = { sku: "", name: "", unit: "st", priceExVat: 0n, vatCode: "U25", account: 3001n, kind: Variant_service_goods.service, active: true };

function Items() {
  const t = useAccT();
  const s = t.sales;
  const it = s.items;
  const err = useErr();
  const { acc, data, canBook } = useAcc();
  const [rows, setRows] = useState<Item[] | null>(null);
  const [edit, setEdit] = useState<{ id: bigint | null; v: ItemInput } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: s.title, to: "/admin/accounting/sales/invoices" }, { label: s.tabs.items }]);
  const load = useCallback(() => acc.listItems().then((r) => setRows(ok(r))).catch((e) => setStatus({ ok: false, text: err(e) })), [acc, err]);
  useEffect(() => { void load(); }, [load]);
  const set = (f: Partial<ItemInput>) => setEdit((x) => (x ? { ...x, v: { ...x.v, ...f } } : x));

  async function save() {
    if (!edit) return;
    try { ok(await acc.saveItem(edit.id, edit.v)); setEdit(null); setStatus({ ok: true, text: it.saved }); await load(); }
    catch (e) { setStatus({ ok: false, text: err(e) }); }
  }
  const revenue = (data?.accounts ?? []).filter((a) => a.kind === "revenue" && a.active);
  const vatCodes = (data?.vatCodes ?? []).filter((v) => v.active && !["inputDomestic", "reverseChargePurchase", "importVat"].includes(v.kind));

  return (
    <>
      <PageHead title={s.title} actions={canBook ? <button type="button" className="btn btn-primary" onClick={() => setEdit({ id: null, v: EMPTY_ITEM })}><IconPlus className="h-5 w-5" /> {it.new}</button> : null}><SalesTabs /></PageHead>
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(x) => String(x.id)} caption={s.tabs.items} csvName="artiklar" empty={<EmptyState text={it.empty} />}
          onOpen={canBook ? (x) => { const { id, ...v } = x; setEdit({ id, v }); } : undefined}
          columns={[
            { key: "s", title: it.sku, render: (x) => x.sku, value: (x) => x.sku },
            { key: "n", title: it.name, render: (x) => x.name, value: (x) => x.name },
            { key: "u", title: it.unit, render: (x) => x.unit, value: (x) => x.unit },
            { key: "p", title: it.price, align: "right", render: (x) => <Money ore={x.priceExVat} />, value: (x) => x.priceExVat, csv: (x) => plainOre(x.priceExVat) },
            { key: "v", title: it.vat, render: (x) => x.vatCode, value: (x) => x.vatCode },
            { key: "a", title: it.account, secondary: true, render: (x) => String(x.account), value: (x) => x.account },
          ]} />
      )}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id === null ? it.new : it.edit} wide
        footer={<><button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>{t.common.cancel}</button><button type="button" className="btn btn-primary" onClick={() => void save()}>{t.common.save}</button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="it-sku" className={label}>{it.sku}</label><input id="it-sku" className={input} maxLength={50} value={edit.v.sku} onChange={(e) => set({ sku: e.target.value })} /></div>
            <div><label htmlFor="it-name" className={label}>{it.name}</label><input id="it-name" className={input} maxLength={200} value={edit.v.name} onChange={(e) => set({ name: e.target.value })} /></div>
            <div><label htmlFor="it-unit" className={label}>{it.unit}</label><input id="it-unit" className={input} maxLength={20} value={edit.v.unit} onChange={(e) => set({ unit: e.target.value })} /></div>
            <div><span className={label}>{it.price}</span><MoneyInput value={edit.v.priceExVat} labelText={it.price} onChange={(v) => set({ priceExVat: v ?? 0n })} /></div>
            <div><label htmlFor="it-vat" className={label}>{it.vat}</label>
              <select id="it-vat" className={input} value={edit.v.vatCode} onChange={(e) => { const a = revenue.find((x) => x.vatCode === e.target.value)?.number; set({ vatCode: e.target.value, ...(a !== undefined ? { account: a } : {}) }); }}>
                {vatCodes.map((v) => <option key={v.code} value={v.code}>{v.code} – {v.name}</option>)}
              </select></div>
            <div><label htmlFor="it-acc" className={label}>{it.account}</label>
              <select id="it-acc" className={input} value={String(edit.v.account)} onChange={(e) => set({ account: BigInt(e.target.value) })}>
                {revenue.map((a) => <option key={String(a.number)} value={String(a.number)}>{String(a.number)} {a.name}</option>)}
              </select></div>
            <fieldset><legend className={label}>{it.kind}</legend>
              <div className="mt-1 flex gap-4">
                {[Variant_service_goods.service, Variant_service_goods.goods].map((k) => (
                  <label key={k} className="flex items-center gap-2"><input type="radio" name="it-kind" checked={edit.v.kind === k} onChange={() => set({ kind: k })} /> {k === "goods" ? it.goods : it.service}</label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.v.active} onChange={(e) => set({ active: e.target.checked })} /> {it.active}</label>
          </div>
        )}
      </Dialog>
      <Toast status={status} />
    </>
  );
}
