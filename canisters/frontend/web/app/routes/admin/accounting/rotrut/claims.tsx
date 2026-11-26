// ROT/RUT › Begäran: claims for Skatteverket's e-service, and a new claim from draft
// cases of one type and one payment year (V12: never ROT and RUT in one file).
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CaseStatus, type Claim, type HusCase } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { SectionTabs, rotRutTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, Money, PageHead, StatusChip, input, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

export default function HusClaims() {
  const t = useAccT();
  const r = t.rotRut;
  const x = r.claims;
  const err = useErr();
  const navigate = useNavigate();
  const { acc, canBook, href } = useAcc();
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [cases, setCases] = useState<HusCase[]>([]);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: r.title, to: "/admin/accounting/rot-rut" }, { label: r.tabs.claims }]);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([acc.listHusClaims(), acc.listHusCases()]);
    setClaims(ok(a));
    setCases(ok(b));
  }, [acc]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);

  const drafts = cases.filter((c) => c.status === CaseStatus.draft);
  const first = drafts.find((c) => picked.has(String(c.id)));
  // Only cases of the same type and year as the first one picked can join it.
  const fits = (c: HusCase) => !first || (c.kind === first.kind && c.year === first.year);
  const requested = (cl: Claim) => cases.filter((c) => cl.caseIds.includes(c.id)).reduce((a, c) => a + c.requested, 0n);

  async function create() {
    setBusy(true);
    try {
      const c = ok(await acc.createHusClaim(name, drafts.filter((d) => picked.has(String(d.id))).map((d) => d.id)));
      navigate(href(`/admin/accounting/rot-rut/claims/${c.id}`), { state: { message: x.created } });
    } catch (e) { setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title={r.title}><SectionTabs {...rotRutTabs(r)} /></PageHead>
      <p className="mb-4 text-sm text-muted">{x.intro}</p>
      {canBook && drafts.length > 0 && (
        <form className="card mb-6 space-y-4" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <div className="max-w-sm">
            <label htmlFor="cl-name" className={label}>{x.name}</label>
            <input id="cl-name" className={input} maxLength={16} required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <fieldset>
            <legend className={label}>{x.pick}</legend>
            <ul className="mt-2 space-y-1">
              {drafts.map((c) => (
                <li key={String(c.id)}>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" disabled={!fits(c)} checked={picked.has(String(c.id))}
                      onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(String(c.id)); else n.delete(String(c.id)); setPicked(n); }} />
                    {r.cases.invoice} {String(c.invoiceNumber)} · {r.kind[c.kind]} {String(c.year)} · <Money ore={c.requested} /> kr
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <button type="submit" className="btn btn-primary" disabled={busy || !picked.size || !name.trim()}>{x.create}</button>
        </form>
      )}
      {!claims ? <p role="status">{t.common.loading}</p> : (
        <DataTable rows={claims} rowKey={(c) => String(c.id)} caption={r.tabs.claims} empty={<EmptyState text={x.empty} />}
          onOpen={(c) => navigate(href(`/admin/accounting/rot-rut/claims/${c.id}`))}
          columns={[
            { key: "n", title: t.common.name, render: (c) => c.name, value: (c) => c.name },
            { key: "k", title: r.editor.kind, render: (c) => r.kind[c.kind], value: (c) => c.kind },
            { key: "y", title: r.cases.year, render: (c) => String(c.year), value: (c) => c.year },
            { key: "c", title: x.cases, align: "right", secondary: true, render: (c) => String(c.caseIds.length), value: (c) => c.caseIds.length },
            { key: "r", title: x.requested, align: "right", render: (c) => <Money ore={requested(c)} />, value: (c) => requested(c) },
            { key: "v", title: x.version, secondary: true, render: (c) => c.xmlVersion, value: (c) => c.xmlVersion },
            { key: "s", title: t.payroll.runs.status, render: (c) => <StatusChip tone={c.submittedDate ? "good" : "neutral"}>{c.submittedDate ? `${x.submitted} ${c.submittedDate}` : x.notSubmitted}</StatusChip>, value: (c) => c.submittedDate ?? "" },
          ]} />
      )}
      <Toast status={status} />
    </>
  );
}
