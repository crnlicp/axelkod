// Betalningar: registered customer payments, newest first.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Payment } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { plainOre } from "../../../../admin/accounting/money";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { SalesTabs } from "../../../../admin/accounting/ui/SalesTabs";
import { DocRef, EmptyState, Money, PageHead } from "../../../../admin/accounting/ui/kit";

export default function Payments() {
  const t = useAccT();
  const s = t.sales;
  const err = useErr();
  const { acc, href } = useAcc();
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useCrumbs([{ label: s.title, to: "/admin/accounting/sales/invoices" }, { label: s.tabs.payments }]);
  useEffect(() => { acc.listPayments(0n, 200n).then((r) => setRows(ok(r).items)).catch((e) => setError(err(e))); }, [acc, err]);
  return (
    <>
      <PageHead title={s.title}><SalesTabs /></PageHead>
      {error && <p role="alert" className="text-[var(--error)]">{error}</p>}
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(p) => String(p.id)} caption={s.tabs.payments} csvName="betalningar" empty={<EmptyState text={s.payment.empty} />}
          columns={[
            { key: "d", title: s.payment.date, render: (p) => p.date, value: (p) => p.date },
            { key: "i", title: s.payment.invoice, render: (p) => <Link to={href(`/admin/accounting/sales/docs/${p.salesDocId}`)}>#{String(p.salesDocId)}</Link>, value: (p) => p.salesDocId },
            { key: "m", title: s.payment.method, render: (p) => s.payment.methods[p.method], value: (p) => p.method },
            { key: "r", title: s.payment.reference, secondary: true, render: (p) => p.reference ?? "", value: (p) => p.reference ?? "" },
            { key: "a", title: t.common.amount, align: "right", render: (p) => <Money ore={p.amount} />, value: (p) => p.amount, csv: (p) => plainOre(p.amount) },
            { key: "v", title: t.sales.doc.voucher, render: (p) => <DocRef id={p.voucherId} label={`#${p.voucherId}`} search={href("")} /> },
          ]} />
      )}
    </>
  );
}
