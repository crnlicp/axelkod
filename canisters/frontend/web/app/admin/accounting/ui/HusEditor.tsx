// The ROT/RUT part of the invoice editor (A8): what each line is (labour with a work
// type, material, other), the buyers with shares, and the home for ROT. Names,
// personnummer and the property are encrypted with pii-v1 when the draft is saved.
import { IconTrash } from "../../../components/Icons";
import { HusKind, type HusInput, type HusLinePart } from "../../../bindings/accounting";
import type { Accounting } from "../api";
import { useAccT } from "../context";
import { normalizePnr } from "../payroll";
import { decryptIdentity, decryptProperty, encryptIdentity, encryptProperty, workTypes } from "../rotrut";
import { formatPct, parsePct } from "../sales";
import { MoneyInput, input as inputCls, label } from "./kit";

type Part = "" | "labour" | "material" | "other";
export type HusBuyerRow = { key: number; name: string; pnr: string; share: string };
export type HusForm = {
  on: boolean; kind: HusKind; parts: Record<number, { part: Part; workType: string }>; buyers: HusBuyerRow[];
  propertyKind: "house" | "brf"; fastighet: string; brfOrgNr: string; lgh: string; limit: bigint | null;
};

let nextBuyer = 1;
const buyerRow = (share = "100"): HusBuyerRow => ({ key: nextBuyer++, name: "", pnr: "", share });
export const emptyHus = (): HusForm => ({ on: false, kind: HusKind.rut, parts: {}, buyers: [buyerRow()], propertyKind: "house", fastighet: "", brfOrgNr: "", lgh: "", limit: null });

/** Shown before saving; the canister checks amounts, shares and caps again. */
export function husProblem(f: HusForm): "pnr" | "shares" | null {
  if (!f.on) return null;
  if (f.buyers.some((b) => !normalizePnr(b.pnr) || !b.name.trim())) return "pnr";
  const sum = f.buyers.reduce((a, b) => a + (parsePct(b.share) ?? 0n), 0n);
  return sum === 10_000n ? null : "shares";
}

/** Encrypts and builds the canister input; `rowKeys` are the editor lines kept in the document. */
export async function toHusInput(acc: Accounting, f: HusForm, rowKeys: number[]): Promise<HusInput | undefined> {
  if (!f.on) return undefined;
  const lineParts: (HusLinePart | null)[] = rowKeys.map((k) => {
    const p = f.parts[k];
    if (!p || !p.part) return null;
    if (p.part === "other") return { __kind__: "other", other: null };
    return p.part === "labour" ? { __kind__: "labour", labour: p.workType } : { __kind__: "material", material: p.workType };
  });
  const buyers = await Promise.all(f.buyers.map(async (b) => ({
    identityEnc: await encryptIdentity(acc, { name: b.name.trim(), personnummer: normalizePnr(b.pnr) ?? b.pnr.trim() }),
    shareBp: parsePct(b.share) ?? 0n,
  })));
  const propertyEnc = f.kind === HusKind.rot
    ? await encryptProperty(acc, f.propertyKind === "house" ? { fastighetsbeteckning: f.fastighet.trim() } : { brfOrgNr: f.brfOrgNr.trim(), lagenhetsnummer: f.lgh.trim() })
    : undefined;
  return { kind: f.kind, lineParts, buyers, propertyEnc, deductionLimit: f.limit ?? undefined };
}

/** The form from a saved draft (decrypts buyers and home). */
export async function fromHusInput(acc: Accounting, h: HusInput, rowKeys: number[]): Promise<HusForm> {
  const parts: HusForm["parts"] = {};
  h.lineParts.forEach((p, i) => {
    const k = rowKeys[i];
    if (k === undefined || !p) return;
    parts[k] = p.__kind__ === "other" ? { part: "other", workType: "" } : p.__kind__ === "labour" ? { part: "labour", workType: p.labour } : { part: "material", workType: p.material };
  });
  const buyers = await Promise.all(h.buyers.map(async (b) => {
    const id = await decryptIdentity(acc, b.identityEnc);
    return { key: nextBuyer++, name: id.name, pnr: id.personnummer, share: formatPct(b.shareBp) };
  }));
  const prop = h.propertyEnc ? await decryptProperty(acc, h.propertyEnc) : null;
  return {
    on: true, kind: h.kind, parts, buyers: buyers.length ? buyers : [buyerRow()],
    propertyKind: prop && "brfOrgNr" in prop ? "brf" : "house",
    fastighet: prop && "fastighetsbeteckning" in prop ? prop.fastighetsbeteckning : "",
    brfOrgNr: prop && "brfOrgNr" in prop ? prop.brfOrgNr : "", lgh: prop && "lagenhetsnummer" in prop ? prop.lagenhetsnummer : "",
    limit: h.deductionLimit ?? null,
  };
}

export function HusEditor({ form, onChange, rows, allowed, bad }: {
  form: HusForm; onChange: (f: HusForm) => void; rows: { key: number; description: string }[]; allowed: boolean; bad: (field: string) => true | undefined;
}) {
  const t = useAccT().rotRut;
  const x = t.editor;
  const set = (f: Partial<HusForm>) => onChange({ ...form, ...f });
  const types = workTypes(form.kind);
  const setBuyer = (key: number, b: Partial<HusBuyerRow>) => set({ buyers: form.buyers.map((y) => (y.key === key ? { ...y, ...b } : y)) });
  const problem = husProblem(form);
  return (
    <fieldset className="card space-y-4" aria-describedby="hus-intro">
      <legend className="sr-only">{x.title}</legend>
      <h2 className="text-2xl">{x.title}</h2>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={form.on} disabled={!allowed && !form.on} onChange={(e) => set({ on: e.target.checked })} /> {x.use}
      </label>
      {!allowed && <p className="text-sm text-muted">{x.onlyPerson}</p>}
      <p id="hus-intro" className="text-sm text-muted">{x.intro}</p>
      {form.on && <>
        <div>
          <label htmlFor="hus-kind" className={label}>{x.kind}</label>
          <select id="hus-kind" className={inputCls} value={form.kind} onChange={(e) => set({ kind: e.target.value as HusKind, parts: {} })}>
            <option value={HusKind.rut}>{t.kind.rut} (50 %)</option><option value={HusKind.rot}>{t.kind.rot} (30 %)</option>
          </select>
        </div>
        <ol className="space-y-2" aria-invalid={bad("hus.labour") || bad("hus.material") || bad("hus.lineParts")}>
          {rows.map((r, i) => {
            const p = form.parts[r.key] ?? { part: "" as Part, workType: types[0] };
            const put = (q: Partial<typeof p>) => set({ parts: { ...form.parts, [r.key]: { ...p, workType: p.workType || types[0], ...q } } });
            return (
              <li key={r.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_14rem] sm:items-center">
                <span className="truncate text-sm">{i + 1}. {r.description || "–"}</span>
                <select aria-label={x.linePart(i + 1)} className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5" value={p.part}
                  onChange={(e) => put({ part: e.target.value as Part })}>
                  <option value="">{x.none}</option><option value="labour">{x.labour}</option><option value="material">{x.material}</option><option value="other">{x.other}</option>
                </select>
                {(p.part === "labour" || p.part === "material") ? (
                  <select aria-label={x.workType(i + 1)} className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5" value={p.workType || types[0]}
                    aria-invalid={bad(`hus.lineParts[${i}]`)} onChange={(e) => put({ workType: e.target.value })}>
                    {types.map((w) => <option key={w} value={w}>{t.work[w]}</option>)}
                  </select>
                ) : <span />}
              </li>
            );
          })}
        </ol>
        <div>
          <h3 className="text-lg">{x.buyers}</h3>
          <p className="text-xs text-muted">{x.encrypted}</p>
          <ol className="mt-2 space-y-2">
            {form.buyers.map((b, i) => (
              <li key={b.key} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_6rem_auto]">
                <input aria-label={x.buyerName(i + 1)} className="col-span-2 rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5 sm:col-span-1" maxLength={200} value={b.name}
                  autoComplete="off" onChange={(e) => setBuyer(b.key, { name: e.target.value })} />
                <input aria-label={x.buyerPnr(i + 1)} className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5" inputMode="numeric" autoComplete="off"
                  placeholder="ÅÅÅÅMMDDNNNN" value={b.pnr} aria-invalid={(b.pnr !== "" && !normalizePnr(b.pnr)) || undefined} onChange={(e) => setBuyer(b.key, { pnr: e.target.value })} />
                <input aria-label={x.buyerShare(i + 1)} className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5 text-right" inputMode="decimal" value={b.share}
                  aria-invalid={problem === "shares" || bad("hus.shares") || undefined} onChange={(e) => setBuyer(b.key, { share: e.target.value })} />
                <button type="button" aria-label={x.removeBuyer(i + 1)} disabled={form.buyers.length <= 1} onClick={() => set({ buyers: form.buyers.filter((y) => y.key !== b.key) })}
                  title={x.removeBuyer(i + 1)} className="grid h-9 w-9 place-items-center justify-self-end rounded-full text-muted hover:bg-surface-strong hover:text-[var(--error)] disabled:opacity-30"><IconTrash className="h-5 w-5" /></button>
              </li>
            ))}
          </ol>
          <button type="button" className="mt-2 text-sm font-semibold text-accent" onClick={() => set({ buyers: [...form.buyers, buyerRow("")] })}>+ {x.addBuyer}</button>
          {problem && <p role="alert" className="mt-2 text-sm text-[var(--error)]">{problem === "pnr" ? x.badPnr : x.sharesHint}</p>}
        </div>
        {form.kind === HusKind.rot && (
          <fieldset className="space-y-3" aria-invalid={bad("hus.property")}>
            <legend className={label}>{x.property}</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2"><input type="radio" name="hus-prop" checked={form.propertyKind === "house"} onChange={() => set({ propertyKind: "house" })} /> {x.house}</label>
              <label className="flex items-center gap-2"><input type="radio" name="hus-prop" checked={form.propertyKind === "brf"} onChange={() => set({ propertyKind: "brf" })} /> {x.brf}</label>
            </div>
            {form.propertyKind === "house" ? (
              <div><label htmlFor="hus-fast" className={label}>{x.fastighet}</label>
                <input id="hus-fast" className={inputCls} maxLength={40} autoComplete="off" value={form.fastighet} onChange={(e) => set({ fastighet: e.target.value })} /></div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor="hus-brf" className={label}>{x.brfOrgNr}</label>
                  <input id="hus-brf" className={inputCls} maxLength={11} autoComplete="off" value={form.brfOrgNr} onChange={(e) => set({ brfOrgNr: e.target.value })} /></div>
                <div><label htmlFor="hus-lgh" className={label}>{x.lgh}</label>
                  <input id="hus-lgh" className={inputCls} maxLength={25} inputMode="numeric" autoComplete="off" value={form.lgh} onChange={(e) => set({ lgh: e.target.value })} /></div>
              </div>
            )}
          </fieldset>
        )}
        <div>
          <label htmlFor="hus-limit" className={label}>{x.limit}</label>
          <MoneyInput id="hus-limit" labelText={x.limit} value={form.limit} describedBy="hus-limit-hint" onChange={(v) => set({ limit: v })} />
          <p id="hus-limit-hint" className="mt-1 text-xs text-muted">{x.limitHint}</p>
        </div>
      </>}
    </fieldset>
  );
}
