// Plain data sent to the PDF worker (structured clone: bigint is fine).
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
  | { template: "trial-balance@1"; meta: Meta; rows: TrialRow[] };
