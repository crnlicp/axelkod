// Voucher detail: the lines, a facts panel (dates, links, documents, content hash
// verified against the audit trail, the record's audit trail) and actions.
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import type { Attachment, AuditEntry, VoucherView } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { hex } from "../../../../admin/accounting/canonical";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { openDocument } from "../../../../admin/accounting/crypto";
import { voucherHash } from "../../../../admin/accounting/encode";
import { ref, voucherJob } from "../../../../admin/accounting/ledger";
import { ConfirmPost } from "../../../../admin/accounting/ui/ConfirmPost";
import { Dialog } from "../../../../admin/accounting/ui/Dialog";
import { DropZone } from "../../../../admin/accounting/ui/DropZone";
import { PdfActions } from "../../../../admin/accounting/ui/PdfActions";
import { DocRef, HashBadge, LockChip, Money, PageHead, StatusChip, fmtTime, input, label } from "../../../../admin/accounting/ui/kit";
import { useAdminLang } from "../../../../admin/i18n";
import { Toast } from "../../../../admin/toast";

type Loaded = { v: VoucherView; related: Map<bigint, VoucherView>; attachments: Attachment[]; audit: AuditEntry[]; hash: string };

export default function VoucherPage() {
  const t = useAccT();
  const x = t.voucher;
  const err = useErr();
  const ctx = useAcc();
  const { acc, vault, href, canBook, accountName } = ctx;
  const { t: at } = useAdminLang();
  const { id } = useParams();
  const location = useLocation();
  const [d, setD] = useState<Loaded | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>((location.state as { posted?: string } | null)?.posted ? { ok: true, text: (location.state as { posted: string }).posted } : null);
  const [correcting, setCorrecting] = useState(false);
  const [fix, setFix] = useState({ date: today(), text: "" });
  const [busy, setBusy] = useState(false);
  const [newCorrection, setNewCorrection] = useState<VoucherView | null>(null);
  const [doc, setDoc] = useState<{ url: string; name: string; mime: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const v = ok(await acc.getVoucher(BigInt(id!)));
      const relIds = [...(v.corrects !== undefined ? [v.corrects] : []), ...v.correctedBy];
      const [rel, atts, audit, hash] = await Promise.all([
        Promise.all(relIds.map(async (r) => ok(await acc.getVoucher(r)))),
        Promise.all([...v.attachmentIds, ...v.linkedAttachments].map(async (a) => ok(await acc.getAttachment(a)))),
        acc.auditFor("voucher", v.id).then(ok),
        voucherHash(v),
      ]);
      setD({ v, related: new Map(rel.map((r) => [r.id, r])), attachments: atts, audit, hash });
    } catch (e) { setStatus({ ok: false, text: err(e) }); }
  }, [acc, id, err]);
  useEffect(() => { void load(); }, [load]);

  const title = d ? x.title(ref(d.v)) : "…";
  useCrumbs([{ label: t.ledger.title, to: "/admin/accounting/ledger" }, { label: title }]);
  if (!d) return <><p role="status">{t.common.loading}</p><Toast status={status} /></>;
  const { v } = d;

  const posted = d.audit.find((a) => a.action === "voucher.post" || a.action === "voucher.correct");
  const hashState = !posted ? "missing" : hex(Uint8Array.from(posted.detailHash)) === d.hash ? "ok" : "bad";
  const refOf = (r: bigint) => { const x2 = d.related.get(r); return x2 ? ref(x2) : `#${r}`; };
  const fyLocked = ctx.data?.years.find((y) => y.id === v.fiscalYearId)?.status === "locked";

  async function correct() {
    setBusy(true);
    try {
      const c = ok(await acc.correctVoucher(v.id, fix.date, fix.text.trim() || x.correctText(ref(v)), null));
      setCorrecting(false);
      setNewCorrection({ ...c, correctedBy: [], linkedAttachments: [] });
      setStatus({ ok: true, text: x.corrected(ref(c)) });
      await load();
    } catch (e) { setCorrecting(false); setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  async function open(a: Attachment) {
    try {
      const blob = await openDocument(acc, vault, a);
      setDoc({ url: URL.createObjectURL(blob), name: a.filename, mime: a.mime });
    } catch (e) { setStatus({ ok: false, text: e instanceof Error && e.message === "hash" ? t.upload.hashError : err(e) }); }
  }

  const lines = v.lines;
  const sum = (pos: boolean) => lines.reduce((a, l) => (pos ? (l.amount > 0n ? a + l.amount : a) : (l.amount < 0n ? a - l.amount : a)), 0n);

  return (
    <>
      <PageHead title={title} actions={<>
        <PdfActions fileName={`verifikation-${ref(v)}.pdf`} job={() => voucherJob(ctx, v, d.related, d.attachments, x.sources)} />
        {canBook && v.corrects === undefined && v.correctedBy.length === 0 && !fyLocked && (
          <button type="button" className="btn btn-secondary" onClick={() => { setFix({ date: today(), text: x.correctText(ref(v)) }); setCorrecting(true); }}>{x.correct}</button>
        )}
      </>}>
        <div className="flex flex-wrap items-center gap-2">
          <LockChip />
          {v.corrects !== undefined && <StatusChip tone="info">{t.status.correction}</StatusChip>}
          {v.correctedBy.length > 0 && <StatusChip tone="warn">{t.status.corrected}</StatusChip>}
        </div>
      </PageHead>

      {newCorrection && (
        <div role="status" className="card mb-6 flex flex-wrap items-center justify-between gap-3">
          <span>{x.corrected(ref(newCorrection))}</span>
          <span className="flex flex-wrap gap-3">
            <DocRef id={newCorrection.id} label={ref(newCorrection)} />
            <Link className="btn btn-primary" to={href(`/admin/accounting/ledger/new?from=${v.id}`)}>{x.replace}</Link>
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card" aria-labelledby="lines-h">
          <h2 id="lines-h" className="text-2xl">{v.description}</h2>
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">{t.editor.lines}</caption>
            <thead><tr className="border-b border-border text-left text-muted">
              <th scope="col" className="py-2">{t.common.account}</th><th scope="col" className="py-2">{t.common.text}</th>
              <th scope="col" className="py-2 text-right">{t.common.debit}</th><th scope="col" className="py-2 text-right">{t.common.credit}</th>
            </tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-2"><Link to={href(`/admin/accounting/ledger/accounts/${l.account}`)}>{String(l.account)}</Link> {accountName(l.account)}{l.vatCode ? <span className="ml-2 text-xs text-muted">{l.vatCode}</span> : null}</td>
                  <td className="py-2">{l.text ?? ""}</td>
                  <td className="py-2 text-right">{l.amount > 0n ? <Money ore={l.amount} /> : null}</td>
                  <td className="py-2 text-right">{l.amount < 0n ? <Money ore={-l.amount} /> : null}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="font-semibold">
              <td className="py-2" colSpan={2}>{t.common.total}</td><td className="py-2 text-right"><Money ore={sum(true)} /></td><td className="py-2 text-right"><Money ore={sum(false)} /></td>
            </tr></tfoot>
          </table>
        </section>

        <aside className="space-y-6">
          <section className="card text-sm" aria-label={x.facts}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
              <dt className="text-muted">{x.eventDate}</dt><dd>{v.eventDate}</dd>
              <dt className="text-muted">{x.registered}</dt><dd>{fmtTime(v.registeredAt, at.locale)}</dd>
              {v.counterparty && <><dt className="text-muted">{t.editor.counterparty}</dt><dd>{v.counterparty}</dd></>}
              <dt className="text-muted">{x.source}</dt><dd>{x.sources[v.source.__kind__] ?? v.source.__kind__}</dd>
              <dt className="text-muted">{x.createdBy}</dt><dd className="break-all font-mono text-xs">{v.createdBy.toText()}</dd>
              <dt className="text-muted">{x.retain}</dt><dd>{v.retainUntil}</dd>
              {v.corrects !== undefined && <><dt className="text-muted">{x.corrects}</dt><dd><DocRef id={v.corrects} label={refOf(v.corrects)} search={location.search} /></dd></>}
              {v.correctedBy.length > 0 && <><dt className="text-muted">{x.correctedBy}</dt><dd className="flex flex-wrap gap-1">{v.correctedBy.map((c) => <DocRef key={String(c)} id={c} label={refOf(c)} search={location.search} />)}</dd></>}
              <dt className="text-muted">{x.hash}</dt><dd><HashBadge hash={d.hash} state={hashState} /></dd>
            </dl>
          </section>

          <section className="card text-sm" aria-labelledby="att-h">
            <h2 id="att-h" className="text-xl">{t.editor.attachments}</h2>
            {d.attachments.length ? (
              <ul className="mt-2 space-y-1">
                {d.attachments.map((a) => (
                  <li key={String(a.id)} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-all">{a.filename}</span>
                    <button type="button" className="shrink-0 text-accent underline" onClick={() => void open(a)}>{x.openFile}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-muted">{x.noAttachments}</p>}
            {canBook && (
              <details className="mt-3">
                <summary className="cursor-pointer font-semibold text-accent">{x.attach}</summary>
                <div className="mt-2"><DropZone onUploaded={async (a) => {
                  try { ok(await acc.linkAttachment(a.id, v.id)); setStatus({ ok: true, text: x.linked }); await load(); } catch (e) { setStatus({ ok: false, text: err(e) }); }
                }} /></div>
              </details>
            )}
          </section>

          <section className="card text-sm" aria-labelledby="audit-h">
            <h2 id="audit-h" className="text-xl">{x.audit}</h2>
            <ol className="mt-2 space-y-2">
              {d.audit.map((a) => (
                <li key={String(a.seq)}>
                  <span className="font-semibold">{a.action}</span> · {fmtTime(a.at, at.locale)}
                  <span className="block break-all font-mono text-xs text-muted">{a.principal.toText()}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <ConfirmPost open={correcting} onClose={() => setCorrecting(false)} onConfirm={() => void correct()} busy={busy}
        title={x.correctTitle} creates={x.correctLead} date={fix.date} button={x.correctButton}
        lines={v.lines.map((l) => ({ account: l.account, amount: -l.amount, text: l.text }))}
        extra={
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="fix-date" className={label}>{t.editor.date}</label>
              <input id="fix-date" type="date" className={input} value={fix.date} onChange={(e) => setFix({ ...fix, date: e.target.value })} /></div>
            <div><label htmlFor="fix-text" className={label}>{t.editor.description}</label>
              <input id="fix-text" className={input} maxLength={500} value={fix.text} onChange={(e) => setFix({ ...fix, text: e.target.value })} /></div>
          </div>
        } />
      <Dialog open={!!doc} onClose={() => { if (doc) URL.revokeObjectURL(doc.url); setDoc(null); }} title={doc?.name ?? ""} wide
        footer={doc ? <a className="btn btn-secondary" href={doc.url} download={doc.name}>{t.common.download}</a> : null}>
        {doc && (doc.mime.startsWith("image/")
          ? <img src={doc.url} alt={doc.name} className="mx-auto max-h-[70vh]" />
          : <iframe src={doc.url} title={doc.name} className="h-[70vh] w-full rounded-lg border border-border bg-white" />)}
      </Dialog>
      <Toast status={status} />
    </>
  );
}
