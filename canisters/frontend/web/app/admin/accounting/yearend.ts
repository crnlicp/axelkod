// Bokslut (A9b): closing balances with the opening balance, the K2 statements for a year and
// the one before, the PDF job, and the INK2 forms for the SRU files.
import type { FiscalYear, TaxCalc } from "../../bindings/accounting";
import { ok } from "./api";
import type { AccContext } from "./context";
import { meta, openingMap } from "./ledger";
import type { Job, StatementSection } from "./pdf/types";
import { balanceSheet, incomeStatement, ink2, ink2r, ink2s, statementFields, type Accounts, type StatementRow } from "./sru";

/** Opening balance + the year's movements, per account, in öre. */
export async function closingBalances(acc: AccContext["acc"], y: FiscalYear): Promise<Map<number, bigint>> {
  const [rows, ib] = await Promise.all([acc.balances(y.id), openingMap(acc, y.id)]);
  const m = new Map(ib);
  for (const r of ok(rows)) m.set(Number(r.account), (m.get(Number(r.account)) ?? 0n) + r.months.reduce((a, x) => a + x, 0n));
  return m;
}

/** The year that ends the day before `y` starts. */
export const previousYear = (years: FiscalYear[], y: FiscalYear) =>
  years.find((p) => new Date(Date.parse(`${p.end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) === y.start) ?? null;

export const accountsOf = (ctx: AccContext): Accounts => new Map((ctx.data?.accounts ?? []).map((a) => [Number(a.number), { sruCode: a.sruCode ?? null }]));

export type Statements = { income: StatementRow[]; balance: StatementRow[]; fields: Map<number, bigint>; hasPrev: boolean };

export async function statements(ctx: AccContext, y: FiscalYear): Promise<Statements> {
  const accounts = accountsOf(ctx);
  const prevYear = ctx.data ? previousYear(ctx.data.years, y) : null;
  const [cur, prev] = await Promise.all([closingBalances(ctx.acc, y), prevYear ? closingBalances(ctx.acc, prevYear) : Promise.resolve(new Map<number, bigint>())]);
  const f = statementFields(cur, accounts);
  const p = statementFields(prev, accounts);
  return { income: incomeStatement(f, p), balance: balanceSheet(f, p), fields: ink2r(cur, accounts), hasPrev: !!prevYear };
}

const yearText = (y: FiscalYear) => `${y.start} – ${y.end}`;

export async function statementJob(ctx: AccContext, y: FiscalYear, preliminary: boolean): Promise<Job> {
  const s = await statements(ctx, y);
  const prev = ctx.data ? previousYear(ctx.data.years, y) : null;
  const cols = (title: string): [string, string, string] => [title, y.end.slice(0, 4) === y.start.slice(0, 4) ? y.start.slice(0, 4) : yearText(y), prev ? (prev.start.slice(0, 4) === prev.end.slice(0, 4) ? prev.start.slice(0, 4) : yearText(prev)) : ""];
  const section = (title: string, rows: StatementRow[]): StatementSection => ({ title, cols: cols("Belopp i kr"), rows: rows.map((r) => ({ ...r, prev: prev ? r.prev : null })) });
  return {
    template: "statement@1",
    meta: meta(ctx, "Resultat- och balansräkning", y.end.slice(0, 4), [`Räkenskapsår ${yearText(y)}`, "Uppställning enligt K2 (BFNAR 2016:10)"]),
    facts: [["Räkenskapsår", yearText(y)], ...(prev ? [["Föregående år", yearText(prev)] as [string, string]] : []), ...(preliminary ? [["Status", "Preliminär – bokslutet är inte bokfört"] as [string, string]] : [])],
    sections: [section("Resultaträkning", s.income), section("Balansräkning", s.balance)],
  };
}

/** INK2, INK2R and INK2S for the SRU files, from the statements and the stored tax calculation. */
export function forms(r: Map<number, bigint>, calc: TaxCalc) {
  const s = ink2s(r, calc);
  return [{ form: "INK2" as const, fields: ink2(s) }, { form: "INK2R" as const, fields: r }, { form: "INK2S" as const, fields: s }];
}

/** A file download from bytes, under a fixed name. */
export function download(bytes: Uint8Array, name: string, type = "text/plain;charset=iso-8859-1") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
