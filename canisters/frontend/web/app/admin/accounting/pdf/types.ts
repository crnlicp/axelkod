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
  | { template: "invoice@1" | "credit-note@1" | "quote@1"; meta: Meta; snapshot: Snapshot; hus?: HusPrint }
  | { template: "reminder@1"; meta: Meta; reminder: Reminder }
  /** VAT return as filed: whole kronor per box, plus the facts of the lock (V3). */
  | { template: "vat-return@1"; meta: Meta; boxes: Box[]; facts: [string, string][] }
  | { template: "ec-sales@1"; meta: Meta; rows: EslRow[]; facts: [string, string][] }
  /** Payslip: the lines, tax, net, and what the AGI reports (V7). */
  | { template: "payslip@1"; meta: Meta; facts: [string, string][]; lines: PayslipLine[]; totals: [string, bigint][]; agi: [string, string][] }
  | { template: "summary@1"; meta: Meta; facts: [string, string][]; table: { cols: string[]; rows: string[][] } };

/** ROT/RUT buyers and home, decrypted in the browser for printing (V12: shown on the invoice). */
export type HusPrint = { buyers: { name: string; personnummer: string; amount: bigint }[]; property?: string };

export type PayslipLine = { text: string; quantity: string; rate: bigint | null; amount: bigint };
