// Försäljning sub-sections as a tab row of links.
import { NavLink } from "react-router";
import { useAcc, useAccT } from "../context";

export function SalesTabs() {
  const t = useAccT().sales;
  const { href } = useAcc();
  const tabs = [
    ["/admin/accounting/sales/invoices", t.tabs.invoices], ["/admin/accounting/sales/quotes", t.tabs.quotes],
    ["/admin/accounting/sales/payments", t.tabs.payments], ["/admin/accounting/sales/reminders", t.tabs.reminders],
    ["/admin/accounting/sales/customers", t.tabs.customers], ["/admin/accounting/sales/items", t.tabs.items],
  ] as const;
  return (
    <nav aria-label={t.title} className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(([to, label]) => (
        <NavLink key={to} to={href(to)} end
          className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 font-medium text-muted no-underline hover:text-fg aria-[current=page]:border-accent aria-[current=page]:text-accent">
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
