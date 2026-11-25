// Main-thread side of the PDF worker. The worker (and pdf-lib, fonts) loads on first use.
import type { Job } from "./types";

let worker: Worker | null = null;
let next = 0;
const pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();

function get(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ id: number; bytes?: Uint8Array; error?: string }>) => {
    const p = pending.get(e.data.id);
    pending.delete(e.data.id);
    if (e.data.bytes) p?.resolve(e.data.bytes);
    else p?.reject(new Error(e.data.error ?? "pdf"));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "pdf worker"));
    pending.clear();
    worker = null;
  };
  return worker;
}

export function renderPdf(job: Job): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve, reject });
    get().postMessage({ id, job });
  });
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
}

/** Saves a file through a temporary link (no third-party code, CSP-safe). */
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "2026-11-25 14:02" in Swedish local time. */
export function nowStamp(d = new Date()): string {
  return d.toLocaleString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
