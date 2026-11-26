// Sub-sections of a page group (Inköp, Bank & skattekonto) as a tab row of links.
import { NavLink } from "react-router";
import { useAcc } from "../context";

export function SectionTabs({ label, tabs }: { label: string; tabs: readonly (readonly [string, string])[] }) {
  const { href } = useAcc();
  return (
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(([to, text]) => (
        <NavLink key={to} to={href(to)} end
          className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 font-medium text-muted no-underline hover:text-fg aria-[current=page]:border-accent aria-[current=page]:text-accent">
          {text}
        </NavLink>
      ))}
    </nav>
  );
}

export const purchaseTabs = (t: { title: string; tabs: Record<"inbox" | "invoices" | "receipts" | "suppliers", string> }) => ({
  label: t.title,
  tabs: [
    ["/admin/accounting/purchases", t.tabs.inbox], ["/admin/accounting/purchases/invoices", t.tabs.invoices],
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
