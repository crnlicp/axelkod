// Moms › Periodisk sammanställning: rows per buyer VAT number from issued EU invoices,
// the SKV574008 file for Filöverföring, and "mark as filed" which freezes the rows (V4).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { EslPreview } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { meta } from "../../../../admin/accounting/ledger";
import { saveFile } from "../../../../admin/accounting/pdf/client";
import { eslCode, eslFile, eslPeriods, latin1 } from "../../../../admin/accounting/vat";
import { DataTable } from "../../../../admin/accounting/ui/DataTable";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { SectionTabs, vatTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, PageHead, fmtTime, input, label } from "../../../../admin/accounting/ui/kit";
import { useAdminLang } from "../../../../admin/i18n";
import { Toast } from "../../../../admin/toast";

export default function EcSales() {
  const t = useAccT();
  const v = t.vat;
  const x = v.ecSales;
  const err = useErr();
  const ctx = useAcc();
  const { acc, data, canBook } = ctx;
  const { t: at } = useAdminLang();
  const [params, setParams] = useSearchParams();
  const quarterly = params.get("k") === "q";
  const periods = useMemo(() => eslPeriods(quarterly, today()), [quarterly]);
  const selected = periods.find((p) => p.from === params.get("p")) ?? periods[1] ?? periods[0];
  const [preview, setPreview] = useState<EslPreview | null>(null);
  const [contact, setContact] = useState({ name: "", phone: data?.company?.phone ?? "", email: data?.company?.email ?? "", receipt: "" });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: v.title, to: "/admin/accounting/vat" }, { label: v.tabs.ecSales }]);

  const load = useCallback(async () => {
    setPreview(null);
    setPreview(ok(await acc.ecSalesPreview(selected.from, selected.to)));
  }, [acc, selected.from, selected.to]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);

  const filed = preview?.filed;
  const rows = preview?.rows ?? [];
  const hasGoods = rows.some((r) => r.goods !== 0n);
  const c = filed ? { name: filed.contactName, phone: filed.phone, email: filed.email ?? "" } : contact;
  const vatNr = data?.company?.vatNr ?? "";
  const fileName = `periodisk-sammanstallning-${eslCode(selected.from, selected.to)}`;

  async function markFiled() {
    setBusy(true);
    try {
      ok(await acc.fileEcSalesList({ from: selected.from, to: selected.to, contactName: contact.name, phone: contact.phone, email: contact.email.trim() || undefined, receiptRef: contact.receipt.trim() || undefined }));
      setStatus({ ok: true, text: x.filedDone });
      await load();
    } catch (e) { setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title={v.title}><SectionTabs {...vatTabs(v)} /></PageHead>
      <p className="mb-4 text-sm text-muted">{x.intro}</p>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div><label htmlFor="esl-kind" className={label}>{x.periodKind}</label>
          <select id="esl-kind" className={input} value={quarterly ? "q" : "m"} onChange={(e) => setParams(e.target.value === "q" ? { k: "q" } : {})}>
            <option value="m">{x.monthly}</option><option value="q">{x.quarterly}</option>
          </select></div>
        <div><label htmlFor="esl-period" className={label}>{v.period}</label>
          <select id="esl-period" className={input} value={selected.from} onChange={(e) => setParams({ ...(quarterly ? { k: "q" } : {}), p: e.target.value })}>
            {periods.map((p) => <option key={p.from} value={p.from}>{p.label} ({v.due} {p.due})</option>)}
          </select></div>
      </div>
      {!preview ? <p role="status">{t.common.loading}</p> : rows.length === 0 ? <EmptyState text={x.empty} /> : (
        <div className="space-y-4">
          {quarterly && hasGoods && <p className="rounded-lg border border-border p-3 text-sm">{x.quarterGoods}</p>}
          {preview.missingVatNr > 0n && <p role="alert" className="text-[var(--error)]">{x.missing(Number(preview.missingVatNr))}</p>}
          {filed && <p className="text-sm">{x.filed(fmtTime(filed.filedAt, at.locale))}{filed.receiptRef ? ` · ${filed.receiptRef}` : ""}</p>}
          <DataTable rows={rows} rowKey={(r) => r.vatNr} caption={`${v.tabs.ecSales} ${selected.label}`} csvName={fileName}
            columns={[
              { key: "n", title: x.vatNr, render: (r) => r.vatNr, value: (r) => r.vatNr },
              { key: "b", title: x.buyer, render: (r) => r.buyer, value: (r) => r.buyer },
              { key: "g", title: x.goods, align: "right", render: (r) => r.goods.toLocaleString("sv-SE"), value: (r) => r.goods },
              { key: "s", title: x.services, align: "right", render: (r) => r.services.toLocaleString("sv-SE"), value: (r) => r.services },
            ]} />
          <form className="card grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void markFiled(); }}>
            <p className="text-sm sm:col-span-2">{x.fileIntro}</p>
            <div><label htmlFor="esl-name" className={label}>{x.contactName}</label>
              <input id="esl-name" className={input} maxLength={35} required disabled={!!filed} value={c.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></div>
            <div><label htmlFor="esl-phone" className={label}>{x.phone}</label>
              <input id="esl-phone" className={input} maxLength={17} required disabled={!!filed} inputMode="tel" value={c.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
            <div><label htmlFor="esl-email" className={label}>{x.email}</label>
              <input id="esl-email" type="email" className={input} maxLength={100} disabled={!!filed} value={c.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></div>
            {!filed && <div><label htmlFor="esl-receipt" className={label}>{x.receipt}</label>
              <input id="esl-receipt" className={input} maxLength={100} value={contact.receipt} onChange={(e) => setContact({ ...contact, receipt: e.target.value })} /></div>}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="button" className="btn btn-secondary" disabled={!vatNr || !c.name.trim() || !c.phone.trim() || preview.missingVatNr > 0n}
                onClick={() => saveFile(new Blob([latin1(eslFile(vatNr, selected.from, selected.to, c, rows))], { type: "text/plain" }), `${fileName.replace(/[^A-Za-z0-9]/g, "")}.txt`)}>{x.download}</button>
              <PdfActions label={x.pdf} preview={false} fileName={`${fileName}.pdf`} job={async () => ({
                template: "ec-sales@1" as const, meta: meta(ctx, "Periodisk sammanställning", eslCode(selected.from, selected.to), [`Period ${selected.from} – ${selected.to}`]),
                rows, facts: [["Period", eslCode(selected.from, selected.to)], ["Momsregistreringsnummer", vatNr], ["Kontaktperson", c.name], ["Telefon", c.phone]],
              })} />
              {canBook && !filed && <button type="submit" className="btn btn-primary" disabled={busy || preview.missingVatNr > 0n}>{x.markFiled}</button>}
            </div>
          </form>
        </div>
      )}
      <Toast status={status} />
    </>
  );
}
