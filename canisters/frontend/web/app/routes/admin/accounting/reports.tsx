// Rapporter & export (A9c): SIE4 per financial year, the behandlingshistorik (checked chain,
// PDF + CSV), the systemdokumentation PDF, the backup link and where the other reports are.
import { useState } from "react";
import { Link } from "react-router";
import type { AuditEntry } from "../../../bindings/accounting";
import { ok } from "../../../admin/accounting/api";
import { sieFile } from "../../../admin/accounting/backup";
import { hex } from "../../../admin/accounting/canonical";
import { today, useAcc, useAccT, useErr } from "../../../admin/accounting/context";
import { useCrumbs } from "../../../admin/accounting/crumbs";
import { meta } from "../../../admin/accounting/ledger";
import { saveFile } from "../../../admin/accounting/pdf/client";
import { auditTime, sysdocJob } from "../../../admin/accounting/sysdoc";
import { DataTable } from "../../../admin/accounting/ui/DataTable";
import { PdfActions } from "../../../admin/accounting/ui/PdfActions";
import { PageHead } from "../../../admin/accounting/ui/kit";
import { IconDownload } from "../../../components/Icons";

type Log = { entries: AuditEntry[]; broken: bigint | null };

/** All entries oldest first, and the first broken one (verifyAudit checks 5 000 at a time). */
async function loadAudit(acc: ReturnType<typeof useAcc>["acc"]): Promise<Log> {
  const entries: AuditEntry[] = [];
  for (let off = 0n; ; off += 200n) {
    const page = ok(await acc.auditLog(off, 200n));
    entries.push(...page.items);
    if (BigInt(entries.length) >= page.total || page.items.length === 0) break;
  }
  entries.reverse();
  let broken: bigint | null = null;
  for (let from = 0n; from < BigInt(entries.length) && broken === null; from += 5000n) broken = ok(await acc.verifyAudit(from));
  return { entries, broken };
}

export default function Reports() {
  const t = useAccT();
  const r = t.reports;
  const err = useErr();
  const ctx = useAcc();
  const { acc, data, href, isOwner } = ctx;
  const [yearId, setYearId] = useState<string>(ctx.year ? String(ctx.year.id) : "");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Log | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: r.title }]);

  const company = data?.company ?? null;
  const fail = (e: unknown) => setMsg({ ok: false, text: err(e) });

  async function downloadSie() {
    const y = data?.years.find((x) => String(x.id) === yearId);
    if (!y || !company || !data) return;
    setBusy(true);
    try {
      const bytes = await sieFile(acc, data.years, data.accounts, company, y);
      saveFile(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "text/plain;charset=ibm437" }), `${company.orgNr.replace("-", "")}_${y.start.slice(0, 4)}.se`);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function showAudit() {
    setBusy(true);
    try { setLog(await loadAudit(acc)); } catch (e) { fail(e); } finally { setBusy(false); }
  }

  const auditJob = async () => {
    const l = log ?? (await loadAudit(acc));
    return {
      template: "summary@1" as const, meta: meta(ctx, "Behandlingshistorik", today(), [`Per ${today()}`]),
      facts: [["Antal poster", String(l.entries.length)], ["Kedjan", l.broken === null ? "Hel" : `Bruten vid post ${l.broken}`]] as [string, string][],
      table: { cols: ["Nr", "Tid", "Händelse", "Post", "Användare"], rows: l.entries.map((e) => [String(e.seq), auditTime(e), e.action, `${e.entity}${e.entityId === undefined ? "" : ` ${e.entityId}`}`, e.principal.toText().slice(0, 17)]) },
    };
  };

  const sysJob = async () => {
    const first = ok(await acc.auditLog(0n, 1n));
    const total = Number(first.total);
    const oldest = total > 0 ? ok(await acc.auditLog(BigInt(total - 1), 1n)).items[0] ?? null : null;
    let broken: bigint | null = null;
    for (let from = 0n; from < BigInt(total) && broken === null; from += 5000n) broken = ok(await acc.verifyAudit(from));
    return sysdocJob(meta(ctx, "Systemdokumentation", today(), [company?.legalName ?? ""]), data!, { total, intact: broken === null, first: oldest });
  };

  return (
    <>
      <PageHead title={r.title} />
      <p className="mb-4 text-sm text-muted">{r.lead}</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mb-4 ${msg.ok ? "text-accent" : "text-[var(--error)]"}`}>{msg.text}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3" aria-labelledby="sie-h">
          <h2 id="sie-h" className="text-2xl">{r.sie}</h2>
          <p className="text-sm text-muted">{r.sieLead}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">{r.sieYear}
              <select className="input mt-1 block" value={yearId} onChange={(e) => setYearId(e.target.value)}>
                {(data?.years ?? []).map((y) => <option key={String(y.id)} value={String(y.id)}>{y.start} – {y.end}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-secondary" disabled={busy || !company || !yearId} onClick={() => void downloadSie()}>
              <IconDownload className="h-5 w-5" /> {r.sieDownload}
            </button>
          </div>
        </section>
        <section className="card space-y-3" aria-labelledby="sys-h">
          <h2 id="sys-h" className="text-2xl">{r.sysdoc}</h2>
          <p className="text-sm text-muted">{r.sysdocLead}</p>
          {company && <div className="flex flex-wrap gap-2"><PdfActions job={sysJob} fileName={`systemdokumentation-${today()}.pdf`} label={r.sysdocDownload} /></div>}
        </section>
        {isOwner && (
          <section className="card space-y-3" aria-labelledby="bk-h">
            <h2 id="bk-h" className="text-2xl">{r.backup}</h2>
            <p className="text-sm text-muted">{r.backupLead}</p>
            <Link to={href("/admin/accounting/settings/backup")}>{r.backupLink}</Link>
          </section>
        )}
        <section className="card space-y-3" aria-labelledby="cat-h">
          <h2 id="cat-h" className="text-2xl">{r.catalogue}</h2>
          <ul className="space-y-2 text-sm">
            {r.items.map(([what, where, to]) => <li key={what}>{what} – {r.where} <Link to={href(to)}>{where}</Link></li>)}
          </ul>
        </section>
      </div>
      <section className="card mt-6 space-y-3" aria-labelledby="audit-h">
        <h2 id="audit-h" className="text-2xl">{r.audit}</h2>
        <p className="text-sm text-muted">{r.auditLead}</p>
        <div className="flex flex-wrap gap-2">
          {!log && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void showAudit()}>{r.auditLoad}</button>}
          {company && <PdfActions job={auditJob} fileName={`behandlingshistorik-${today()}.pdf`} />}
        </div>
        {log && (
          <>
            <p role="status" className={log.broken === null ? "text-accent" : "text-[var(--error)]"}>{log.broken === null ? r.auditOk(log.entries.length) : r.auditBroken(Number(log.broken))}</p>
            <DataTable rows={[...log.entries].reverse()} rowKey={(e) => String(e.seq)} caption={r.audit} csvName={`behandlingshistorik-${today()}`} columns={[
              { key: "seq", title: r.seq, render: (e) => String(e.seq), value: (e) => e.seq, align: "right" },
              { key: "time", title: r.time, render: (e) => auditTime(e), value: (e) => e.at, csv: (e) => auditTime(e) },
              { key: "action", title: r.action, render: (e) => e.action, value: (e) => e.action },
              { key: "entity", title: r.entity, render: (e) => `${e.entity}${e.entityId === undefined ? "" : ` ${e.entityId}`}`, value: (e) => `${e.entity} ${e.entityId ?? ""}` },
              { key: "user", title: r.user, render: (e) => <span className="font-mono text-xs">{e.principal.toText().slice(0, 17)}…</span>, value: (e) => e.principal.toText(), secondary: true },
              { key: "hash", title: r.hash, render: (e) => <span className="font-mono text-xs">{hex(Uint8Array.from(e.hash)).slice(0, 12)}</span>, value: (e) => hex(Uint8Array.from(e.hash)), secondary: true },
            ]} />
          </>
        )}
      </section>
    </>
  );
}
