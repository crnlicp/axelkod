// Filing and payment deadlines, computed (C19). Sources in docs/accounting/sources.md (V6):
// - Lag (1989:253) om allmänna helgdagar 1–2 §§ (holidays).
// - Lag (1930:173) 2 §: a last day on a Saturday, Sunday, public holiday, midsommarafton,
//   julafton or nyårsafton moves to the next weekday.
// - Skatteverket "När ska jag deklarera moms", "När ska jag lämna arbetsgivardeklarationen",
//   "Periodisk sammanställning", "Preliminärskatt för företag och föreningar".
// Dates are "YYYY-MM-DD" strings; arithmetic is in UTC so time zones never shift a day.

export type Ymd = string;

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number): Ymd => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const parts = (s: Ymd) => s.split("-").map(Number) as [number, number, number];
const weekday = (s: Ymd) => { const [y, m, d] = parts(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const addDays = (s: Ymd, n: number): Ymd => { const [y, m, d] = parts(s); return ymd(y, m, d + n); };

/** Easter Sunday (Gregorian, anonymous algorithm): the Sunday after the paschal full moon. */
function easter(y: number): Ymd {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return ymd(y, month, ((h + l - 7 * m + 114) % 31) + 1);
}

/** The Saturday within [from, from + 6]. */
const saturdayFrom = (y: number, m: number, d: number) => { const s = ymd(y, m, d); return addDays(s, (6 - weekday(s) + 7) % 7); };

/** Allmänna helgdagar that are not Sundays by definition, with their Swedish names. */
export function holidays(y: number): Map<Ymd, string> {
  const e = easter(y);
  const midsommar = saturdayFrom(y, 6, 20);
  return new Map([
    [ymd(y, 1, 1), "Nyårsdagen"], [ymd(y, 1, 6), "Trettondedag jul"],
    [addDays(e, -2), "Långfredagen"], [e, "Påskdagen"], [addDays(e, 1), "Annandag påsk"],
    [ymd(y, 5, 1), "Första maj"], [addDays(e, 39), "Kristi himmelsfärdsdag"], [addDays(e, 49), "Pingstdagen"],
    [ymd(y, 6, 6), "Nationaldagen"], [midsommar, "Midsommardagen"], [saturdayFrom(y, 10, 31), "Alla helgons dag"],
    [ymd(y, 12, 25), "Juldagen"], [ymd(y, 12, 26), "Annandag jul"],
  ]);
}

/** Not a weekday under Lag (1930:173) 2 §. */
export function isNonWorking(s: Ymd): boolean {
  const wd = weekday(s);
  if (wd === 0 || wd === 6) return true;
  const [y, m, d] = parts(s);
  if (holidays(y).has(s)) return true;
  if (m === 12 && (d === 24 || d === 31)) return true; // julafton, nyårsafton
  return s === addDays(saturdayFrom(y, 6, 20), -1); // midsommarafton
}

export function nextWorkingDay(s: Ymd): Ymd {
  let d = s;
  while (isNonWorking(d)) d = addDays(d, 1);
  return d;
}

/** Day `day` of the month `monthsAfter` months after (y, m), with the per-month exceptions. */
function due(y: number, m: number, monthsAfter: number, day: (month: number) => number): Ymd {
  const t = new Date(Date.UTC(y, m - 1 + monthsAfter, 1));
  const month = t.getUTCMonth() + 1;
  return nextWorkingDay(ymd(t.getUTCFullYear(), month, day(month)));
}

const twelfth = (month: number) => (month === 1 || month === 8 ? 17 : 12);
const twentySixth = (month: number) => (month === 12 ? 27 : 26);

export type Turnover = "upTo40M" | "over40M";

/** AGI filing (and payment, ≤ 40 MSEK) for pay paid out in month m of year y. */
export const agiDue = (y: number, m: number, turnover: Turnover = "upTo40M") =>
  due(y, m, 1, turnover === "upTo40M" ? twelfth : twentySixth);

/** VAT return for a calendar month. */
export const vatMonthDue = (y: number, m: number, turnover: Turnover = "upTo40M") =>
  turnover === "upTo40M" ? due(y, m, 2, twelfth) : due(y, m, 1, twentySixth);

/** VAT return for calendar quarter q (1–4): the 12th of the second month after, 17th in August. */
export const vatQuarterDue = (y: number, q: number) => due(y, q * 3, 2, (month) => (month === 8 ? 17 : 12));

/**
 * VAT for a whole fiscal year ending in (y, endMonth). With EU trade (or when no income
 * tax return is filed): the 26th of the second month after, 27th in December. Without EU
 * trade an AB files with its income tax return; the digital-filing date from Skatteverket's
 * table is used.
 */
export function vatYearDue(y: number, endMonth: number, euTrade: boolean): Ymd {
  if (euTrade) return due(y, endMonth, 2, twentySixth);
  // [months after year end, day] per year-end month, digital filing.
  const table: Record<number, [number, number]> = {
    1: [11, 12], 2: [10, 12], 3: [9, 12], 4: [8, 12],
    5: [8, 17], 6: [7, 17],
    7: [9, 12], 8: [8, 12],
    9: [11, 17], 10: [10, 17], 11: [9, 17], 12: [8, 17],
  };
  const [after, day] = table[endMonth];
  return due(y, endMonth, after, () => day);
}

/** EU sales list (periodisk sammanställning), filed electronically: the 25th of the month after. */
export const ecSalesDue = (y: number, lastMonthOfPeriod: number) => due(y, lastMonthOfPeriod, 1, () => 25);

/**
 * Preliminary tax for month m. Skatteverket states "vanligtvis den 12:e"; the date in the
 * company's own tax decision wins. January/August exceptions are not on the page read (V6).
 */
export const prelTaxDue = (y: number, m: number) => due(y, m, 0, () => 12);

/**
 * INK2 filed electronically (SFL 32:2 plus one month, V16): year-end Jan–Apr → 1 December,
 * May–Jun → 15 January, Jul–Aug → 1 April, Sep–Dec → 1 August (of the following year).
 */
export function ink2Due(end: Ymd): Ymd {
  const [y, m] = parts(end);
  if (m <= 4) return nextWorkingDay(ymd(y, 12, 1));
  if (m <= 6) return nextWorkingDay(ymd(y + 1, 1, 15));
  if (m <= 8) return nextWorkingDay(ymd(y + 1, 4, 1));
  return nextWorkingDay(ymd(y + 1, 8, 1));
}

/** Last day of the month `n` months after the month of `end`. */
const monthEndAfter = (end: Ymd, n: number): Ymd => { const [y, m] = parts(end); return ymd(y, m + n + 1, 0); };

/** Ordinary general meeting within six months of the year-end (ABL 7:10, V19). */
export const agmDue = (end: Ymd) => monthEndAfter(end, 6);

/** Annual report at Bolagsverket within seven months of the year-end, or a late fee (ÅRL 8:6, V19). */
export const annualReportDue = (end: Ymd) => nextWorkingDay(monthEndAfter(end, 7));
