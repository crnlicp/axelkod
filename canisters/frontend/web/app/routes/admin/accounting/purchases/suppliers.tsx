// Leverantörer: list with an edit dialog.
import { useCallback, useEffect, useState } from "react";
import type { Supplier, SupplierInput } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { SectionTabs, purchaseTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EMPTY_SUPPLIER, SupplierDialog } from "../../../../admin/accounting/ui/SupplierDialog";
import { EmptyState, PageHead } from "../../../../admin/accounting/ui/kit";
import { IconPlus } from "../../../../components/Icons";
import { Toast } from "../../../../admin/toast";

export default function Suppliers() {
  const t = useAccT();
  const p = t.purchases;
  const s = p.suppliers;
  const err = useErr();
  const { acc, canBook, accountName } = useAcc();
  const [rows, setRows] = useState<Supplier[] | null>(null);
  const [edit, setEdit] = useState<{ id: bigint | null; v: SupplierInput } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: p.title, to: "/admin/accounting/purchases" }, { label: p.tabs.suppliers }]);
  const load = useCallback(() => acc.listSuppliers().then((r) => setRows(ok(r))).catch((e) => setStatus({ ok: false, text: err(e) })), [acc, err]);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHead title={p.title} actions={canBook ? <button type="button" className="btn btn-primary" onClick={() => setEdit({ id: null, v: EMPTY_SUPPLIER })}><IconPlus className="h-5 w-5" /> {s.new}</button> : null}>
        <SectionTabs {...purchaseTabs(p)} />
      </PageHead>
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(x) => String(x.id)} caption={p.tabs.suppliers} csvName="leverantorer" empty={<EmptyState text={s.empty} />}
          onOpen={canBook ? (x) => { const { id, ...v } = x; setEdit({ id, v }); } : undefined}
          columns={[
            { key: "n", title: s.name, render: (x) => x.name, value: (x) => x.name },
            { key: "o", title: s.orgNr, render: (x) => x.orgNr ?? "", value: (x) => x.orgNr ?? "" },
            { key: "c", title: s.country, secondary: true, render: (x) => x.country, value: (x) => x.country },
            { key: "a", title: s.defaultAccount, secondary: true, render: (x) => (x.defaultAccount ? `${x.defaultAccount} ${accountName(x.defaultAccount)}` : ""), value: (x) => Number(x.defaultAccount ?? 0n) },
            { key: "t", title: s.treatment, secondary: true, render: (x) => p.treatment[x.treatment], value: (x) => x.treatment },
          ]} />
      )}
      {edit && <SupplierDialog id={edit.id} initial={edit.v} onClose={() => setEdit(null)}
        onSaved={async () => { setEdit(null); setStatus({ ok: true, text: s.saved }); await load(); }} />}
      <Toast status={status} />
    </>
  );
}
