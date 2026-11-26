// Tillgångar & lager › Lager: stock items, moves and the quantity and FIFO value on hand
// (V26: IL 17:3). Periodic method: the ledger changes only at a stocktaking.
import { useCallback, useEffect, useMemo, useState } from "react";
import { MoveKind, type Item, type StockItem, type StockItemInput, type StockLevel, type StockMove } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { meta } from "../../../../admin/accounting/ledger";
import { formatOre } from "../../../../admin/accounting/money";
import { formatQty, parseQty } from "../../../../admin/accounting/sales";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { SectionTabs, assetTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, Money, MoneyInput, PageHead, input, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

const today = () => new Date().toISOString().slice(0, 10);
export const signedQty = (q: bigint) => (q < 0n ? `−${formatQty(-q)}` : formatQty(q));
const outgoing = (k: MoveKind) => k === MoveKind.sale;

export default function Inventory() {
  const t = useAccT();
  const x = t.assets;
  const s = x.stock;
  const err = useErr();
  const ctx = useAcc();
  const { acc, canBook, data } = ctx;
  const on = !!data?.settings.modules.inventory;
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [sales, setSales] = useState<Item[]>([]);
  const [item, setItem] = useState<{ id: bigint | null; v: StockItemInput } | null>(null);
  const [mv, setMv] = useState<{ stockItemId: string; date: string; kind: MoveKind; qty: string; unitCost: bigint | null; note: string } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: x.title, to: "/admin/accounting/assets" }, { label: x.tabs.stock }]);

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([acc.listStockItems(), acc.listStockMoves(), acc.stockLevels(today()), acc.listItems()]);
    setItems(ok(a));
    setMoves(ok(b));
    setLevels(ok(c));
    setSales(ok(d).filter((i) => i.kind === "goods"));
  }, [acc]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);

  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const level = useMemo(() => new Map(levels.map((l) => [l.stockItemId, l])), [levels]);
  const fail = (e: unknown) => setStatus({ ok: false, text: err(e) });

  async function saveItem() {
    if (!item) return;
    try { ok(await acc.saveStockItem(item.id, item.v)); setItem(null); setStatus({ ok: true, text: s.saved }); await load(); } catch (e) { fail(e); }
  }

  async function addMove() {
    if (!mv) return;
    const q = parseQty(mv.qty);
    if (q === null || q === 0n) return fail(new Error(t.errors.invalid(s.qty)));
    const signed = outgoing(mv.kind) ? -q : q;
    try {
      ok(await acc.addStockMove({ stockItemId: BigInt(mv.stockItemId), date: mv.date, kind: mv.kind, qty: signed, unitCost: mv.unitCost ?? 0n, note: mv.note.trim() || undefined }));
      setMv(null);
      setStatus({ ok: true, text: s.saved });
      await load();
    } catch (e) { fail(e); }
  }

  async function removeMove(id: bigint) {
    try { ok(await acc.deleteStockMove(id)); await load(); } catch (e) { fail(e); }
  }

  const listJob = async () => ({
    template: "summary@1" as const, meta: meta(ctx, "Lagerlista", today(), [`Per ${today()}`, "Värderat enligt först in, först ut (IL 17:3)"]),
    facts: [["Antal artiklar", String(items?.length ?? 0)], ["Värde", `${formatOre(levels.reduce((a, l) => a + l.value, 0n))} kr`]] as [string, string][],
    table: {
      cols: ["Artikelnr", "Benämning", "Enhet", "I lager", "Värde"],
      rows: (items ?? []).map((i) => [i.sku, i.name, i.unit, signedQty(level.get(i.id)?.qty ?? 0n), formatOre(level.get(i.id)?.value ?? 0n)]),
    },
  });

  if (!on) return (
    <>
      <PageHead title={x.title}><SectionTabs {...assetTabs(x, false)} /></PageHead>
      <p role="status">{s.disabled}</p>
    </>
  );

  return (
    <>
      <PageHead title={x.title} actions={canBook && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setItem({ id: null, v: { sku: "", name: "", unit: "st", active: true } })}>{s.addItem}</button>
          {(items?.length ?? 0) > 0 && <button type="button" className="btn btn-primary" onClick={() => setMv({ stockItemId: String(items![0].id), date: today(), kind: MoveKind.purchase, qty: "", unitCost: null, note: "" })}>{s.addMove}</button>}
        </div>
      )}>
        <SectionTabs {...assetTabs(x, true)} />
      </PageHead>
      <p className="mb-4 text-sm text-muted">{s.intro}</p>

      {!items ? <p role="status">{t.common.loading}</p> : (
        <>
          <h2 className="mb-2 text-xl">{s.items}</h2>
          <div className="mb-3 flex flex-wrap gap-2"><PdfActions job={listJob} fileName={`lagerlista-${today()}.pdf`} label={`${s.list} (PDF)`} /></div>
          <DataTable rows={items} rowKey={(i) => String(i.id)} caption={s.items} csvName="lager" empty={<EmptyState text={s.emptyItems} />}
            onOpen={canBook ? (i) => setItem({ id: i.id, v: { sku: i.sku, name: i.name, unit: i.unit, salesItemId: i.salesItemId, active: i.active } }) : undefined}
            columns={[
              { key: "s", title: s.sku, render: (i) => i.sku, value: (i) => i.sku },
              { key: "n", title: t.common.name, render: (i) => i.name, value: (i) => i.name },
              { key: "u", title: s.unit, secondary: true, render: (i) => i.unit, value: (i) => i.unit },
              { key: "q", title: s.onHand, align: "right", render: (i) => signedQty(level.get(i.id)?.qty ?? 0n), value: (i) => level.get(i.id)?.qty ?? 0n },
              { key: "v", title: s.value, align: "right", render: (i) => <Money ore={level.get(i.id)?.value ?? 0n} />, value: (i) => level.get(i.id)?.value ?? 0n },
            ]} />

          <h2 className="mb-2 mt-8 text-xl">{s.moves}</h2>
          <p className="mb-2 text-sm text-muted">{s.lockedHint}</p>
          <DataTable rows={moves} rowKey={(m) => String(m.id)} caption={s.moves} csvName="lagerrorelser" empty={<EmptyState text={s.emptyMoves} />}
            columns={[
              { key: "d", title: t.common.date, render: (m) => m.date, value: (m) => m.date },
              { key: "i", title: s.sku, render: (m) => byId.get(m.stockItemId)?.sku ?? "", value: (m) => byId.get(m.stockItemId)?.sku ?? "" },
              { key: "k", title: s.kind, render: (m) => s.kinds[m.kind] ?? m.kind, value: (m) => m.kind },
              { key: "q", title: s.qty, align: "right", render: (m) => signedQty(m.qty), value: (m) => m.qty },
              { key: "c", title: s.unitCost, align: "right", secondary: true, render: (m) => (m.qty > 0n ? <Money ore={m.unitCost} /> : ""), value: (m) => m.unitCost },
              { key: "x", title: t.common.remove, secondary: true, render: (m) => (canBook && m.kind !== MoveKind.count
                ? <button type="button" className="btn btn-secondary px-2 py-1 text-sm" onClick={(e) => { e.stopPropagation(); void removeMove(m.id); }}>{t.common.remove}<span className="sr-only"> {m.date} {byId.get(m.stockItemId)?.sku}</span></button> : ""), value: () => "" },
            ]} />
        </>
      )}

      <Dialog open={!!item} onClose={() => setItem(null)} title={s.addItem}
        footer={<button type="submit" form="si-form" className="btn btn-primary">{t.common.save}</button>}>
        {item && (
          <form id="si-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void saveItem(); }}>
            <div><label htmlFor="si-sku" className={label}>{s.sku}</label><input id="si-sku" className={input} required maxLength={50} value={item.v.sku} onChange={(e) => setItem({ ...item, v: { ...item.v, sku: e.target.value } })} /></div>
            <div><label htmlFor="si-unit" className={label}>{s.unit}</label><input id="si-unit" className={input} required maxLength={20} value={item.v.unit} onChange={(e) => setItem({ ...item, v: { ...item.v, unit: e.target.value } })} /></div>
            <div className="sm:col-span-2"><label htmlFor="si-name" className={label}>{t.common.name}</label><input id="si-name" className={input} required maxLength={200} value={item.v.name} onChange={(e) => setItem({ ...item, v: { ...item.v, name: e.target.value } })} /></div>
            <div className="sm:col-span-2"><label htmlFor="si-sales" className={label}>{s.salesItem}</label>
              <select id="si-sales" className={input} value={item.v.salesItemId === undefined ? "" : String(item.v.salesItemId)}
                onChange={(e) => setItem({ ...item, v: { ...item.v, salesItemId: e.target.value ? BigInt(e.target.value) : undefined } })}>
                <option value="">{s.noSalesItem}</option>
                {sales.map((i) => <option key={String(i.id)} value={String(i.id)}>{i.sku} {i.name}</option>)}
              </select></div>
          </form>
        )}
      </Dialog>

      <Dialog open={!!mv} onClose={() => setMv(null)} title={s.addMove}
        footer={<button type="submit" form="mv-form" className="btn btn-primary">{t.common.save}</button>}>
        {mv && (
          <form id="mv-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void addMove(); }}>
            <div className="sm:col-span-2"><label htmlFor="mv-item" className={label}>{s.items}</label>
              <select id="mv-item" className={input} value={mv.stockItemId} onChange={(e) => setMv({ ...mv, stockItemId: e.target.value })}>
                {(items ?? []).filter((i) => i.active).map((i) => <option key={String(i.id)} value={String(i.id)}>{i.sku} {i.name}</option>)}
              </select></div>
            <div><label htmlFor="mv-kind" className={label}>{s.kind}</label>
              <select id="mv-kind" className={input} value={mv.kind} onChange={(e) => setMv({ ...mv, kind: e.target.value as MoveKind })}>
                {[MoveKind.purchase, MoveKind.sale, MoveKind.returned, MoveKind.adjust].map((k) => <option key={k} value={k}>{s.kinds[k]}</option>)}
              </select></div>
            <div><label htmlFor="mv-date" className={label}>{t.common.date}</label><input id="mv-date" type="date" className={input} required value={mv.date} onChange={(e) => setMv({ ...mv, date: e.target.value })} /></div>
            <div><label htmlFor="mv-qty" className={label}>{s.qty}</label><input id="mv-qty" inputMode="decimal" className={input} required value={mv.qty} onChange={(e) => setMv({ ...mv, qty: e.target.value })} /></div>
            {!outgoing(mv.kind) && <div><label htmlFor="mv-cost" className={label}>{s.unitCost}</label><MoneyInput id="mv-cost" className={input} labelText={s.unitCost} value={mv.unitCost} onChange={(v) => setMv({ ...mv, unitCost: v })} /></div>}
            <div className="sm:col-span-2"><label htmlFor="mv-note" className={label}>{x.register.note}</label><input id="mv-note" className={input} maxLength={200} value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} /></div>
          </form>
        )}
      </Dialog>
      <Toast status={status} />
    </>
  );
}
