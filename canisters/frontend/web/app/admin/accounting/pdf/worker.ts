/// <reference lib="webworker" />
// PDF generation off the main thread. Fonts and the logo are fetched once per worker.
import bold from "./fonts/Inter-Bold.ttf?url";
import regular from "./fonts/Inter-Regular.ttf?url";
import logo from "./logo@1.png?url";
import type { Assets } from "./layout";
import { render } from "./templates";
import type { Job } from "./types";

let assets: Promise<Assets> | null = null;
const load = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.arrayBuffer(); });

self.onmessage = async (e: MessageEvent<{ id: number; job: Job }>) => {
  const { id, job } = e.data;
  try {
    assets ??= Promise.all([load(regular), load(bold), load(logo)]).then(([r, b, l]) => ({ regular: r, bold: b, logo: l }));
    const bytes = await render(job, await assets);
    (self as unknown as Worker).postMessage({ id, bytes }, [bytes.buffer]);
  } catch (err) {
    assets = null;
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
