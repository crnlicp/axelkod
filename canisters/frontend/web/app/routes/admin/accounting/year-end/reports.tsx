// Bokslut › Rapporter: the K2 income statement and balance sheet (this year and last), the
// INK2/INK2R/INK2S fields and the two SRU files for Skatteverket's Filöverföring (V16, V19).
import { useEffect, useState } from "react";
import type { Status } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { sruFiles, type StatementRow } from "../../../../admin/accounting/sru";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { SectionTabs, yearEndTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { PageHead } from "../../../../admin/accounting/ui/kit";
import { download, forms, previousYear, statementJob, statements, type Statements } from "../../../../admin/accounting/yearend";

const krText = (v: bigint) => v.toLocaleString("sv-SE");

function Table({ caption, rows, cur, prev }: { caption: string; rows: StatementRow[]; cur: string; prev: string | null }) {
  const t = useAccT().yearEnd.reports;
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left text-lg font-semibold">{caption}</caption>
      <thead><tr className="text-muted">
        <th scope="col" className="py-1 text-left font-medium">{t.post}</th>
        <th scope="col" className="py-1 text-right font-medium">{cur}</th>
        {prev !== null && <th scope="col" className="py-1 text-right font-medium">{prev}</th>}
      </tr></thead>
      <tbody>
        {rows.map((r, i) => r.kind === "heading" ? (
          <tr key={i}><th scope="rowgroup" colSpan={prev !== null ? 3 : 2} className="pt-3 text-left font-semibold">{r.label}</th></tr>
        ) : (
          <tr key={i} className={r.kind === "item" ? "border-t border-border" : "border-t-2 border-border font-semibold"}>
            <th scope="row" className="py-1 pr-2 text-left font-[inherit]">{r.label}</th>
            <td className="py-1 text-right tabular-nums">{krText(r.cur)}</td>
            {prev !== null && <td className="py-1 text-right tabular-nums">{krText(r.prev)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Fields({ caption, fields }: { caption: string; fields: Map<number, bigint> }) {
  const t = useAccT().yearEnd.reports;
  const rows = [...fields].sort(([a], [b]) => a - b);
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left font-semibold">{caption}</caption>
      <thead><tr className="text-muted"><th scope="col" className="py-1 text-left font-medium">{t.field}</th><th scope="col" className="py-1 text-right font-medium">{t.value}</th></tr></thead>
      <tbody>{rows.map(([c, v]) => <tr key={c} className="border-t border-border"><td className="py-1">{c}</td><td className="py-1 text-right tabular-nums">{krText(v)}</td></tr>)}</tbody>
    </table>
  );
}

export default function YearEndReports() {
  const t = useAccT();
  const y = t.yearEnd;
  const r = y.reports;
  const err = useErr();
  const ctx = useAcc();
  const { acc, year, data } = ctx;
  const [s, setS] = useState<Statements | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  useCrumbs([{ label: y.title, to: "/admin/accounting/year-end" }, { label: y.tabs.reports }]);

  useEffect(() => {
    if (!year) return;
    let live = true;
    setS(null);
    Promise.all([statements(ctx, year), acc.yearEndStatus(year.id).then(ok)])
      .then(([a, b]) => { if (live) { setS(a); setSt(b); } }).catch((e) => live && setError(err(e)));
    return () => { live = false; };
  }, [acc, year, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!year) return null;
  const prev = data ? previousYear(data.years, year) : null;
  const label = (a: { start: string; end: string }) => (a.start.slice(0, 4) === a.end.slice(0, 4) ? a.start.slice(0, 4) : `${a.start} – ${a.end}`);
  const calc = st?.closing.tax;
  const preliminary = !calc;
  const company = data?.company;
  const sru = s && calc && company ? sruFiles({
    orgNr: company.orgNr, name: company.legalName, street: company.street, postalCode: company.postalCode, city: company.city, email: company.email, phone: company.phone,
    start: year.start, end: year.end, created: new Date(), forms: forms(s.fields, calc),
  }) : null;
  const ink = s && calc ? forms(s.fields, calc) : null;

  return (
    <>
      <PageHead title={y.title} actions={company ? <PdfActions label={r.pdf} fileName={`resultat-och-balansrakning-${year.end.slice(0, 4)}.pdf`} job={() => statementJob(ctx, year, preliminary)} /> : null}>
        <SectionTabs {...yearEndTabs(y)} />
      </PageHead>
      <p className="mb-4 text-sm text-muted">{r.intro}</p>
      {error && <p role="alert" className="text-[var(--error)]">{error}</p>}
      {!s ? <p role="status">{t.common.loading}</p> : (
        <div className="space-y-6">
          {preliminary && <p role="note" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">{r.preliminary}</p>}
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="card"><Table caption={r.income} rows={s.income} cur={label(year)} prev={prev ? label(prev) : null} /></section>
            <section className="card"><Table caption={r.balance} rows={s.balance} cur={label(year)} prev={prev ? label(prev) : null} /></section>
          </div>
          <section aria-labelledby="ye-sru" className="card space-y-4">
            <h2 id="ye-sru" className="text-lg font-semibold">{r.sru}</h2>
            <p className="text-sm">{r.sruText}</p>
            {!company ? <p className="text-muted">{r.sruNeedsCompany}</p> : !sru ? <p className="text-muted">{r.sruNeedsTax}</p> : (
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn btn-primary" onClick={() => download(sru.info, "INFO.SRU")}>{r.info}</button>
                <button type="button" className="btn btn-primary" onClick={() => download(sru.blanketter, "BLANKETTER.SRU")}>{r.forms}</button>
              </div>
            )}
            <p className="text-xs text-muted">{r.check}</p>
            {ink && (
              <div className="grid gap-6 md:grid-cols-3">
                <Fields caption={r.ink2} fields={ink[0].fields} />
                <Fields caption={r.ink2r} fields={ink[1].fields} />
                <Fields caption={r.ink2s} fields={ink[2].fields} />
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
