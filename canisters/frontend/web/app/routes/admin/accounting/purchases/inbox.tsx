// Inköp › Att bokföra: upload received documents; each file not yet used as evidence
// is a card that opens the booking workbench.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type { Attachment } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { DropZone } from "../../../../admin/accounting/ui/DropZone";
import { SectionTabs, purchaseTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { EmptyState, PageHead, fmtTime } from "../../../../admin/accounting/ui/kit";
import { IconPaperclip } from "../../../../components/Icons";
import { Toast } from "../../../../admin/toast";
import { useAdminLang } from "../../../../admin/i18n";

export default function Inbox() {
  const t = useAccT();
  const p = t.purchases;
  const err = useErr();
  const { lang } = useAdminLang();
  const { acc, canBook, href } = useAcc();
  const [rows, setRows] = useState<Attachment[] | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: p.title }]);
  const load = useCallback(() => acc.listInbox().then((r) => setRows(ok(r))).catch((e) => setStatus({ ok: false, text: err(e) })), [acc, err]);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHead title={p.title}><SectionTabs {...purchaseTabs(p)} /></PageHead>
      {canBook && <div className="card mb-6"><p className="mb-3 text-sm text-muted">{p.inboxIntro}</p><DropZone onUploaded={() => void load()} /></div>}
      {!rows ? <p role="status">{t.common.loading}</p> : rows.length === 0 ? <EmptyState text={p.inboxEmpty} /> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={p.tabs.inbox}>
          {rows.map((a) => (
            <li key={String(a.id)} className="card flex flex-col gap-2">
              <span className="flex items-center gap-2 font-medium"><IconPaperclip className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" /><span className="truncate">{a.filename}</span></span>
              <span className="text-sm text-muted">{p.uploaded(fmtTime(a.uploadedAt, lang === "en" ? "en-GB" : "sv-SE"))}</span>
              {canBook && <Link to={href(`/admin/accounting/purchases/book/${a.id}`)} className="btn btn-primary mt-auto self-start" aria-label={p.open(a.filename)}>{p.book}</Link>}
            </li>
          ))}
        </ul>
      )}
      <Toast status={status} />
    </>
  );
}
