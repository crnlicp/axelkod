// Utkast: saved drafts, oldest first; drafts take no number until posted.
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { VoucherDraft } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { sumPositive } from "../../../../admin/accounting/ledger";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { LedgerTabs } from "../../../../admin/accounting/ui/LedgerTabs";
import { EmptyState, Money, PageHead, fmtTime } from "../../../../admin/accounting/ui/kit";
import { useAdminLang } from "../../../../admin/i18n";
import { Toast } from "../../../../admin/toast";

export default function Drafts() {
  const t = useAccT();
  const err = useErr();
  const { acc, href } = useAcc();
  const { t: at } = useAdminLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState<VoucherDraft[] | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>((location.state as { posted?: string } | null)?.posted ? { ok: true, text: (location.state as { posted: string }).posted } : null);
  useCrumbs([{ label: t.ledger.title, to: "/admin/accounting/ledger" }, { label: t.ledger.tabs.drafts }]);

  useEffect(() => {
    acc.listDrafts().then((r) => setRows([...ok(r)].sort((a, b) => Number(a.updatedAt - b.updatedAt)))).catch((e) => setStatus({ ok: false, text: err(e) }));
  }, [acc, err]);

  return (
    <>
      <PageHead title={t.ledger.title}><LedgerTabs /></PageHead>
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(d) => String(d.id)} caption={t.ledger.tabs.drafts} empty={<EmptyState text={t.ledger.emptyDrafts} />}
          onOpen={(d) => navigate(href(`/admin/accounting/ledger/new?draft=${d.id}`))}
          columns={[
            { key: "id", title: t.common.number, render: (d) => String(d.id), value: (d) => d.id },
            { key: "series", title: t.common.series, render: (d) => d.series, value: (d) => d.series },
            { key: "date", title: t.common.date, render: (d) => d.eventDate, value: (d) => d.eventDate },
            { key: "text", title: t.common.text, render: (d) => d.description, value: (d) => d.description },
            { key: "amount", title: t.common.amount, align: "right", render: (d) => <Money ore={sumPositive(d.lines.map((l) => l.amount))} />, value: (d) => sumPositive(d.lines.map((l) => l.amount)) },
            { key: "updated", title: t.editor.draftSaved("").trim(), secondary: true, render: (d) => fmtTime(d.updatedAt, at.locale), value: (d) => d.updatedAt },
          ]} />
      )}
      <Toast status={status} />
    </>
  );
}
