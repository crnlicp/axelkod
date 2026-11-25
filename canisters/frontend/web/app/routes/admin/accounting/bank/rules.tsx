// Bank › Regler: "text contains X → account Y" (with included VAT split to 2641).
import { useCallback, useEffect, useState } from "react";
import type { Rule, RuleInput } from "../../../../bindings/accounting";
import { errField, ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { RATES } from "../../../../admin/accounting/purchases";
import { AccountPicker } from "../../../../admin/accounting/ui/AccountPicker";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { SectionTabs, bankTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, PageHead, input, label } from "../../../../admin/accounting/ui/kit";
import { IconPlus } from "../../../../components/Icons";
import { Toast } from "../../../../admin/toast";

const EMPTY: RuleInput = { contains: "", account: 0n, vatRateBp: 0n, description: "" };

export default function Rules() {
  const t = useAccT();
  const b = t.bank;
  const r = b.rules;
  const err = useErr();
  const { acc, canBook, accountName } = useAcc();
  const [rows, setRows] = useState<Rule[] | null>(null);
  const [edit, setEdit] = useState<{ id: bigint | null; v: RuleInput } | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: b.title, to: "/admin/accounting/bank" }, { label: b.tabs.rules }]);
  const load = useCallback(() => acc.listBankRules().then((x) => setRows(ok(x))).catch((e) => setStatus({ ok: false, text: err(e) })), [acc, err]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!edit) return;
    try {
      ok(await acc.saveBankRule(edit.id, edit.v));
      setEdit(null); setBad(null); setStatus({ ok: true, text: r.saved }); await load();
    } catch (e) { setBad(errField(e)); setStatus({ ok: false, text: err(e) }); }
  }
  async function remove(id: bigint) {
    try { ok(await acc.deleteBankRule(id)); setEdit(null); setStatus({ ok: true, text: r.deleted }); await load(); } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }

  return (
    <>
      <PageHead title={b.title} actions={canBook ? <button type="button" className="btn btn-primary" onClick={() => setEdit({ id: null, v: EMPTY })}><IconPlus className="h-5 w-5" /> {r.new}</button> : null}>
        <SectionTabs {...bankTabs(b)} />
      </PageHead>
      <p className="mb-4 text-muted">{r.intro}</p>
      {!rows ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={rows} rowKey={(x) => String(x.id)} caption={b.tabs.rules} csvName="bankregler" empty={<EmptyState text={r.empty} />}
          onOpen={canBook ? (x) => { const { id, ...v } = x; setEdit({ id, v }); } : undefined}
          columns={[
            { key: "c", title: r.contains, render: (x) => x.contains, value: (x) => x.contains },
            { key: "a", title: r.account, render: (x) => `${x.account} ${accountName(x.account)}`, value: (x) => Number(x.account) },
            { key: "v", title: r.vat, render: (x) => `${Number(x.vatRateBp) / 100} %`, value: (x) => Number(x.vatRateBp) },
            { key: "d", title: r.description, secondary: true, render: (x) => x.description, value: (x) => x.description },
          ]} />
      )}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id === null ? r.new : r.edit}
        footer={<>
          {edit?.id != null && <button type="button" className="btn btn-secondary mr-auto" onClick={() => void remove(edit.id!)}>{t.common.remove}</button>}
          <button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>{t.common.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>{t.common.save}</button>
        </>}>
        {edit && (
          <div className="space-y-4">
            <div><label htmlFor="ru-c" className={label}>{r.contains}</label><input id="ru-c" className={input} maxLength={100} value={edit.v.contains} aria-invalid={bad === "contains" || undefined} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, contains: e.target.value } })} /></div>
            <AccountPicker labelText={r.account} value={edit.v.account || null} invalid={bad === "account"} onChange={(a) => setEdit({ ...edit, v: { ...edit.v, account: a?.number ?? 0n } })} />
            <div><label htmlFor="ru-v" className={label}>{r.vat}</label>
              <select id="ru-v" className={input} value={String(edit.v.vatRateBp)} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, vatRateBp: BigInt(e.target.value) } })}>
                {[0n, ...RATES.filter((x) => x > 0n)].map((x) => <option key={String(x)} value={String(x)}>{Number(x) / 100} %</option>)}
              </select></div>
            <div><label htmlFor="ru-d" className={label}>{r.description}</label><input id="ru-d" className={input} maxLength={200} value={edit.v.description} aria-invalid={bad === "description" || undefined} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, description: e.target.value } })} /></div>
          </div>
        )}
      </Dialog>
      <Toast status={status} />
    </>
  );
}
