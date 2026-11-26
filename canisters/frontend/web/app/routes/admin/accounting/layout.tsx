// Ekonomi workspace: master data, the sticky top bar and keyboard shortcuts.
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { FiscalYearStatus } from "../../../bindings/accounting";
import { AccProvider, today, useAcc, useAccT, yearKey } from "../../../admin/accounting/context";
import { CrumbProvider, useCrumbList } from "../../../admin/accounting/crumbs";
import { findVoucher } from "../../../admin/accounting/ledger";
import { daysUntil, upcoming } from "../../../admin/accounting/obligations";
import { Dialog } from "../../../admin/accounting/ui/Dialog";
import { ReadOnlyBanner, StatusChip } from "../../../admin/accounting/ui/kit";
import { AccSessionCtx } from "../../../admin/session";
import { IconBell, IconPlus, IconSearch } from "../../../components/Icons";

export function meta() {
  return [{ title: "Ekonomi – Axelkod" }, { name: "robots", content: "noindex, nofollow" }];
}

export default function AccountingLayout() {
  const session = useContext(AccSessionCtx);
  if (!session) return null; // the admin layout shows the no-access view
  return (
    <AccProvider session={session}>
      <CrumbProvider>
        <Workspace />
      </CrumbProvider>
    </AccProvider>
  );
}

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || !!el.closest("dialog[open]");
};

function Workspace() {
  const t = useAccT();
  const ctx = useAcc();
  const { data, loadError, year, readOnly, canBook } = ctx;
  const navigate = useNavigate();
  const { search: qs } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); return; }
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") { e.preventDefault(); setHelpOpen(true); }
      if (e.key === "n" && canBook) { e.preventDefault(); navigate(`/admin/accounting/ledger/new${qs}`); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, qs, canBook]);

  const deadlines = useMemo(() => (data ? upcoming(data.settings, data.years, today()) : []), [data]);
  const soon = deadlines.filter((d) => daysUntil(today(), d.due) <= 14).length;

  if (loadError) return <p role="alert" className="card text-[var(--error)]">{loadError}</p>;
  if (!data) return <p role="status">{t.common.loading}</p>;

  const statusTone = { open: "good", closing: "warn", locked: "neutral" } as const;

  return (
    <>
      <div className="sticky top-0 z-20 -mx-5 -mt-8 mb-6 border-b border-border bg-surface/95 px-5 py-3 backdrop-blur lg:-mx-10 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <Breadcrumb />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {data.years.length > 0 && year && (
              <label className="flex items-center gap-2 text-sm">
                <span className="sr-only">{t.shell.year}</span>
                <select value={yearKey(year)} onChange={(e) => { const y = data.years.find((x) => yearKey(x) === e.target.value); if (y) ctx.setYear(y); }}
                  className="rounded-full border border-border bg-bg px-3 py-1.5 font-semibold" aria-label={t.shell.year}>
                  {data.years.map((y) => <option key={String(y.id)} value={yearKey(y)}>{yearKey(y)}</option>)}
                </select>
                <StatusChip tone={statusTone[year.status]}>{t.status[year.status as FiscalYearStatus]}</StatusChip>
              </label>
            )}
            <button type="button" onClick={() => setSearchOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 text-sm text-muted hover:text-fg">
              <IconSearch className="h-4 w-4" /> {t.shell.search} <kbd className="hidden rounded border border-border px-1 text-xs sm:inline">Ctrl K</kbd>
            </button>
            {canBook && <NewMenu />}
            <button type="button" onClick={() => setBellOpen(true)} aria-label={soon ? t.shell.deadlinesCount(soon) : t.shell.deadlines}
              className="relative grid h-9 w-9 place-items-center rounded-full border border-border bg-bg hover:text-accent">
              <IconBell className="h-5 w-5" />
              {soon > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 rounded-full bg-[var(--color-teal-500)] px-1.5 text-xs font-semibold text-[var(--color-navy-900)]">{soon}</span>}
            </button>
          </div>
        </div>
      </div>
      {readOnly && <ReadOnlyBanner />}
      <Outlet />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title={t.shell.shortcuts}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          {t.shell.shortcutList.map(([k, v]) => (
            <div key={k} className="contents"><dt><kbd className="rounded border border-border px-1.5 py-0.5 text-sm">{k}</kbd></dt><dd>{v}</dd></div>
          ))}
        </dl>
      </Dialog>
      <Dialog open={bellOpen} onClose={() => setBellOpen(false)} title={t.shell.deadlines}>
        <DeadlineList items={deadlines} />
      </Dialog>
    </>
  );
}

function Breadcrumb() {
  const t = useAccT();
  const crumbs = useCrumbList();
  const { search } = useLocation();
  return (
    <nav aria-label={t.shell.breadcrumb} className="min-w-0 text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-muted">
        <li><Link to={`/admin/accounting${search}`} className="text-muted no-underline hover:text-fg">{t.nav.label}</Link></li>
        {crumbs.map((c, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span aria-hidden="true">›</span>
            {c.to && i < crumbs.length - 1
              ? <Link to={`${c.to}${search}`} className="text-muted no-underline hover:text-fg">{c.label}</Link>
              : <span aria-current={i === crumbs.length - 1 ? "page" : undefined} className="font-semibold text-fg">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function NewMenu() {
  const t = useAccT();
  const { search } = useLocation();
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");
  return (
    <details ref={ref} className="relative" onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <summary className="btn btn-primary cursor-pointer list-none px-4 py-1.5 text-sm [&::-webkit-details-marker]:hidden">
        <IconPlus className="h-4 w-4" /> {t.shell.new}
      </summary>
      <ul className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-border bg-[var(--bg-elev)] p-1 shadow-xl">
        <li><Link onClick={close} to={`/admin/accounting/sales/new${search}${search ? "&" : "?"}kind=invoice`} className="block rounded-lg px-3 py-2 text-fg no-underline hover:bg-surface-strong">{t.sales.kind.invoice}</Link></li>
        <li><Link onClick={close} to={`/admin/accounting/sales/new${search}${search ? "&" : "?"}kind=quote`} className="block rounded-lg px-3 py-2 text-fg no-underline hover:bg-surface-strong">{t.sales.kind.quote}</Link></li>
        <li><Link onClick={close} to={`/admin/accounting/purchases${search}`} className="block rounded-lg px-3 py-2 text-fg no-underline hover:bg-surface-strong">{t.purchases.kind.supplierInvoice}</Link></li>
        <li><Link onClick={close} to={`/admin/accounting/ledger/new${search}`} className="block rounded-lg px-3 py-2 text-fg no-underline hover:bg-surface-strong">{t.shell.newVoucher}</Link></li>
        <li><Link onClick={close} to={`/admin/accounting/ledger/new${search}${search ? "&" : "?"}upload=1`} className="block rounded-lg px-3 py-2 text-fg no-underline hover:bg-surface-strong">{t.shell.newUpload}</Link></li>
      </ul>
    </details>
  );
}

export function DeadlineList({ items, max }: { items: ReturnType<typeof upcoming>; max?: number }) {
  const t = useAccT();
  const label = (o: (typeof items)[number]) => (o.kind === "vat" ? t.deadline.vat(o.period) : o.kind === "agi" ? t.deadline.agi(o.period) : t.deadline.prel(o.period));
  if (!items.length) return <p className="text-muted">{t.shell.deadlinesNone}</p>;
  return (
    <>
      <ul className="divide-y divide-border">
        {items.slice(0, max).map((o) => {
          const n = daysUntil(today(), o.due);
          return (
            <li key={`${o.kind}-${o.period}`} className="flex items-center justify-between gap-3 py-2">
              <span>{label(o)}</span>
              <span className="text-right text-sm"><time dateTime={o.due} className="font-semibold">{o.due}</time> <span className={n <= 7 ? "text-[var(--error)]" : "text-muted"}>({t.deadline.days(n)})</span></span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">{t.deadline.note}</p>
    </>
  );
}

const PAGES = (t: ReturnType<typeof useAccT>) => [
  { label: t.nav.overview, to: "/admin/accounting" },
  { label: t.sales.tabs.invoices, to: "/admin/accounting/sales/invoices" },
  { label: t.sales.tabs.quotes, to: "/admin/accounting/sales/quotes" },
  { label: t.sales.tabs.customers, to: "/admin/accounting/sales/customers" },
  { label: t.sales.tabs.reminders, to: "/admin/accounting/sales/reminders" },
  { label: t.purchases.tabs.inbox, to: "/admin/accounting/purchases" },
  { label: t.purchases.tabs.invoices, to: "/admin/accounting/purchases/invoices" },
  { label: t.purchases.tabs.receipts, to: "/admin/accounting/purchases/receipts" },
  { label: t.purchases.tabs.suppliers, to: "/admin/accounting/purchases/suppliers" },
  { label: t.bank.tabs.transactions, to: "/admin/accounting/bank" },
  { label: t.bank.tabs.import, to: "/admin/accounting/bank/import" },
  { label: t.bank.tabs.rules, to: "/admin/accounting/bank/rules" },
  { label: t.bank.tabs.tax, to: "/admin/accounting/bank/tax" },
  { label: t.vat.tabs.returns, to: "/admin/accounting/vat" },
  { label: t.vat.tabs.ecSales, to: "/admin/accounting/vat/ec-sales" },
  { label: t.ledger.tabs.vouchers, to: "/admin/accounting/ledger" },
  { label: t.ledger.tabs.journal, to: "/admin/accounting/ledger/journal" },
  { label: t.ledger.tabs.general, to: "/admin/accounting/ledger/general" },
  { label: t.ledger.tabs.trial, to: "/admin/accounting/ledger/trial-balance" },
  { label: t.ledger.newVoucher, to: "/admin/accounting/ledger/new" },
  { label: t.settings.title, to: "/admin/accounting/settings" },
];

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useAccT();
  const { acc, year } = useAcc();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [q, setQ] = useState("");
  const [hit, setHit] = useState<{ label: string; to: string } | null>(null);
  useEffect(() => { if (!open) { setQ(""); setHit(null); } }, [open]);

  useEffect(() => {
    const m = /^\s*([A-Za-z])\s*-?\s*(\d+)\s*$/.exec(q);
    if (!m || !year) { setHit(null); return; }
    let live = true;
    void findVoucher(acc, year.id, m[1].toUpperCase(), BigInt(m[2])).then((v) => {
      if (live) setHit(v ? { label: `${v.series}-${v.number} · ${v.eventDate} · ${v.description}`, to: `/admin/accounting/ledger/${v.id}` } : null);
    }).catch(() => live && setHit(null));
    return () => { live = false; };
  }, [q, acc, year]);

  const pages = PAGES(t).filter((p) => q.trim() && p.label.toLowerCase().includes(q.trim().toLowerCase()));
  const results = [...(hit ? [hit] : []), ...pages];
  const go = (to: string) => { onClose(); navigate(`${to}${search}`); };

  return (
    <Dialog open={open} onClose={onClose} title={t.shell.search}>
      <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.shell.searchHint} placeholder={t.shell.searchHint}
        onKeyDown={(e) => { if (e.key === "Enter" && results[0]) go(results[0].to); }}
        className="w-full rounded-md border border-[var(--input-border)] bg-bg px-3 py-2" />
      <ul className="mt-3 space-y-1" aria-live="polite">
        {results.map((r) => (
          <li key={r.to}><button type="button" onClick={() => go(r.to)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-surface-strong">{r.label}</button></li>
        ))}
        {q.trim() && !results.length && <li className="px-3 py-2 text-muted">{t.shell.searchNone}</li>}
      </ul>
    </Dialog>
  );
}
