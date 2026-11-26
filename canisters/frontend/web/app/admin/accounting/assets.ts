// Fixed assets (A9a): the depreciation plan as the canister computes it (lib/Assets.mo
// `planned`: straight line per month from the month taken into use, truncated to öre).
// Used for the schedule PDF and the register view; the canister decides what is booked.
import type { AssetView } from "../../bindings/accounting";

const monthNo = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const ymOf = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;

type Plan = Pick<AssetView, "cost" | "residual" | "lifeMonths" | "inUse">;

/** Planned accumulated depreciation through the month "YYYY-MM". */
export function planned(a: Plan, period: string): bigint {
  const k = monthNo(period) - monthNo(a.inUse.slice(0, 7)) + 1;
  if (k <= 0) return 0n;
  const months = BigInt(Math.min(k, Number(a.lifeMonths)));
  return ((a.cost - a.residual) * months) / a.lifeMonths;
}

export type ScheduleRow = { from: string; to: string; amount: bigint; closing: bigint };

/**
 * The plan per financial year of `yearMonths` months starting in `startMonth` (1–12), from
 * the year the asset is taken into use until it is fully depreciated.
 */
export function schedule(a: Plan, startMonth = 1, yearMonths = 12): ScheduleRow[] {
  const use = monthNo(a.inUse.slice(0, 7));
  // First financial year that contains the month taken into use.
  let start = use - ((((use % 12) - (startMonth - 1)) % 12) + 12) % 12;
  const rows: ScheduleRow[] = [];
  let before = 0n;
  const total = a.cost - a.residual;
  while (before < total && rows.length < 200) {
    const end = start + yearMonths - 1;
    const through = planned(a, ymOf(end));
    rows.push({ from: ymOf(start), to: ymOf(end), amount: through - before, closing: a.cost - through });
    before = through;
    start = end + 1;
  }
  return rows;
}

/** Status of an asset in the register. */
export function assetState(a: AssetView): "disposed" | "done" | "active" {
  if (a.disposal) return "disposed";
  return a.depreciated >= a.cost - a.residual ? "done" : "active";
}
