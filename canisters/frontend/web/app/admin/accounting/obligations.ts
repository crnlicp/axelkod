// Upcoming filing/payment deadlines from the settings (computed, never stored: C19).
// Filed/paid state arrives with the VAT and payroll phases; until then this lists dates.
import { Variant_month_quarter_year, type AccountingSettings, type FiscalYear } from "../../bindings/accounting";
import { addDays, agiDue, prelTaxDue, vatMonthDue, vatQuarterDue, vatYearDue, type Ymd } from "./deadlines";

export type Obligation = { kind: "vat" | "agi" | "prel"; period: string; due: Ymd };

const pad = (n: number) => String(n).padStart(2, "0");

export function upcoming(settings: AccountingSettings, years: FiscalYear[], from: Ymd, days = 30): Obligation[] {
  const [y0, m0] = from.split("-").map(Number);
  const until = addDays(from, days);
  const out: Obligation[] = [];
  // Periods that end up to three months back can still be due within the window.
  for (let k = -3; k <= 1; k++) {
    const d = new Date(Date.UTC(y0, m0 - 1 + k, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    if (settings.vatPeriod === Variant_month_quarter_year.month) out.push({ kind: "vat", period: `${y}-${pad(m)}`, due: vatMonthDue(y, m) });
    if (settings.vatPeriod === Variant_month_quarter_year.quarter && m % 3 === 0) out.push({ kind: "vat", period: `${y} K${m / 3}`, due: vatQuarterDue(y, m / 3) });
    if (settings.modules.payroll) out.push({ kind: "agi", period: `${y}-${pad(m)}`, due: agiDue(y, m) });
    out.push({ kind: "prel", period: `${y}-${pad(m)}`, due: prelTaxDue(y, m) });
  }
  if (settings.vatPeriod === Variant_month_quarter_year.year)
    for (const fy of years) {
      const [ey, em] = fy.end.split("-").map(Number);
      // The earliest rule (EU trade) until EU trade is a setting (A6).
      out.push({ kind: "vat", period: `${fy.start.slice(0, 4)}`, due: vatYearDue(ey, em, true) });
    }
  return out.filter((o) => o.due >= from && o.due <= until).sort((a, b) => a.due.localeCompare(b.due));
}

export const daysUntil = (from: Ymd, to: Ymd) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
