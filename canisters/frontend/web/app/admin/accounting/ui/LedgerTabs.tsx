// Bokföring sub-sections as a tab row of links.
import { NavLink } from "react-router";
import { useAcc, useAccT } from "../context";

export function LedgerTabs() {
  const t = useAccT().ledger.tabs;
  const { href } = useAcc();
  const tabs = [
    ["/admin/accounting/ledger", t.vouchers], ["/admin/accounting/ledger/drafts", t.drafts], ["/admin/accounting/ledger/journal", t.journal],
    ["/admin/accounting/ledger/general", t.general], ["/admin/accounting/ledger/trial-balance", t.trial],
  ] as const;
  return (
    <nav aria-label={useAccT().ledger.title} className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(([to, label]) => (
        <NavLink key={to} to={href(to)} end
          className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 font-medium text-muted no-underline hover:text-fg aria-[current=page]:border-accent aria-[current=page]:text-accent">
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
