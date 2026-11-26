// Tillgångar & lager › Inventering: printable count sheet, entered counts valued by FIFO and
// the lowest-value principle (optionally 97 %), and the stock change voucher (V26).
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Count, CountInput, StockItem, StockLevel } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { meta } from "../../../../admin/accounting/ledger";
import { formatOre } from "../../../../admin/accounting/money";
import { parseQty } from "../../../../admin/accounting/sales";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { SectionTabs, assetTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, Money, MoneyInput, PageHead, input, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";
import { signedQty } from "./inventory";

/** Last day of the previous month: the usual count date. */
function lastMonthEnd(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 0)).toISOString().slice(0, 10);
}

export default function Counts() {
  const t = useAccT();
  const x = t.assets;
  const c = x.count;
  const err = useErr();
  const ctx = useAcc();
  const { acc, canBook, data } = ctx;
  const on = !!data?.settings.modules.inventory;
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [counts, setCounts] = useState<Count[]>([]);
  const [date, setDate] = useState(lastMonthEnd());
  const [qty, setQty] = useState<Record<string, string>>({});
  const [nrv, setNrv] = useState<Record<string, bigint | null>>({});
  const [rule97, setRule97] = useState(false);
  const [preview, setPreview] = useState<Count | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: x.title, to: "/admin/accounting/assets" }, { label: x.tabs.counts }]);

  const load = useCallback(async () => {
    const [a, b, d] = await Promise.all([acc.listStockItems(), acc.stockLevels(date), acc.listStockCounts()]);
    setItems(ok(a));
    setLevels(ok(b));
    setCounts(ok(d));
  }, [acc, date]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);

  const level = useMemo(() => new Map(levels.map((l) => [l.stockItemId, l])), [levels]);
  const rows = (items ?? []).filter((i) => i.active || (level.get(i.id)?.qty ?? 0n) !== 0n);

  function countInput(): CountInput {
    return {
      date, rule97, account: 1460n, changeAccount: 4960n,
      rows: rows.map((i) => ({ stockItemId: i.id, qty: parseQty(qty[String(i.id)] ?? "") ?? 0n, nrvUnit: nrv[String(i.id)] ?? undefined })),
    };
  }

  async function check() {
    try { setPreview(ok(await acc.previewStockCount(countInput()))); } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }

  async function post() {
    setBusy(true);
    try {
      ok(await acc.postStockCount(countInput()));
      setPreview(null);
      setQty({});
      setStatus({ ok: true, text: c.done });
      await load();
    } catch (e) { setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  const sheetJob = async () => ({
    template: "summary@1" as const, meta: meta(ctx, "Inventeringslista", date, [`Inventeringsdag ${date}`]),
    facts: [["Räknat av", ""], ["Kontrollerat av", ""]] as [string, string][],
    table: { cols: ["Artikelnr", "Benämning", "Enhet", "Enligt rörelser", "Räknat antal"], rows: rows.map((i) => [i.sku, i.name, i.unit, signedQty(level.get(i.id)?.qty ?? 0n), ""]) },
  });

  if (!on) return (
    <>
      <PageHead title={x.title}><SectionTabs {...assetTabs(x, false)} /></PageHead>
      <p role="status">{x.stock.disabled}</p>
    </>
  );

  return (
    <>
      <PageHead title={x.title}><SectionTabs {...assetTabs(x, true)} /></PageHead>
      <p className="mb-4 text-sm text-muted">{c.intro}</p>
      {!items ? <p role="status">{t.common.loading}</p> : (
        <form className="card mb-6 space-y-4" onSubmit={(e) => { e.preventDefault(); void check(); }}>
          <div className="flex flex-wrap items-end gap-3">
            <div><label htmlFor="c-date" className={label}>{c.date}</label>
              <input id="c-date" type="date" className={input} required value={date} onChange={(e) => { setDate(e.target.value); setPreview(null); }} /></div>
            <PdfActions job={sheetJob} fileName={`inventeringslista-${date}.pdf`} label={`${c.sheet} (PDF)`} preview={false} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{c.sheet}</caption>
              <thead><tr>
                <th scope="col" className="text-left">{x.stock.sku}</th><th scope="col" className="text-left">{t.common.name}</th>
                <th scope="col" className="text-right">{c.book}</th><th scope="col">{c.counted}</th><th scope="col">{c.nrv}</th>
              </tr></thead>
              <tbody>
                {rows.map((i) => {
                  const k = String(i.id);
                  return (
                    <tr key={k}>
                      <td>{i.sku}</td><td>{i.name}</td><td className="text-right tabular-nums">{signedQty(level.get(i.id)?.qty ?? 0n)} {i.unit}</td>
                      <td><input aria-label={`${c.counted}, ${i.sku}`} inputMode="decimal" className={input} value={qty[k] ?? ""} onChange={(e) => { setQty({ ...qty, [k]: e.target.value }); setPreview(null); }} /></td>
                      <td><MoneyInput labelText={`${c.nrv}, ${i.sku}`} className={input} value={nrv[k] ?? null} onChange={(v) => { setNrv({ ...nrv, [k]: v }); setPreview(null); }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={rule97} onChange={(e) => { setRule97(e.target.checked); setPreview(null); }} />{c.rule97}</label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-secondary">{c.check}</button>
            {preview && canBook && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void post()}>{c.post}</button>}
          </div>
          {preview && (
            <dl className="grid gap-2 text-sm sm:grid-cols-4" role="status">
              <div><dt className="text-muted">{c.cost}</dt><dd><Money ore={preview.cost} /></dd></div>
              <div><dt className="text-muted">{c.value}</dt><dd><Money ore={preview.value} /></dd></div>
              <div><dt className="text-muted">{c.before}</dt><dd><Money ore={preview.bookBefore} /></dd></div>
              <div><dt className="text-muted">{c.change}</dt><dd><Money ore={preview.value - preview.bookBefore} /></dd></div>
            </dl>
          )}
        </form>
      )}
      <h2 className="mb-2 text-xl">{c.history}</h2>
      <DataTable rows={counts} rowKey={(k) => String(k.id)} caption={c.history} csvName="inventeringar" empty={<EmptyState text={c.empty} />}
        columns={[
          { key: "d", title: t.common.date, render: (k) => k.date, value: (k) => k.date },
          { key: "c", title: c.cost, align: "right", render: (k) => <Money ore={k.cost} />, value: (k) => k.cost },
          { key: "v", title: c.value, align: "right", render: (k) => <Money ore={k.value} />, value: (k) => k.value },
          { key: "x", title: c.change, align: "right", render: (k) => formatOre(k.value - k.bookBefore), value: (k) => k.value - k.bookBefore },
        ]} />
      <Toast status={status} />
    </>
  );
}
