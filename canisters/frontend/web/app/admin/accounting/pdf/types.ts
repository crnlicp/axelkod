// Plain data sent to the PDF worker (structured clone: bigint is fine).
import type { Box, EslRow, Reminder, Snapshot } from "../../../bindings/accounting";
import type { DocMeta } from "./layout";

export type Meta = Omit<DocMeta, "template">;

export type PdfLine = { account: number; name: string; amount: bigint; vatCode?: string; text?: string };

export type PdfVoucher = {
  ref: string;
  eventDate: string;
  registeredAt: string;
  description: string;
  counterparty?: string;
  lines: PdfLine[];
  attachments: { filename: string; sha: string }[];
  corrects?: string;
  correctedBy: string[];
  createdBy: string;
  retainUntil: string;
  source: string;
};

export type LedgerAccount = { number: number; name: string; opening: bigint; rows: { date: string; ref: string; text: string; amount: bigint }[] };
export type TrialRow = { number: number; name: string; opening: bigint; change: bigint };

export type Job =
  | { template: "voucher@1"; meta: Meta; voucher: PdfVoucher }
  | { template: "journal@1"; meta: Meta; vouchers: PdfVoucher[] }
  | { template: "ledger@1"; meta: Meta; accounts: LedgerAccount[] }
  | { template: "trial-balance@1"; meta: Meta; rows: TrialRow[] }
  /** Issued sales documents render only from their stored snapshot (C11). */
  | { template: "invoice@1" | "credit-note@1" | "quote@1"; meta: Meta; snapshot: Snapshot }
  | { template: "reminder@1"; meta: Meta; reminder: Reminder }
  /** VAT return as filed: whole kronor per box, plus the facts of the lock (V3). */
  | { template: "vat-return@1"; meta: Meta; boxes: Box[]; facts: [string, string][] }
  | { template: "ec-sales@1"; meta: Meta; rows: EslRow[]; facts: [string, string][] };
