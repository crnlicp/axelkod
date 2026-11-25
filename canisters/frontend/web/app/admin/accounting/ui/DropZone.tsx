// Upload of received documents: drop, choose or photograph; each file is
// encrypted in the browser and sent to the vault in chunks with progress.
import { useState } from "react";
import { Variant_scan_email_upload, type Attachment } from "../../../bindings/accounting";
import { useAcc, useAccT, useErr } from "../context";
import { MAX_FILE, MIME, uploadDocument } from "../crypto";
import { IconPaperclip } from "../../../components/Icons";

type Row = { name: string; text: string; ok: boolean | null };

export function DropZone({ onUploaded }: { onUploaded: (a: Attachment) => void }) {
  const t = useAccT().upload;
  const err = useErr();
  const { acc, vault } = useAcc();
  const [rows, setRows] = useState<Row[]>([]);
  const [over, setOver] = useState(false);

  const set = (i: number, r: Partial<Row>) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, ...r } : x)));

  async function send(files: File[]) {
    const start = rows.length;
    setRows((xs) => [...xs, ...files.map((f) => ({ name: f.name, text: t.encrypting(f.name), ok: null }))]);
    for (const [k, f] of files.entries()) {
      const i = start + k;
      if (!MIME.includes(f.type)) { set(i, { text: t.failed(f.name, t.badType), ok: false }); continue; }
      if (f.size > MAX_FILE) { set(i, { text: t.failed(f.name, t.tooBig), ok: false }); continue; }
      try {
        const via = f.type.startsWith("image/") ? Variant_scan_email_upload.scan : Variant_scan_email_upload.upload;
        const a = await uploadDocument(acc, vault, f, via, (a, b) => set(i, { text: t.sending(f.name, a, b) }));
        set(i, { text: t.done(f.name), ok: true });
        onUploaded(a);
      } catch (e) {
        set(i, { text: t.failed(f.name, e instanceof Error && e.message === "hash" ? t.hashError : err(e)), ok: false });
      }
    }
  }

  return (
    <div>
      <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void send([...e.dataTransfer.files]); }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 text-center ${over ? "border-accent bg-[var(--brand-soft)]" : "border-border"}`}>
        <IconPaperclip className="h-6 w-6 text-accent" />
        <span className="font-medium">{t.drop}</span>
        <span className="text-sm text-muted">{t.types}</span>
        <input type="file" multiple accept={MIME.join(",")} className="sr-only" onChange={(e) => { void send([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </label>
      <label className="mt-2 inline-flex cursor-pointer text-sm text-accent underline sm:hidden">
        {t.camera}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void send([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </label>
      {rows.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm" aria-live="polite">
          {rows.map((r, i) => (
            <li key={i} className={r.ok === false ? "text-[var(--error)]" : r.ok ? "text-accent" : "text-muted"}>{r.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
