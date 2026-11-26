// ROT/RUT › Inställningar: the dated rates and caps (V12), changed only by the owner.
import { useEffect, useState } from "react";
import { Role, type HusParams } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { formatPct, parsePct } from "../../../../admin/accounting/sales";
import { SectionTabs, rotRutTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { MoneyInput, PageHead, input } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

type Row = { from: string; rot: string; rut: string; rotCap: bigint | null; totalCap: bigint | null; xml11From: string; source: string };
const toRow = (p: HusParams): Row => ({ from: p.from, rot: formatPct(p.rotBp), rut: formatPct(p.rutBp), rotCap: p.rotCap, totalCap: p.totalCap, xml11From: p.xml11From, source: p.source });

export default function HusSettings() {
  const t = useAccT();
  const r = t.rotRut;
  const x = r.settings;
  const err = useErr();
  const { acc, role } = useAcc();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: r.title, to: "/admin/accounting/rot-rut" }, { label: r.tabs.settings }]);
  useEffect(() => { acc.getHusParams().then((p) => setRows(ok(p).map(toRow))).catch((e) => setStatus({ ok: false, text: err(e) })); }, [acc, err]);
  const owner = role === Role.owner;
  const set = (i: number, p: Partial<Row>) => setRows(rows!.map((y, j) => (j === i ? { ...y, ...p } : y)));

  async function save() {
    if (!rows) return;
    try {
      const ps: HusParams[] = rows.map((y) => ({
        from: y.from, rotBp: parsePct(y.rot) ?? 0n, rutBp: parsePct(y.rut) ?? 0n, rotCap: y.rotCap ?? 0n, totalCap: y.totalCap ?? 0n, xml11From: y.xml11From, source: y.source.trim(),
      }));
      setRows(ok(await acc.setHusParams(ps)).map(toRow));
      setStatus({ ok: true, text: x.saved });
    } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }

  const cell = "rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5";
  return (
    <>
      <PageHead title={r.title}><SectionTabs {...rotRutTabs(r)} /></PageHead>
      <p className="mb-4 text-sm text-muted">{x.intro}</p>
      {!owner && <p className="mb-4 text-sm">{x.ownerOnly}</p>}
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <form className="card space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {rows.map((y, i) => (
            <fieldset key={i} disabled={!owner} className="grid gap-3 sm:grid-cols-3">
              <legend className="font-medium">{x.from} {y.from}</legend>
              <label className="text-sm">{x.from}<input type="date" className={input} value={y.from} onChange={(e) => set(i, { from: e.target.value })} /></label>
              <label className="text-sm">{x.rot}<input inputMode="decimal" className={input} value={y.rot} onChange={(e) => set(i, { rot: e.target.value })} /></label>
              <label className="text-sm">{x.rut}<input inputMode="decimal" className={input} value={y.rut} onChange={(e) => set(i, { rut: e.target.value })} /></label>
              <div className="text-sm">{x.rotCap}<MoneyInput className={cell} labelText={x.rotCap} value={y.rotCap} onChange={(v) => set(i, { rotCap: v })} /></div>
              <div className="text-sm">{x.totalCap}<MoneyInput className={cell} labelText={x.totalCap} value={y.totalCap} onChange={(v) => set(i, { totalCap: v })} /></div>
              <label className="text-sm">{x.xml11}<input type="date" className={input} value={y.xml11From} onChange={(e) => set(i, { xml11From: e.target.value })} /></label>
              <label className="text-sm sm:col-span-3">{x.source}<input className={input} maxLength={500} value={y.source} onChange={(e) => set(i, { source: e.target.value })} /></label>
            </fieldset>
          ))}
          {owner && <button type="submit" className="btn btn-primary">{x.save}</button>}
        </form>
      )}
      <Toast status={status} />
    </>
  );
}
