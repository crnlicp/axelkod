// VIES check for a VAT number (V5): the last stored answer and a button to check again.
// The answer is only valid for the day it was given.
import { useEffect, useState } from "react";
import type { VatCheck } from "../../../bindings/accounting";
import { ok } from "../api";
import { useAcc, useAccT, useErr } from "../context";
import { useAdminLang } from "../../i18n";
import { StatusChip, fmtTime } from "./kit";

export function ViesCheck({ vatNr }: { vatNr: string }) {
  const v = useAccT().vat.vies;
  const err = useErr();
  const { acc, canBook } = useAcc();
  const { t: at } = useAdminLang();
  const [check, setCheck] = useState<VatCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nr = vatNr.trim();
  useEffect(() => {
    setCheck(null);
    setError(null);
    if (nr.length < 4) return;
    const id = setTimeout(() => { acc.getVatCheck(nr).then((r) => setCheck(ok(r) ?? null)).catch(() => {}); }, 300);
    return () => clearTimeout(id);
  }, [acc, nr]);
  async function run() {
    setBusy(true);
    setError(null);
    try { setCheck(ok(await acc.checkVatNumber(nr))); } catch (e) { setError(err(e)); } finally { setBusy(false); }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
      {canBook && <button type="button" className="btn btn-secondary px-3 py-1 text-sm" disabled={busy || nr.length < 4} title={v.hint} onClick={() => void run()}>{v.check}</button>}
      {check && <StatusChip tone={check.valid ? "good" : "bad"}>{check.valid ? v.valid : v.invalid}</StatusChip>}
      {check && <span className="text-muted">{v.checked(fmtTime(check.checkedAt, at.locale))}{check.name ? ` · ${check.name}` : ""}</span>}
      {error && <span role="alert" className="text-[var(--error)]">{error}</span>}
    </div>
  );
}
