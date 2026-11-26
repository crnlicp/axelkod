// Översikt: KPI tiles, the to-do queue, next deadlines and a monthly chart.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { AccountKind, Role, type BalanceRow, type RoleView, type VoucherDraft } from "../../../bindings/accounting";
import { ok } from "../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../admin/accounting/context";
import { useCrumbs } from "../../../admin/accounting/crumbs";
import { fyMonths } from "../../../admin/accounting/ledger";
import { upcoming } from "../../../admin/accounting/obligations";
import { Money, PageHead } from "../../../admin/accounting/ui/kit";
import { formatOre } from "../../../admin/accounting/money";
import { DeadlineList } from "./layout";

type Facts = { balances: BalanceRow[]; drafts: VoucherDraft[]; roles: RoleView[] | null };

export default function Overview() {
  const t = useAccT();
  const err = useErr();
  const ctx = useAcc();
  const { acc, data, year, href, role } = ctx;
  const [facts, setFacts] = useState<Facts | null>(null);
  const [error, setError] = useState<string | null>(null);
  useCrumbs([{ label: t.overview.title }]);

  const books = role !== Role.payroll;
  useEffect(() => {
    if (!year || !books) { setFacts({ balances: [], drafts: [], roles: null }); return; }
    let live = true;
    Promise.all([acc.balances(year.id), acc.listDrafts(), ctx.isOwner ? acc.listRoles() : Promise.resolve(null)])
      .then(([b, d, r]) => live && setFacts({ balances: ok(b), drafts: ok(d), roles: r ? ok(r) : null }))
      .catch((e) => live && setError(err(e)));
    return () => { live = false; };
  }, [acc, year, books, ctx.isOwner, err]);

  const kinds = useMemo(() => new Map((data?.accounts ?? []).map((a) => [Number(a.number), a.kind])), [data]);
  const setupDone = !!data?.company && (data?.years.length ?? 0) > 0;

  const sumWhere = (pred: (n: number) => boolean) =>
    (facts?.balances ?? []).filter((b) => pred(Number(b.account))).reduce((a, b) => a + b.months.reduce((x, y) => x + y, 0n), 0n);
  const bank = sumWhere((n) => n === 1930);
  // Revenue is booked as credit (negative); the result is shown with profit positive.
  const result = -sumWhere((n) => { const k = kinds.get(n); return k === AccountKind.revenue || k === AccountKind.expense; });
  const vat = -sumWhere((n) => n >= 2600 && n < 2700);
  const oldDrafts = (facts?.drafts ?? []).filter((d) => Date.now() - Number(d.updatedAt / 1_000_000n) > 7 * 86_400_000).length;
  const owners = facts?.roles?.filter((r) => r.role === Role.owner).length ?? 2;

  const todo: { text: string; to: string }[] = [];
  if (!setupDone) todo.push({ text: t.overview.todoSetup, to: "/admin/accounting/setup" });
  if (facts?.drafts.length) todo.push({ text: t.overview.todoDrafts(facts.drafts.length), to: "/admin/accounting/ledger/drafts" });
  if (oldDrafts) todo.push({ text: t.overview.todoOldDrafts(oldDrafts), to: "/admin/accounting/ledger/drafts" });
  if (ctx.isOwner && owners < 2) todo.push({ text: t.overview.todoBackupOwner, to: "/admin/accounting/settings/users" });

  const deadlines = data ? upcoming(data.settings, data.years, today()) : [];

  return (
    <>
      <PageHead title={t.overview.title} />
      {error && <p role="alert" className="mb-4 text-[var(--error)]">{error}</p>}
      {!setupDone && ctx.isOwner && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-4">
          <p>{t.overview.setupLead}</p>
          <Link to={href("/admin/accounting/setup")} className="btn btn-primary">{t.overview.setupCta}</Link>
        </div>
      )}
      {books && (
        <section aria-label={t.overview.title} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [t.overview.bank, bank], [t.overview.result, result], [t.overview.vat, vat], [t.overview.drafts, null],
          ].map(([label, v]) => (
            <div key={label as string} className="card">
              <p className="text-sm text-muted">{label as string}</p>
              <p className="mt-1 text-2xl font-semibold">{facts ? (v === null ? facts.drafts.length : <Money ore={v as bigint} unit />) : "…"}</p>
            </div>
          ))}
        </section>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="todo-h">
          <h2 id="todo-h" className="text-2xl">{t.overview.todo}</h2>
          {todo.length ? (
            <ul className="mt-3 space-y-2">
              {todo.map((x) => <li key={x.text}><Link to={href(x.to)}>{x.text}</Link></li>)}
            </ul>
          ) : <p className="mt-3 text-muted">{t.overview.todoNone}</p>}
        </section>
        <section className="card" aria-labelledby="dl-h">
          <h2 id="dl-h" className="text-2xl">{t.overview.deadlines}</h2>
          <div className="mt-3"><DeadlineList items={deadlines} max={5} /></div>
        </section>
      </div>
      {books && year && facts && <MonthChart balances={facts.balances} kinds={kinds} months={fyMonths(year)} />}
    </>
  );
}

/** Revenue and costs per month as inline SVG bars, with the numbers in a table for screen readers. */
function MonthChart({ balances, kinds, months }: { balances: BalanceRow[]; kinds: Map<number, AccountKind>; months: string[] }) {
  const t = useAccT();
  const series = months.map((_, i) => {
    let rev = 0n, cost = 0n;
    for (const b of balances) {
      const k = kinds.get(Number(b.account));
      if (k === AccountKind.revenue) rev -= b.months[i] ?? 0n;
      if (k === AccountKind.expense) cost += b.months[i] ?? 0n;
    }
    return { rev, cost };
  });
  const max = series.reduce((m, s) => (s.rev > m ? s.rev : s.cost > m ? s.cost : m), 0n);
  const W = 720, H = 220, pad = 28, slot = (W - pad) / months.length, bw = Math.max(4, slot / 2 - 4);
  const h = (v: bigint) => (max > 0n && v > 0n ? Number((v * BigInt(H - 40)) / max) : 0);
  return (
    <section className="card mt-6" aria-labelledby="chart-h">
      <h2 id="chart-h" className="text-2xl">{t.overview.chart}</h2>
      {max === 0n ? <p className="mt-3 text-muted">{t.overview.chartEmpty}</p> : (
        <>
          <div className="mt-2 flex gap-4 text-sm" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[var(--color-teal-500)]" />{t.overview.revenue}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[var(--muted)]" />{t.overview.costs}</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" aria-hidden="true">
            <line x1={pad} x2={W} y1={H - 20} y2={H - 20} stroke="var(--border-strong)" />
            {series.map((s, i) => {
              const x = pad + i * slot + 2;
              return (
                <g key={i}>
                  <rect x={x} y={H - 20 - h(s.rev)} width={bw} height={h(s.rev)} rx={2} fill="var(--color-teal-500)" />
                  <rect x={x + bw + 2} y={H - 20 - h(s.cost)} width={bw} height={h(s.cost)} rx={2} fill="var(--muted)" />
                  <text x={x + bw} y={H - 5} textAnchor="middle" fontSize="11" fill="var(--muted)">{t.months[Number(months[i].slice(5)) - 1]}</text>
                </g>
              );
            })}
          </svg>
          {/* A table ignores height/overflow, so the visually hidden box is a wrapper div. */}
          <div className="sr-only"><table>
            <caption>{t.overview.chart}</caption>
            <thead><tr><th scope="col">{t.common.period}</th><th scope="col">{t.overview.revenue}</th><th scope="col">{t.overview.costs}</th></tr></thead>
            <tbody>{series.map((s, i) => <tr key={i}><th scope="row">{months[i]}</th><td>{formatOre(s.rev)}</td><td>{formatOre(s.cost)}</td></tr>)}</tbody>
          </table></div>
        </>
      )}
    </section>
  );
}
