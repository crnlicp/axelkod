// Tillgångar & lager against the local accounting canister (V25, V26): an asset, a
// depreciation run (series I, 7832/1229, the browser's schedule matches the canister),
// the never-twice rule, a sale with a gain, and a stocktaking valued FIFO at 97 %.
// Runs and counts use up their period, so the test takes the first free month of the year.
import { expect, test } from "@playwright/test";
import { MoveKind, type AssetInput } from "../../app/bindings/accounting";
import { planned } from "../../app/admin/accounting/assets";
import { ensureOwnerAndYear, ok, owner } from "../support/accounting";

test.describe.configure({ mode: "serial" });

const year = new Date().getUTCFullYear();
const run = Date.now() % 100000;
const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
const monthEnd = (p: string) => new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0)).toISOString().slice(0, 10);

const input: AssetInput = {
  name: `Verktygsvagn ${run}`, tag: `T-${run}`, accounts: { cost: 1220n, accumulated: 1229n, expense: 7832n },
  acquired: `${year}-01-05`, inUse: `${year}-01-05`, cost: 6_000_000n, residual: 0n, lifeMonths: 60n, openingDepreciation: 0n,
};
let assetId = 0n;

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  const s = ok(await owner.getSettings()).settings;
  if (!s.modules.inventory) ok(await owner.setSettings({ ...s, modules: { ...s.modules, inventory: true } }));
});

test("asset register: validation, depreciation run, never twice, sale with a gain", async () => {
  // Accumulated depreciation on the asset account itself is refused.
  const bad = await owner.saveAsset(null, { ...input, accounts: { ...input.accounts, accumulated: 1220n } });
  expect(bad.__kind__ === "err" && bad.err.__kind__ === "invalid" && bad.err.invalid).toBe("accounts.accumulated");
  const a = ok(await owner.saveAsset(null, input));
  assetId = a.id;
  expect(a.bookValue).toBe(6_000_000n);
  // Half a prisbasbelopp from the stored parameters (V11: 59 200 kr in 2026).
  expect(ok(await owner.smallAssetLimit()).limit).toBe(2_960_000n);

  const done = new Set(ok(await owner.listDepRuns()).map((r) => r.period));
  let period: string | null = null;
  for (const p of months) {
    if (done.has(p)) continue;
    const pre = ok(await owner.previewDepreciation(p));
    const mine = pre.find((r) => r.assetId === assetId);
    // The run catches up every month from January; the browser's plan gives the same figure.
    expect(mine?.amount).toBe(planned(a, p));
    const r = await owner.runDepreciation(p);
    if (r.__kind__ === "ok") { period = p; break; }
    expect(["locked", "conflict"]).toContain(r.err.__kind__);
  }
  test.skip(period === null, "every month of the year already has a run or is locked");
  const after = ok(await owner.listAssets()).find((x) => x.id === assetId)!;
  expect(after.depreciated).toBe(planned(a, period!));
  const v = ok(await owner.getVoucher(after.depreciations[0].voucherId));
  expect(v.series).toBe("I");
  expect(v.lines.some((l) => l.account === 7832n && l.amount > 0n)).toBe(true);
  expect(v.lines.reduce((s, l) => s + l.amount, 0n)).toBe(0n);
  // The same period never runs twice; a depreciated asset can no longer be edited.
  expect((await owner.runDepreciation(period!)).__kind__).toBe("err");
  expect((await owner.saveAsset(assetId, input)).__kind__).toBe("err");

  // Sold for book value + 1 000 kr, paid to the bank: gain on 3973.
  const sold = ok(await owner.disposeAsset(assetId, { date: monthEnd(period!), proceeds: after.bookValue + 100_000n, proceedsAccount: 1930n }));
  expect(sold.disposal?.bookValue).toBe(after.bookValue);
  const dv = ok(await owner.getVoucher(sold.disposal!.voucherId));
  expect(dv.lines.find((l) => l.account === 3973n)?.amount).toBe(-100_000n);
  expect(dv.lines.find((l) => l.account === 1220n)?.amount).toBe(-6_000_000n);
  expect((await owner.disposeAsset(assetId, { date: monthEnd(period!), proceeds: 0n })).__kind__).toBe("err");
});

test("inventory: moves, FIFO levels and a stocktaking at 97 %", async () => {
  const item = ok(await owner.saveStockItem(null, { sku: `RD-${run}`, name: "Reservdel", unit: "st", active: true }));
  const counts = ok(await owner.listStockCounts());
  // After the last count and the lock date (earlier tests may have locked months).
  const lock = ok(await owner.getSettings()).lockDate ?? "";
  const last = counts.reduce((m, c) => (c.date > m ? c.date : m), lock);
  const date = months.map(monthEnd).find((d) => d > last && d.slice(0, 4) === String(year));
  test.skip(!date, "every month of the year already has a stocktaking");
  const day = `${date!.slice(0, 8)}01`;
  // 10 @ 100 kr then 10 @ 120 kr, 12 sold: 8 left, priced at the newest cost (IL 17:3).
  ok(await owner.addStockMove({ stockItemId: item.id, date: day, kind: MoveKind.purchase, qty: 10_000n, unitCost: 10_000n }));
  ok(await owner.addStockMove({ stockItemId: item.id, date: day, kind: MoveKind.purchase, qty: 10_000n, unitCost: 12_000n }));
  ok(await owner.addStockMove({ stockItemId: item.id, date: day, kind: MoveKind.sale, qty: -12_000n, unitCost: 0n }));
  const lvl = ok(await owner.stockLevels(date!)).find((l) => l.stockItemId === item.id)!;
  expect(lvl.qty).toBe(8_000n);
  expect(lvl.value).toBe(96_000n);

  // Every item with stock must be counted: rows for all of them, this one counted 8.
  const all = ok(await owner.stockLevels(date!));
  const rows = all.filter((l) => l.qty !== 0n).map((l) => ({ stockItemId: l.stockItemId, qty: l.qty }));
  const missing = await owner.previewStockCount({ date: date!, rows: rows.filter((r) => r.stockItemId !== item.id), rule97: true, account: 1460n, changeAccount: 4960n });
  expect(missing.__kind__ === "err" && missing.err.__kind__ === "invalid" && missing.err.invalid).toBe("rows.missing");
  const c = ok(await owner.postStockCount({ date: date!, rows, rule97: true, account: 1460n, changeAccount: 4960n }));
  const mine = c.rows.find((r) => r.stockItemId === item.id)!;
  expect(mine.cost).toBe(96_000n);
  expect(c.value).toBe((c.cost * 97n) / 100n);
  if (c.voucherId !== undefined) {
    const v = ok(await owner.getVoucher(c.voucherId));
    expect(v.lines.find((l) => l.account === 1460n)?.amount).toBe(c.value - c.bookBefore);
  }
  // A move dated on or before the count is refused.
  expect((await owner.addStockMove({ stockItemId: item.id, date: date!, kind: MoveKind.adjust, qty: 1_000n, unitCost: 10_000n })).__kind__).toBe("err");
});
