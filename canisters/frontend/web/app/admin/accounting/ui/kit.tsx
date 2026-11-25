// Small shared pieces: money, chips, banners, empty states, references, hash badge.
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { IconCheck, IconLock } from "../../../components/Icons";
import { useAccT } from "../context";
import { formatOre, parseOre, plainOre } from "../money";

export const input = "mt-1 w-full rounded-md border border-[var(--input-border)] bg-bg px-3 py-2 text-fg";
export const label = "font-medium";

/** An amount in öre, right-aligned digits. Negative amounts get a minus sign. */
export function Money({ ore, unit }: { ore: bigint; unit?: boolean }) {
  return <span className="whitespace-nowrap tabular-nums">{formatOre(ore, unit)}</span>;
}

/**
 * Amount input: accepts "1234,56", "1 234.56", "-50". Keeps the text while typing,
 * reports öre (or null when empty) and shows an error for text that is not an amount.
 */
export function MoneyInput({ value, onChange, id, labelText, className = "", allowNegative = false, describedBy }: {
  value: bigint | null; onChange: (v: bigint | null) => void; id?: string; labelText: string; className?: string; allowNegative?: boolean; describedBy?: string;
}) {
  const t = useAccT();
  const [text, setText] = useState(value === null ? "" : plainOre(value));
  const [bad, setBad] = useState(false);
  const errId = useId();
  const [last, setLast] = useState(value);
  if (value !== last) { setLast(value); setText(value === null ? "" : plainOre(value)); setBad(false); }
  return (
    <>
      <input id={id} inputMode="decimal" autoComplete="off" aria-label={labelText} value={text} aria-invalid={bad || undefined}
        aria-describedby={[bad ? errId : "", describedBy ?? ""].join(" ").trim() || undefined}
        className={`w-full rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5 text-right tabular-nums aria-[invalid]:border-[var(--error)] ${className}`}
        onChange={(e) => {
          setText(e.target.value);
          const v = e.target.value.trim() === "" ? null : parseOre(e.target.value);
          const ok = e.target.value.trim() === "" || (v !== null && (allowNegative || v >= 0n));
          setBad(!ok);
          if (ok) { setLast(v); onChange(v); }
        }}
        onBlur={() => { if (!bad && last !== null) setText(plainOre(last)); }} />
      {bad && <span id={errId} className="sr-only">{t.money.invalid}</span>}
    </>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad" | "info";
const tones: Record<Tone, string> = {
  neutral: "border-border text-muted",
  good: "border-brand/50 bg-[var(--brand-soft)] text-accent",
  warn: "border-amber-500/50 bg-amber-500/10 text-amber-300 light:text-amber-800",
  bad: "border-[var(--error)]/60 text-[var(--error)]",
  info: "border-sky-500/50 bg-sky-500/10 text-sky-300 light:text-sky-800",
};

/** One colour set for every status in Ekonomi. */
export function StatusChip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function LockChip() {
  const t = useAccT();
  return <StatusChip tone="neutral"><IconLock className="h-3.5 w-3.5" /> {t.common.locked}</StatusChip>;
}

export function ReadOnlyBanner() {
  const t = useAccT();
  return <p role="note" className="mb-6 rounded-lg border border-sky-500/50 bg-sky-500/10 px-4 py-2 text-sm">{t.shell.readOnly}</p>;
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="card text-center">
      <p className="text-muted">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** "A-12": opens the voucher. */
export function DocRef({ id, label: text, search }: { id: bigint; label: string; search?: string }) {
  return <Link to={`/admin/accounting/ledger/${id}${search ?? ""}`} className="rounded-md border border-border px-1.5 py-0.5 font-mono text-sm no-underline hover:border-accent">{text}</Link>;
}

/** Short content hash with its verification state. */
export function HashBadge({ hash, state, okText }: { hash: string; state: "ok" | "missing" | "bad" | "checking"; okText?: string }) {
  const t = useAccT().voucher;
  const text = state === "ok" ? okText ?? t.hashOk : state === "bad" ? t.hashBad : state === "missing" ? t.hashMissing : "…";
  return (
    <span className="inline-flex items-center gap-2" title={hash}>
      <code className="rounded border border-border px-1.5 py-0.5 text-sm">{hash.slice(0, 8)}</code>
      {state === "ok" ? <IconCheck className="h-4 w-4 text-accent" aria-hidden="true" /> : null}
      <span className={`text-sm ${state === "bad" ? "text-[var(--error)]" : "text-muted"}`}>{text}</span>
    </span>
  );
}

export function PageHead({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl uppercase">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export const voucherRef = (series: string, n: bigint) => `${series}-${n}`;

export const fmtTime = (ns: bigint, locale: string) =>
  new Date(Number(ns / 1_000_000n)).toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
