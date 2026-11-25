// Create or edit a supplier (used by Leverantörer and the booking workbench).
import { useState } from "react";
import { Treatment, type Supplier, type SupplierInput } from "../../../bindings/accounting";
import { errField, ok } from "../api";
import { useAcc, useAccT, useErr } from "../context";
import { AccountPicker } from "./AccountPicker";
import { Dialog } from "./Dialog";
import { input, label } from "./kit";

export const EMPTY_SUPPLIER: SupplierInput = { name: "", country: "SE", treatment: Treatment.domestic, active: true };

export function SupplierDialog({ id, initial, onClose, onSaved }: {
  id: bigint | null; initial: SupplierInput; onClose: () => void; onSaved: (s: Supplier) => void;
}) {
  const t = useAccT();
  const s = t.purchases.suppliers;
  const err = useErr();
  const { acc } = useAcc();
  const [v, setV] = useState(initial);
  const [bad, setBad] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const opt = (x?: string) => (x?.trim() ? x.trim() : undefined);

  async function save() {
    try {
      const saved = ok(await acc.saveSupplier(id, {
        ...v, orgNr: opt(v.orgNr), vatNr: opt(v.vatNr), bankgiro: opt(v.bankgiro), plusgiro: opt(v.plusgiro), iban: opt(v.iban), bic: opt(v.bic),
      }));
      onSaved(saved);
    } catch (e) { setBad(errField(e)); setError(err(e)); }
  }

  const field = (k: "name" | "orgNr" | "vatNr" | "country" | "bankgiro" | "plusgiro" | "iban" | "bic") => (
    <div>
      <label htmlFor={`su-${k}`} className={label}>{s[k]}{k === "name" || k === "country" ? "" : ` (${t.common.optional})`}</label>
      <input id={`su-${k}`} className={input} value={v[k] ?? ""} aria-invalid={bad === k || undefined} maxLength={k === "country" ? 2 : undefined}
        onChange={(e) => setV({ ...v, [k]: k === "country" ? e.target.value.toUpperCase() : e.target.value })} />
    </div>
  );

  return (
    <Dialog open onClose={onClose} title={id === null ? s.new : s.edit} wide
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>{t.common.cancel}</button><button type="button" className="btn btn-primary" onClick={() => void save()}>{t.common.save}</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name")}{field("orgNr")}{field("vatNr")}{field("country")}
        {field("bankgiro")}{field("plusgiro")}{field("iban")}{field("bic")}
        <div><label htmlFor="su-acc" className={label}>{s.defaultAccount} ({t.common.optional})</label>
          <AccountPicker id="su-acc" labelText={s.defaultAccount} value={v.defaultAccount ?? null} invalid={bad === "defaultAccount"} onChange={(a) => setV({ ...v, defaultAccount: a?.number })} /></div>
        <div><label htmlFor="su-tr" className={label}>{s.treatment}</label>
          <select id="su-tr" className={input} value={v.treatment} onChange={(e) => setV({ ...v, treatment: e.target.value as Treatment })}>
            {Object.values(Treatment).map((x) => <option key={x} value={x}>{t.purchases.treatment[x]}</option>)}
          </select></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> {s.active}</label>
      </div>
      {error && <p role="alert" className="mt-3 text-[var(--error)]">{error}</p>}
    </Dialog>
  );
}
