// Fakturor (with credit notes) or Offerter: drafts on top, then issued documents newest first.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useMatches, useNavigate } from "react-router";
import { DocKind, type DocSummary, type SalesDraft } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { plainOre } from "../../../../admin/accounting/money";
import { statusOf } from "../../../../admin/accounting/sales";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { SalesTabs } from "../../../../admin/accounting/ui/SalesTabs";
import { EmptyState, Money, PageHead, StatusChip } from "../../../../admin/accounting/ui/kit";
import { IconPlus } from "../../../../components/Icons";
import { Toast } from "../../../../admin/toast";

type Filter = "all" | "unpaid" | "overdue" | "credit";

export default function SalesList() {
  const t = useAccT();
  const s = t.sales;
  const err = useErr();
  const { acc, href, canBook } = useAcc();
  const navigate = useNavigate();
  const location = useLocation();
  const quotes = useMatches().some((m) => m.id === "acc-quotes");
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [drafts, setDrafts] = useState<SalesDraft[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>((location.state as { message?: string } | null)?.message ? { ok: true, text: (location.state as { message: string }).message } : null);
  useCrumbs([{ label: s.title, to: "/admin/accounting/sales/invoices" }, { label: quotes ? s.tabs.quotes : s.tabs.invoices }]);

  useEffect(() => {
    let live = true;
    setDocs(null);
    (async () => {
      const kinds = quotes ? [DocKind.quote] : [DocKind.invoice, DocKind.creditNote];
      const all: DocSummary[] = [];
      for (const k of kinds) {
        for (let off = 0n; ; off += 200n) {
          const page = ok(await acc.listSalesDocs(k, off, 200n));
          all.push(...page.items);
          if (all.filter((d) => d.kind === k).length >= Number(page.total) || !page.items.length) break;
        }
      }
      const ds = ok(await acc.listSalesDrafts()).filter((d) => (quotes ? d.kind === DocKind.quote : d.kind !== DocKind.quote));
      if (live) { setDocs(all.sort((a, b) => Number(b.id - a.id))); setDrafts(ds); }
    })().catch((e) => live && setStatus({ ok: false, text: err(e) }));
    return () => { live = false; };
  }, [acc, quotes, err]);

  const shown = useMemo(() => (docs ?? []).filter((d) =>
    filter === "all" ? true : filter === "credit" ? d.kind === DocKind.creditNote : filter === "overdue" ? d.status.__kind__ === "overdue" : d.kind === DocKind.invoice && d.balance > 0n,
  ), [docs, filter]);

  const kind = quotes ? "quote" : "invoice";
  const newBtn = canBook ? (
    <Link to={href(`/admin/accounting/sales/new?kind=${kind}`)} className="btn btn-primary"><IconPlus className="h-5 w-5" /> {quotes ? s.newQuote : s.newInvoice}</Link>
  ) : null;

  return (
    <>
      <PageHead title={s.title} actions={newBtn}><SalesTabs /></PageHead>
      {drafts.length > 0 && (
        <section className="card mb-6" aria-labelledby="sd-h">
          <h2 id="sd-h" className="text-xl">{s.drafts}</h2>
          <ul className="mt-2 space-y-1">
            {drafts.map((d) => (
              <li key={String(d.id)}>
                <Link to={href(`/admin/accounting/sales/new?draft=${d.id}`)}>{s.kind[d.kind]} · {s.editor.draft(Number(d.id))}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!quotes && (
        <div role="group" aria-label="Status" className="mb-4 flex flex-wrap gap-2">
          {(["all", "unpaid", "overdue", "credit"] as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className="rounded-full border border-border px-3 py-1 text-sm text-muted hover:text-fg aria-pressed:border-accent aria-pressed:bg-[var(--brand-soft)] aria-pressed:text-accent">
              {s.filter[f]}
            </button>
          ))}
        </div>
      )}
      {!docs ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={shown} rowKey={(d) => String(d.id)} caption={quotes ? s.tabs.quotes : s.tabs.invoices} csvName={quotes ? "offerter" : "fakturor"}
          onOpen={(d) => navigate(href(`/admin/accounting/sales/docs/${d.id}`))}
          empty={<EmptyState text={quotes ? s.emptyQuotes : s.emptyInvoices} action={newBtn} />}
          columns={[
            { key: "n", title: s.number, render: (d) => <span className="font-mono">{String(d.number)}</span>, value: (d) => d.number },
            { key: "k", title: t.common.text, secondary: true, render: (d) => s.kind[d.kind], value: (d) => s.kind[d.kind] },
            { key: "c", title: s.customer, render: (d) => d.customerName, value: (d) => d.customerName },
            { key: "d", title: s.issueDate, render: (d) => d.issueDate, value: (d) => d.issueDate },
            { key: "due", title: quotes ? s.validUntil : s.due, render: (d) => d.dueDate ?? "", value: (d) => d.dueDate ?? "" },
            { key: "t", title: s.total, align: "right", render: (d) => <><Money ore={d.total} /> {d.currency !== "SEK" ? d.currency : ""}</>, value: (d) => d.total, csv: (d) => plainOre(d.total) },
            ...(!quotes ? [{ key: "b", title: s.balance, align: "right" as const, render: (d: DocSummary) => (d.kind === DocKind.invoice ? <Money ore={d.balance} /> : null), value: (d: DocSummary) => d.balance, csv: (d: DocSummary) => plainOre(d.balance) }] : []),
            { key: "s", title: "Status", render: (d) => { const x = statusOf(d.status); return <StatusChip tone={x.tone}>{s.status[x.key]}</StatusChip>; }, value: (d) => statusOf(d.status).key },
          ]} />
      )}
      <Toast status={status} />
    </>
  );
}
