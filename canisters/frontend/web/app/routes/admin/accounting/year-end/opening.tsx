// Bokslut › Ingående balanser: the opening balance per balance-sheet account. Written by the
// carry-over from last year's year-end, or entered here for the first year in the system,
// by hand or read from a SIE4 file from the previous program (A9c).
import { useEffect, useState } from "react";
import type { OpeningLine, Status } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { AccountPicker } from "../../../../admin/accounting/ui/AccountPicker";
import { SectionTabs, yearEndTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, Money, MoneyInput, PageHead } from "../../../../admin/accounting/ui/kit";
import { openingFromSie, parseSie } from "../../../../admin/accounting/sie4";
import { previousYear } from "../../../../admin/accounting/yearend";
import { IconTrash } from "../../../../components/Icons";

type Row = { account: bigint | null; amount: bigint | null };

export default function YearEndOpening() {
  const t = useAccT();
  const y = t.yearEnd;
  const o = y.opening;
  const err = useErr();
  const ctx = useAcc();
  const { acc, year, data, canBook, accountName, reload } = ctx;
  const [lines, setLines] = useState<OpeningLine[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [transferred, setTransferred] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: y.title, to: "/admin/accounting/year-end" }, { label: y.tabs.opening }]);

  useEffect(() => {
    if (!year || !data) return;
    let live = true;
    const prev = previousYear(data.years, year);
    Promise.all([acc.openingBalances(year.id).then(ok), prev ? acc.yearEndStatus(prev.id).then(ok) : Promise.resolve<Status | null>(null)]).then(([ls, ps]) => {
      if (!live) return;
      setLines(ls);
      setRows(ls.map((l) => ({ account: l.account, amount: l.amount })));
      setTransferred(ps?.closing.transferredTo === year.id);
    }).catch((e) => live && setMsg({ ok: false, text: err(e) }));
    return () => { live = false; };
  }, [acc, year, data, err]);

  if (!year) return null;
  const locked = year.status === "locked";
  const editable = canBook && !locked && !transferred;
  const sum = rows.reduce((s, r) => s + (r.amount ?? 0n), 0n);
  const set = (i: number, r: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...r } : x)));

  async function importSie(f: File) {
    try {
      const sie = parseSie(new Uint8Array(await f.arrayBuffer()));
      const got = openingFromSie(sie, year!.start);
      if (!got || got.lines.size === 0) { setMsg({ ok: false, text: o.importNone }); return; }
      // Accounts the chart lacks are added with the file's names (SIE #KONTO 5).
      const known = new Set((data?.accounts ?? []).map((a) => Number(a.number)));
      const added: number[] = [];
      for (const n of got.lines.keys()) {
        if (known.has(n)) continue;
        ok(await acc.addAccount(BigInt(n), got.names.get(n) || `Konto ${n}`, null, null));
        added.push(n);
      }
      if (added.length) await reload();
      setRows([...got.lines].sort((a, b) => a[0] - b[0]).map(([n, v]) => ({ account: BigInt(n), amount: v })));
      setMsg({ ok: true, text: `${o.imported(got.lines.size, sie.company || f.name)}${added.length ? ` ${o.importAdded(added.join(", "))}` : ""}` });
    } catch (e) { setMsg({ ok: false, text: err(e) }); }
  }

  async function save() {
    try {
      const clean = rows.filter((r) => r.account !== null && r.amount !== null && r.amount !== 0n).map((r) => ({ account: r.account!, amount: r.amount! }));
      const saved = ok(await acc.setOpeningBalances(year!.id, clean));
      setLines(saved);
      setMsg({ ok: true, text: o.saved });
      await reload();
    } catch (e) { setMsg({ ok: false, text: err(e) }); }
  }

  return (
    <>
      <PageHead title={y.title}><SectionTabs {...yearEndTabs(y)} /></PageHead>
      <p className="mb-4 text-sm text-muted">{o.intro}</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mb-4 ${msg.ok ? "text-accent" : "text-[var(--error)]"}`}>{msg.text}</p>}
      {transferred && <p role="note" className="mb-4 text-sm">{o.transferred}</p>}
      {locked && <p role="note" className="mb-4 text-sm">{o.locked}</p>}
      {!lines ? <p role="status">{t.common.loading}</p> : !editable ? (
        lines.length === 0 ? <EmptyState text={o.empty} /> : (
          <table className="card w-full max-w-2xl text-sm">
            <caption className="sr-only">{y.tabs.opening}</caption>
            <thead><tr className="text-muted"><th scope="col" className="py-1 text-left">{t.common.account}</th><th scope="col" className="py-1 text-right">{t.common.amount}</th></tr></thead>
            <tbody>{lines.map((l) => <tr key={String(l.account)} className="border-t border-border"><td className="py-1">{String(l.account)} {accountName(l.account)}</td><td className="py-1 text-right"><Money ore={l.amount} /></td></tr>)}</tbody>
          </table>
        )
      ) : (
        <form className="card max-w-3xl space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="space-y-1">
            <label className="block text-sm font-medium">{o.importSie}
              <input type="file" accept=".se,.si,.sie,text/plain" className="mt-1 block text-sm" aria-describedby="sie-hint" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSie(f); e.target.value = ""; }} />
            </label>
            <p id="sie-hint" className="text-sm text-muted">{o.importHint}</p>
          </div>
          {rows.length === 0 && <p className="text-muted">{o.empty}</p>}
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_10rem_auto] items-center gap-2">
              <AccountPicker value={r.account} labelText={`${t.common.account} ${i + 1}`} onChange={(a) => set(i, { account: a ? a.number : null })} />
              <MoneyInput value={r.amount} labelText={`${t.common.amount} ${i + 1}`} allowNegative onChange={(v) => set(i, { amount: v })} />
              <button type="button" className="btn btn-secondary px-2 py-1" aria-label={`${o.remove} ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
          ))}
          <p className={`text-sm ${sum === 0n ? "text-muted" : "text-[var(--error)]"}`}>{o.sum}: <Money ore={sum} /></p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => setRows([...rows, { account: null, amount: null }])}>{o.add}</button>
            <button type="submit" className="btn btn-primary" disabled={sum !== 0n}>{o.save}</button>
          </div>
        </form>
      )}
    </>
  );
}
