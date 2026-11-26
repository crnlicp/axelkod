// Försäljning sub-sections. The section landing, new documents and document pages belong
// to Fakturor (a quote's page is also under /sales/docs).
import { useAccT } from "../context";
import { SectionTabs, type Tab } from "./SectionTabs";

export function SalesTabs() {
  const t = useAccT().sales;
  const tabs: Tab[] = [
    ["/admin/accounting/sales/invoices", t.tabs.invoices, ["/admin/accounting/sales", "/admin/accounting/sales/docs", "/admin/accounting/sales/new"]],
    ["/admin/accounting/sales/quotes", t.tabs.quotes],
    ["/admin/accounting/sales/payments", t.tabs.payments], ["/admin/accounting/sales/reminders", t.tabs.reminders],
    ["/admin/accounting/sales/customers", t.tabs.customers], ["/admin/accounting/sales/items", t.tabs.items],
  ];
  return <SectionTabs label={t.title} tabs={tabs} />;
}
