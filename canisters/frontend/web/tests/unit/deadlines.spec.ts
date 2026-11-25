// Deadlines against Skatteverket's published 2026 tables (V6, read 2026-11-25).
import { expect, test } from "@playwright/test";
import { agiDue, holidays, isNonWorking, vatMonthDue, vatQuarterDue, vatYearDue, ecSalesDue } from "../../app/admin/accounting/deadlines";

test("AGI ≤ 40 MSEK: Skatteverket's 2026 table", () => {
  const expected = [
    [2025, 12, "2026-01-19"], [2026, 1, "2026-02-12"], [2026, 2, "2026-03-12"], [2026, 3, "2026-04-13"],
    [2026, 4, "2026-05-12"], [2026, 5, "2026-06-12"], [2026, 6, "2026-07-13"], [2026, 7, "2026-08-17"],
    [2026, 8, "2026-09-14"], [2026, 9, "2026-10-12"], [2026, 10, "2026-11-12"], [2026, 11, "2026-12-14"],
    [2026, 12, "2027-01-18"],
  ] as const;
  for (const [y, m, d] of expected) expect(agiDue(y, m), `${y}-${m}`).toBe(d);
});

test("AGI > 40 MSEK: Skatteverket's 2026 table", () => {
  const expected = ["2026-01-26", "2026-02-26", "2026-03-26", "2026-04-27", "2026-05-26", "2026-06-26",
    "2026-07-27", "2026-08-26", "2026-09-28", "2026-10-26", "2026-11-26", "2026-12-28", "2027-01-26"];
  expected.forEach((d, i) => expect(agiDue(2025 + (i === 0 ? 0 : 1), i === 0 ? 12 : i, "over40M")).toBe(d));
});

test("VAT periods", () => {
  expect(vatQuarterDue(2026, 1)).toBe("2026-05-12"); // the page's own example
  expect(vatQuarterDue(2026, 2)).toBe("2026-08-17");
  expect(vatQuarterDue(2026, 4)).toBe("2027-02-12");
  expect(vatMonthDue(2026, 6)).toBe("2026-08-17");
  expect(vatMonthDue(2026, 11)).toBe("2027-01-18"); // 17 Jan 2027 is a Sunday
  expect(vatMonthDue(2026, 11, "over40M")).toBe("2026-12-28"); // 27 Dec 2026 is a Sunday
  expect(vatYearDue(2026, 12, false)).toBe("2027-08-17");
  expect(vatYearDue(2026, 6, false)).toBe("2027-01-18");
  expect(vatYearDue(2026, 12, true)).toBe("2027-02-26");
  expect(ecSalesDue(2026, 3)).toBe("2026-04-27"); // 25 Apr 2026 is a Saturday
});

test("holidays 2026 and the 1930:173 days", () => {
  const h = holidays(2026);
  expect(h.get("2026-04-03")).toBe("Långfredagen");
  expect(h.get("2026-05-14")).toBe("Kristi himmelsfärdsdag");
  expect(h.get("2026-06-20")).toBe("Midsommardagen");
  expect(h.get("2026-10-31")).toBe("Alla helgons dag");
  expect(isNonWorking("2026-06-19")).toBe(true); // midsommarafton
  expect(isNonWorking("2026-12-24")).toBe(true);
  expect(isNonWorking("2026-12-31")).toBe(true);
  expect(isNonWorking("2026-11-25")).toBe(false);
});
