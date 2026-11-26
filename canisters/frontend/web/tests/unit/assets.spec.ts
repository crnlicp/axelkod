// The depreciation plan in the browser must match lib/Assets.mo `planned` (V25: K2 10.23,
// 10.25, 10.27), and the schedule per financial year must add up to cost less residual.
import { expect, test } from "@playwright/test";
import { planned, schedule } from "../../app/admin/accounting/assets";

const a = { cost: 3_000_000n, residual: 0n, lifeMonths: 60n, inUse: "2026-04-02" };

test("planned: from the month taken into use, truncated, ends at cost less residual", () => {
  expect(planned(a, "2026-03")).toBe(0n);
  expect(planned(a, "2026-04")).toBe(50_000n);
  expect(planned(a, "2031-03")).toBe(3_000_000n);
  expect(planned(a, "2040-01")).toBe(3_000_000n);
  expect(planned({ ...a, cost: 100_000n, lifeMonths: 3n }, "2026-05")).toBe(66_666n);
});

test("schedule per calendar year and per broken financial year", () => {
  const cal = schedule(a);
  expect(cal[0]).toEqual({ from: "2026-01", to: "2026-12", amount: 450_000n, closing: 2_550_000n });
  expect(cal.at(-1)!.to).toBe("2031-12");
  expect(cal.reduce((s, r) => s + r.amount, 0n)).toBe(3_000_000n);
  expect(cal.at(-1)!.closing).toBe(0n);
  // Financial year July–June: April 2026 falls in 2025-07 – 2026-06.
  const broken = schedule(a, 7);
  expect(broken[0]).toMatchObject({ from: "2025-07", to: "2026-06", amount: 150_000n });
  const res = schedule({ ...a, residual: 600_000n });
  expect(res.at(-1)!.closing).toBe(600_000n);
});
