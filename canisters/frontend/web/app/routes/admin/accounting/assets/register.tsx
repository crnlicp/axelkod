// Tillgångar & lager › Tillgångar: the asset register, "Kör avskrivningar för period",
// disposal, and the register and schedule as PDF (V25: K2 10.5, 10.23–10.27, 7.13–7.14).
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AssetInput, AssetView, DepRun } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { assetState, schedule } from "../../../../admin/accounting/assets";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { meta } from "../../../../admin/accounting/ledger";
import { formatOre } from "../../../../admin/accounting/money";
import { AccountPicker } from "../../../../admin/accounting/ui/AccountPicker";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { SectionTabs, assetTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, Money, MoneyInput, PageHead, StatusChip, input, label, voucherRef } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

const today = () => new Date().toISOString().slice(0, 10);
const blank = (): AssetInput => ({
  name: "", accounts: { cost: 1220n, accumulated: 1229n, expense: 7832n }, acquired: today(), inUse: today(),
  cost: 0n, residual: 0n, lifeMonths: 60n, openingDepreciation: 0n,
});
const toInput = (a: AssetView): AssetInput => ({
  name: a.name, tag: a.tag, accounts: a.accounts, acquired: a.acquired, inUse: a.inUse, cost: a.cost, residual: a.residual,
  lifeMonths: a.lifeMonths, openingDepreciation: a.openingDepreciation, purchaseId: a.purchaseId, note: a.note,
});

export default function AssetRegister() {
  const t = useAccT();
  const x = t.assets;
  const g = x.register;
  const err = useErr();
  const ctx = useAcc();
  const { acc, canBook, data, year } = ctx;
  const [rows, setRows] = useState<AssetView[] | null>(null);
  const [runs, setRuns] = useState<DepRun[]>([]);
  const [limit, setLimit] = useState<{ year: bigint; limit: bigint } | null>(null);
  const [edit, setEdit] = useState<{ id: bigint | null; v: AssetInput } | null>(null);
  const [open, setOpen] = useState<AssetView | null>(null);
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [due, setDue] = useState<{ assetId: bigint; amount: bigint }[] | null>(null);
  const [disp, setDisp] = useState<{ date: string; proceeds: bigint | null; how: "invoiced" | "cash" | "scrap"; account: bigint | null }>({ date: today(), proceeds: null, how: "scrap", account: 1930n });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: x.title, to: "/admin/accounting/assets" }, { label: x.tabs.register }]);

  const load = useCallback(async () => {
    const [a, r, l] = await Promise.all([acc.listAssets(), acc.listDepRuns(), acc.smallAssetLimit()]);
    setRows(ok(a));
    setRuns(ok(r));
    setLimit(ok(l));
  }, [acc]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);

  const byId = useMemo(() => new Map((rows ?? []).map((a) => [a.id, a])), [rows]);
  const startMonth = Number(year?.start.slice(5, 7) ?? 1);
  const fail = (e: unknown) => setStatus({ ok: false, text: err(e) });
  const refOf = async (id: bigint) => { const v = ok(await acc.getVoucher(id)); return voucherRef(v.series, v.number); };

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      ok(await acc.saveAsset(edit.id, edit.v));
      setEdit(null);
      setStatus({ ok: true, text: g.saved });
      await load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function remove(id: bigint) {
    try { ok(await acc.deleteAsset(id)); setOpen(null); setStatus({ ok: true, text: g.deleted }); await load(); } catch (e) { fail(e); }
  }

  async function run() {
    setBusy(true);
    try {
      const r = ok(await acc.runDepreciation(period));
      setDue(null);
      setStatus({ ok: true, text: x.run.done(await refOf(r.voucherId)) });
      await load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function dispose(a: AssetView) {
    setBusy(true);
    try {
      ok(await acc.disposeAsset(a.id, {
        date: disp.date, proceeds: disp.how === "scrap" ? 0n : disp.proceeds ?? 0n,
        proceedsAccount: disp.how === "cash" ? disp.account ?? undefined : undefined,
      }));
      setOpen(null);
      setStatus({ ok: true, text: x.dispose.done });
      await load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  const stateText = (a: AssetView) => {
    const s = assetState(a);
    return s === "disposed" ? g.disposedOn(a.disposal!.date) : s === "done" ? g.done : g.active;
  };

  const registerJob = async () => ({
    template: "summary@1" as const, meta: meta(ctx, "Anläggningsregister", today(), [`Per ${today()}`]),
    facts: [["Antal tillgångar", String(rows?.length ?? 0)], ["Bokfört värde", `${formatOre((rows ?? []).filter((a) => !a.disposal).reduce((s, a) => s + a.bookValue, 0n))} kr`]] as [string, string][],
    table: {
      cols: ["Benämning", "Inv.nr", "Konto", "I bruk", "Anskaffning", "Avskrivet", "Bokfört värde", "Status"],
      rows: (rows ?? []).map((a) => [a.name, a.tag ?? "", String(a.accounts.cost), a.inUse, formatOre(a.cost), formatOre(a.depreciated), a.disposal ? "0,00" : formatOre(a.bookValue), stateText(a)]),
    },
  });

  const scheduleJob = (a: AssetView) => async () => ({
    template: "summary@1" as const, meta: meta(ctx, "Avskrivningsplan", a.tag ?? a.name, [a.name]),
    facts: [["Anskaffad", a.acquired], ["Tagen i bruk", a.inUse], ["Anskaffningsvärde", `${formatOre(a.cost)} kr`], ["Restvärde", `${formatOre(a.residual)} kr`],
      ["Nyttjandeperiod", `${a.lifeMonths} månader`], ["Konton", `${a.accounts.cost} / ${a.accounts.accumulated} / ${a.accounts.expense}`]] as [string, string][],
    table: { cols: ["Räkenskapsår", "Avskrivning", "Utgående värde"], rows: schedule(a, startMonth).map((r) => [`${r.from} – ${r.to}`, formatOre(r.amount), formatOre(r.closing)]) },
  });

  const e = edit?.v;
  const set = (p: Partial<AssetInput>) => edit && setEdit({ ...edit, v: { ...edit.v, ...p } });
  const five = e?.lifeMonths === 60n && e.residual === 0n;

  return (
    <>
      <PageHead title={x.title} actions={canBook && <button type="button" className="btn btn-primary" onClick={() => setEdit({ id: null, v: blank() })}>{g.add}</button>}>
        <SectionTabs {...assetTabs(x, !!data?.settings.modules.inventory)} />
      </PageHead>
      <p className="mb-4 text-sm text-muted">{g.intro}</p>

      {canBook && (
        <section className="card mb-6 space-y-3" aria-labelledby="dep-run">
          <h2 id="dep-run" className="text-xl">{x.run.title}</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="dep-period" className={label}>{x.run.period}</label>
              <input id="dep-period" type="month" className={input} value={period} onChange={(ev) => { setPeriod(ev.target.value); setDue(null); }} />
            </div>
            <button type="button" className="btn btn-secondary" onClick={async () => { try { setDue(ok(await acc.previewDepreciation(period))); } catch (ex) { fail(ex); } }}>{x.run.preview}</button>
            {due && due.length > 0 && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}>{x.run.run}</button>}
          </div>
          <p className="text-sm text-muted">{x.run.catchUp}</p>
          {due && (due.length === 0 ? <p role="status">{x.run.none}</p> : (
            <table className="w-full text-sm">
              <caption className="sr-only">{x.run.title}</caption>
              <thead><tr><th scope="col" className="text-left">{g.name}</th><th scope="col" className="text-right">{t.common.amount}</th></tr></thead>
              <tbody>
                {due.map((d) => <tr key={String(d.assetId)}><td>{byId.get(d.assetId)?.name}</td><td className="text-right tabular-nums"><Money ore={d.amount} /></td></tr>)}
                <tr className="font-semibold"><td>{x.run.total}</td><td className="text-right tabular-nums"><Money ore={due.reduce((s, d) => s + d.amount, 0n)} /></td></tr>
              </tbody>
            </table>
          ))}
          {runs.length > 0 && <p className="text-sm text-muted">{x.run.history}: {runs.slice(0, 12).map((r) => r.period).join(", ")}</p>}
        </section>
      )}

      {!rows ? <p role="status">{t.common.loading}</p> : (
        <>
          <div className="mb-3 flex flex-wrap gap-2"><PdfActions job={registerJob} fileName={`anlaggningsregister-${today()}.pdf`} /></div>
          <DataTable rows={rows} rowKey={(a) => String(a.id)} caption={x.tabs.register} csvName="anlaggningsregister" empty={<EmptyState text={g.empty} />}
            onOpen={(a) => { setOpen(a); setDisp({ date: today(), proceeds: null, how: "scrap", account: 1930n }); }}
            columns={[
              { key: "n", title: g.name, render: (a) => a.name, value: (a) => a.name },
              { key: "t", title: g.tag, secondary: true, render: (a) => a.tag ?? "", value: (a) => a.tag ?? "" },
              { key: "u", title: g.inUse, render: (a) => a.inUse, value: (a) => a.inUse },
              { key: "c", title: g.cost, align: "right", render: (a) => <Money ore={a.cost} />, value: (a) => a.cost },
              { key: "d", title: g.depreciated, align: "right", secondary: true, render: (a) => <Money ore={a.depreciated} />, value: (a) => a.depreciated },
              { key: "b", title: g.bookValue, align: "right", render: (a) => <Money ore={a.disposal ? 0n : a.bookValue} />, value: (a) => (a.disposal ? 0n : a.bookValue) },
              { key: "s", title: g.status, render: (a) => <StatusChip tone={a.disposal ? "neutral" : assetState(a) === "done" ? "good" : "info"}>{stateText(a)}</StatusChip>, value: (a) => stateText(a) },
            ]} />
        </>
      )}

      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id === null ? g.add : g.edit} wide
        footer={<button type="submit" form="asset-form" className="btn btn-primary" disabled={busy}>{t.common.save}</button>}>
        {e && (
          <form id="asset-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); void save(); }}>
            <div className="sm:col-span-2"><label htmlFor="a-name" className={label}>{g.name}</label><input id="a-name" className={input} required maxLength={200} value={e.name} onChange={(ev) => set({ name: ev.target.value })} /></div>
            <div><label htmlFor="a-tag" className={label}>{g.tag}</label><input id="a-tag" className={input} maxLength={50} value={e.tag ?? ""} onChange={(ev) => set({ tag: ev.target.value || undefined })} /></div>
            <div><label htmlFor="a-cost" className={label}>{g.cost}</label><MoneyInput id="a-cost" className={input} labelText={g.cost} value={e.cost || null} onChange={(v) => set({ cost: v ?? 0n })} /></div>
            {limit && e.cost > 0n && e.cost < limit.limit && <p className="text-sm text-muted sm:col-span-2" role="note">{g.small(formatOre(limit.limit), String(limit.year))}</p>}
            <div><label htmlFor="a-acq" className={label}>{g.acquired}</label><input id="a-acq" type="date" className={input} required value={e.acquired} onChange={(ev) => set({ acquired: ev.target.value })} /></div>
            <div><label htmlFor="a-use" className={label}>{g.inUse}</label><input id="a-use" type="date" className={input} required value={e.inUse} onChange={(ev) => set({ inUse: ev.target.value })} /></div>
            <div><label htmlFor="a-life" className={label}>{g.life}</label><input id="a-life" type="number" min={1} max={1200} className={input} required value={String(e.lifeMonths)} onChange={(ev) => set({ lifeMonths: BigInt(ev.target.value || "0") })} /></div>
            <div className="flex items-end"><label className="flex items-center gap-2"><input type="checkbox" checked={five} onChange={(ev) => set(ev.target.checked ? { lifeMonths: 60n, residual: 0n } : { lifeMonths: 36n })} />{g.fiveYear}</label></div>
            <div><label htmlFor="a-res" className={label}>{g.residual}</label><MoneyInput id="a-res" className={input} labelText={g.residual} value={e.residual} onChange={(v) => set({ residual: v ?? 0n })} /></div>
            <div><label htmlFor="a-open" className={label}>{g.opening}</label><MoneyInput id="a-open" className={input} labelText={g.opening} describedBy="a-open-h" value={e.openingDepreciation} onChange={(v) => set({ openingDepreciation: v ?? 0n })} />
              <p id="a-open-h" className="mt-1 text-sm text-muted">{g.openingHint}</p></div>
            <AccountPicker id="a-acc-c" labelText={g.costAccount} value={e.accounts.cost} onChange={(a) => a && set({ accounts: { ...e.accounts, cost: a.number } })} />
            <AccountPicker id="a-acc-a" labelText={g.accumulatedAccount} value={e.accounts.accumulated} onChange={(a) => a && set({ accounts: { ...e.accounts, accumulated: a.number } })} />
            <AccountPicker id="a-acc-e" labelText={g.expenseAccount} value={e.accounts.expense} onChange={(a) => a && set({ accounts: { ...e.accounts, expense: a.number } })} />
            <div className="sm:col-span-2"><label htmlFor="a-note" className={label}>{g.note}</label><input id="a-note" className={input} maxLength={500} value={e.note ?? ""} onChange={(ev) => set({ note: ev.target.value || undefined })} /></div>
          </form>
        )}
      </Dialog>

      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""} wide>
        {open && (
          <div className="space-y-6">
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-muted">{g.cost}</dt><dd><Money ore={open.cost} /></dd></div>
              <div><dt className="text-muted">{g.depreciated}</dt><dd><Money ore={open.depreciated} /></dd></div>
              <div><dt className="text-muted">{g.bookValue}</dt><dd><Money ore={open.disposal ? 0n : open.bookValue} /></dd></div>
            </dl>
            <section aria-labelledby="sch-h">
              <h3 id="sch-h" className="mb-2 text-lg">{x.schedule.title}</h3>
              <table className="w-full text-sm">
                <caption className="sr-only">{x.schedule.title}</caption>
                <thead><tr><th scope="col" className="text-left">{x.schedule.year}</th><th scope="col" className="text-right">{x.schedule.amount}</th><th scope="col" className="text-right">{x.schedule.closing}</th></tr></thead>
                <tbody>{schedule(open, startMonth).map((r) => <tr key={r.from}><td>{r.from} – {r.to}</td><td className="text-right tabular-nums"><Money ore={r.amount} /></td><td className="text-right tabular-nums"><Money ore={r.closing} /></td></tr>)}</tbody>
              </table>
              <div className="mt-3 flex flex-wrap gap-2"><PdfActions job={scheduleJob(open)} fileName={`avskrivningsplan-${open.tag ?? open.id}.pdf`} preview={false} /></div>
            </section>
            {canBook && !open.disposal && open.depreciations.length === 0 && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => { setEdit({ id: open.id, v: toInput(open) }); setOpen(null); }}>{t.common.edit}</button>
                <button type="button" className="btn btn-secondary" onClick={() => void remove(open.id)}>{t.common.remove}</button>
              </div>
            )}
            {open.depreciations.length > 0 && !open.disposal && <p className="text-sm text-muted">{g.locked}</p>}
            {canBook && !open.disposal && (
              <form className="space-y-3 border-t border-border pt-4" onSubmit={(ev) => { ev.preventDefault(); void dispose(open); }} aria-labelledby="disp-h">
                <h3 id="disp-h" className="text-lg">{x.dispose.title}</h3>
                <p className="text-sm text-muted">{x.dispose.hint}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label htmlFor="d-date" className={label}>{x.dispose.date}</label><input id="d-date" type="date" className={input} required value={disp.date} onChange={(ev) => setDisp({ ...disp, date: ev.target.value })} /></div>
                  <fieldset><legend className={label}>{x.dispose.how}</legend>
                    {(["scrap", "invoiced", "cash"] as const).map((h) => (
                      <label key={h} className="flex items-center gap-2"><input type="radio" name="d-how" checked={disp.how === h} onChange={() => setDisp({ ...disp, how: h })} />{h === "cash" ? x.dispose.cash : x.dispose[h]}</label>
                    ))}
                  </fieldset>
                  {disp.how !== "scrap" && <div><label htmlFor="d-pro" className={label}>{x.dispose.proceeds}</label><MoneyInput id="d-pro" className={input} labelText={x.dispose.proceeds} value={disp.proceeds} onChange={(v) => setDisp({ ...disp, proceeds: v })} /></div>}
                  {disp.how === "cash" && <AccountPicker id="d-acc" labelText={x.dispose.account} value={disp.account} onChange={(a) => setDisp({ ...disp, account: a?.number ?? null })} />}
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy || (disp.how !== "scrap" && !disp.proceeds)}>{x.dispose.go}</button>
              </form>
            )}
          </div>
        )}
      </Dialog>
      <Toast status={status} />
    </>
  );
}
