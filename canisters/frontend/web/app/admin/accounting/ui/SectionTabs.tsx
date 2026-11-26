// Sub-sections of a page group as a tab row of links. The current tab is the one whose
// path (or one of its `also` paths) is the longest prefix of the URL, so a section's
// landing page and its detail pages mark a tab too.
import { Link, useLocation } from "react-router";
import { useAcc } from "../context";

/** [path, label] or [path, label, extra path prefixes that also select the tab]. */
export type Tab = readonly [string, string] | readonly [string, string, readonly string[]];

export function currentTab(pathname: string, tabs: readonly Tab[]): string | null {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  let best: { to: string; len: number } | null = null;
  for (const t of tabs) for (const p of [t[0], ...(t[2] ?? [])]) if (under(p) && (!best || p.length > best.len)) best = { to: t[0], len: p.length };
  return best?.to ?? null;
}

export function SectionTabs({ label, tabs }: { label: string; tabs: readonly Tab[] }) {
  const { href } = useAcc();
  const { pathname } = useLocation();
  const current = currentTab(pathname, tabs);
  return (
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(([to, text]) => (
        <Link key={to} to={href(to)} aria-current={current === to ? "page" : undefined}
          className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 font-medium text-muted no-underline hover:text-fg aria-[current=page]:border-accent aria-[current=page]:text-accent">
          {text}
        </Link>
      ))}
    </nav>
  );
}

export const purchaseTabs = (t: { title: string; tabs: Record<"inbox" | "invoices" | "receipts" | "suppliers", string> }) => ({
  label: t.title,
  tabs: [
    ["/admin/accounting/purchases", t.tabs.inbox, ["/admin/accounting/purchases/book"]], ["/admin/accounting/purchases/invoices", t.tabs.invoices],
    ["/admin/accounting/purchases/receipts", t.tabs.receipts], ["/admin/accounting/purchases/suppliers", t.tabs.suppliers],
  ] as const,
});

export const bankTabs = (t: { title: string; tabs: Record<"transactions" | "import" | "rules" | "tax", string> }) => ({
  label: t.title,
  tabs: [
    ["/admin/accounting/bank", t.tabs.transactions], ["/admin/accounting/bank/import", t.tabs.import],
    ["/admin/accounting/bank/rules", t.tabs.rules], ["/admin/accounting/bank/tax", t.tabs.tax],
  ] as const,
});

export const vatTabs = (t: { title: string; tabs: Record<"returns" | "ecSales", string> }) => ({
  label: t.title,
  tabs: [["/admin/accounting/vat", t.tabs.returns], ["/admin/accounting/vat/ec-sales", t.tabs.ecSales]] as const,
});

export const rotRutTabs = (t: { title: string; tabs: Record<"cases" | "claims" | "settings", string> }) => ({
  label: t.title,
  tabs: [["/admin/accounting/rot-rut", t.tabs.cases], ["/admin/accounting/rot-rut/claims", t.tabs.claims], ["/admin/accounting/rot-rut/settings", t.tabs.settings]] as const,
});

export const payrollTabs = (t: { title: string; tabs: Record<"runs" | "employees" | "agi" | "vaxa" | "settings", string> }) => ({
  label: t.title,
  tabs: [
    ["/admin/accounting/payroll", t.tabs.runs, ["/admin/accounting/payroll/runs"]], ["/admin/accounting/payroll/employees", t.tabs.employees], ["/admin/accounting/payroll/agi", t.tabs.agi],
    ["/admin/accounting/payroll/vaxa", t.tabs.vaxa], ["/admin/accounting/payroll/settings", t.tabs.settings],
  ] as const,
});

/** Lager and Inventering only when the inventory module is on (D7). */
export const assetTabs = (t: { title: string; tabs: Record<"register" | "stock" | "counts", string> }, inventory: boolean) => ({
  label: t.title,
  tabs: [
    ["/admin/accounting/assets", t.tabs.register] as const,
    ...(inventory ? [["/admin/accounting/assets/inventory", t.tabs.stock] as const, ["/admin/accounting/assets/counts", t.tabs.counts] as const] : []),
  ],
});

export const yearEndTabs = (t: { title: string; tabs: Record<"checklist" | "reports" | "opening", string> }) => ({
  label: t.title,
  tabs: [
    ["/admin/accounting/year-end", t.tabs.checklist], ["/admin/accounting/year-end/reports", t.tabs.reports], ["/admin/accounting/year-end/opening", t.tabs.opening],
  ] as const,
});
