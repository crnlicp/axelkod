// Download, preview and print for a generated PDF. The job is built only when
// clicked; the worker and fonts load on first use.
import { useEffect, useState } from "react";
import { IconDownload } from "../../../components/Icons";
import { useAccT, useErr } from "../context";
import { pdfBlob, renderPdf, saveFile } from "../pdf/client";
import type { Job } from "../pdf/types";
import { Dialog } from "./Dialog";
import { Toast } from "../../toast";

export function PdfActions({ job, fileName, label, preview = true }: { job: () => Promise<Job>; fileName: string; label?: string; preview?: boolean }) {
  const t = useAccT();
  const err = useErr();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function make(): Promise<Blob | null> {
    setBusy(true);
    try {
      return pdfBlob(await renderPdf(await job()));
    } catch (e) {
      setStatus({ ok: false, text: err(e) });
      return null;
    } finally { setBusy(false); }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={async () => { const b = await make(); if (b) saveFile(b, fileName); }}>
        <IconDownload className="h-5 w-5" /> {busy ? t.common.generating : label ?? t.common.downloadPdf}
      </button>
      {preview && (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={async () => { const b = await make(); if (b) setUrl(URL.createObjectURL(b)); }}>
          {t.common.preview}
        </button>
      )}
      <Dialog open={!!url} onClose={() => { if (url) URL.revokeObjectURL(url); setUrl(null); }} title={fileName} wide>
        {url && <iframe src={url} title={fileName} className="h-[70vh] w-full rounded-lg border border-border bg-white" />}
      </Dialog>
      <Toast status={status} />
    </>
  );
}
