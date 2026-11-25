// Inställningar: Företag · Bokföring · Kontoplan · Användare.
import { NavLink, useParams } from "react-router";
import { useAcc, useAccT } from "../../../admin/accounting/context";
import { useCrumbs } from "../../../admin/accounting/crumbs";
import { ChartTable, CompanyForm, LockDatePanel, SettingsForm, UsersPanel, YearsPanel } from "../../../admin/accounting/forms";
import { PageHead } from "../../../admin/accounting/ui/kit";

const TABS = ["company", "accounting", "chart", "users"] as const;
type Tab = (typeof TABS)[number];

export default function Settings() {
  const t = useAccT();
  const { href, isOwner } = useAcc();
  const { tab: param } = useParams();
  const tab: Tab = (TABS as readonly string[]).includes(param ?? "") ? (param as Tab) : "company";
  const tabs = TABS.filter((k) => k !== "users" || isOwner);
  useCrumbs([{ label: t.settings.title, to: "/admin/accounting/settings" }, { label: t.settings.tabs[tab] }]);

  return (
    <>
      <PageHead title={t.settings.title}>
        <nav aria-label={t.settings.title} className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map((k) => (
            <NavLink key={k} to={href(`/admin/accounting/settings/${k}`)} aria-current={k === tab ? "page" : undefined}
              className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 font-medium text-muted no-underline hover:text-fg aria-[current=page]:border-accent aria-[current=page]:text-accent">
              {t.settings.tabs[k]}
            </NavLink>
          ))}
        </nav>
      </PageHead>
      {tab === "company" && <CompanyForm />}
      {tab === "accounting" && <div className="space-y-6"><SettingsForm /><YearsPanel /><LockDatePanel /></div>}
      {tab === "chart" && <ChartTable />}
      {tab === "users" && <UsersPanel />}
    </>
  );
}
