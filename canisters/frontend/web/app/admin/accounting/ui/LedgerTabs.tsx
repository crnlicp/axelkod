// Bokföring sub-sections. Voucher pages and the new-voucher editor belong to Verifikationer,
// an account's ledger to Huvudbok.
import { useAccT } from "../context";
import { SectionTabs, type Tab } from "./SectionTabs";

export function LedgerTabs() {
  const l = useAccT().ledger;
  const t = l.tabs;
  const tabs: Tab[] = [
    ["/admin/accounting/ledger", t.vouchers], ["/admin/accounting/ledger/drafts", t.drafts], ["/admin/accounting/ledger/journal", t.journal],
    ["/admin/accounting/ledger/general", t.general, ["/admin/accounting/ledger/accounts"]], ["/admin/accounting/ledger/trial-balance", t.trial],
  ];
  return <SectionTabs label={l.title} tabs={tabs} />;
}
