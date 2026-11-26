// Sales helpers for pages: status chips, quantities, and PDF/e-invoice jobs that
// render only a verified snapshot (C11).
import type { DocStatus, HusPart, Reminder, SalesDoc } from "../../bindings/accounting";
import type { Accounting } from "./api";
import { matches, reminder as encodeReminder, snapshot as encodeSnapshot } from "./encode";
import type { AccDict } from "./i18n/sv";
import { nowStamp } from "./pdf/client";
import type { HusPrint, Job } from "./pdf/types";
import { hex } from "./canonical";

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

export function statusOf(s: DocStatus): { key: string; tone: Tone } {
  if (s.__kind__ === "quote") {
    const q = s.quote;
    return { key: q, tone: q === "accepted" ? "good" : q === "declined" || q === "expired" ? "neutral" : "info" };
  }
  const tone: Record<string, Tone> = { issued: "info", paid: "good", partiallyPaid: "warn", overdue: "bad", credited: "neutral" };
  return { key: s.__kind__, tone: tone[s.__kind__] ?? "neutral" };
}

/** "2,5" / "2.5" -> 2500 (thousandths); null when not a positive quantity with at most 3 decimals. */
export function parseQty(text: string): bigint | null {
  const m = /^(\d+)(?:[.,](\d{1,3}))?$/.exec(text.trim().replace(/\s/g, ""));
  if (!m) return null;
  return BigInt(m[1]) * 1000n + BigInt((m[2] ?? "").padEnd(3, "0"));
}
export const formatQty = (q: bigint) => {
  const frac = q % 1000n;
  return frac === 0n ? String(q / 1000n) : `${q / 1000n},${String(frac).padStart(3, "0").replace(/0+$/, "")}`;
};
/** "12,5" (%) -> 1250 basis points. */
export function parsePct(text: string): bigint | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const bp = BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0"));
  return bp <= 10_000n ? bp : null;
}
export const formatPct = (bp: bigint) => (Number(bp) / 100).toLocaleString("sv-SE");

// Same titles as pdf/sales.ts; kept here so page code never imports the PDF modules.
const TITLES = { sv: { invoice: "Faktura", creditNote: "Kreditfaktura", quote: "Offert", reminder: "Betalningspåminnelse" }, en: { invoice: "Invoice", creditNote: "Credit note", quote: "Quote", reminder: "Payment reminder" } };
const salesTitle = (kind: keyof (typeof TITLES)["sv"], lang: "sv" | "en") => TITLES[lang][kind];

const TEMPLATE: Record<string, "invoice@1" | "credit-note@1" | "quote@1"> = { invoice: "invoice@1", creditNote: "credit-note@1", quote: "quote@1" };

export class HashMismatch extends Error {
  constructor() { super("hash"); }
}

/** The PDF job of an issued document, after checking the snapshot against its stored hash.
 * ROT/RUT buyers and home are decrypted when `acc` is given (pii-v1). */
export async function docJob(d: SalesDoc, acc?: Accounting): Promise<Job> {
  if (!(await matches(encodeSnapshot(d.snapshot), d.contentHash))) throw new HashMismatch();
  const x = d.snapshot;
  return {
    template: TEMPLATE[x.kind],
    meta: {
      title: salesTitle(x.kind, x.language), ref: String(x.number), company: x.seller, generatedAt: nowStamp(),
      date: new Date(`${x.issueDate}T00:00:00Z`), hash: hex(Uint8Array.from(d.contentHash)).slice(0, 8), lang: x.language,
    },
    snapshot: x,
    hus: x.hus && acc ? await husPrint(acc, x.hus) : undefined,
  };
}

async function husPrint(acc: Accounting, h: HusPart): Promise<HusPrint> {
  const { decryptIdentity, decryptProperty } = await import("./rotrut");
  const buyers = await Promise.all(h.buyers.map(async (b) => ({ ...(await decryptIdentity(acc, b.identityEnc)), amount: b.amount })));
  const p = h.propertyEnc ? await decryptProperty(acc, h.propertyEnc) : undefined;
  const property = !p ? undefined : "fastighetsbeteckning" in p ? p.fastighetsbeteckning : `BRF ${p.brfOrgNr}, lgh ${p.lagenhetsnummer}`;
  return { buyers, property };
}

export async function reminderJob(r: Reminder): Promise<Job> {
  if (!(await matches(encodeReminder(r), r.contentHash))) throw new HashMismatch();
  return {
    template: "reminder@1",
    meta: {
      title: salesTitle("reminder", r.language), ref: String(r.number), company: r.seller, generatedAt: nowStamp(),
      date: new Date(`${r.date}T00:00:00Z`), hash: hex(Uint8Array.from(r.contentHash)).slice(0, 8), lang: r.language,
    },
    reminder: r,
  };
}

export const docName = (t: AccDict, d: { kind: string; number: bigint }) => `${t.sales.kind[d.kind]} ${d.number}`;
