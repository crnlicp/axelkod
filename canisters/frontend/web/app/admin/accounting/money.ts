// Amounts are öre as bigint everywhere; floats never touch money.

const NBSP = " ";

/** 123456n -> "1 234,56" (sv-SE digit groups with a no-break space). */
export function formatOre(ore: bigint, withUnit = false): string {
  const neg = ore < 0n;
  const abs = neg ? -ore : ore;
  const kr = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const out = `${neg ? "−" : ""}${kr},${(abs % 100n).toString().padStart(2, "0")}`;
  return withUnit ? `${out}${NBSP}kr` : out;
}

/**
 * Accepts "1234,56", "1 234.56", "-50", "1234" and returns öre, or null when the
 * text is not an amount. More than two decimals are rejected, not rounded.
 */
export function parseOre(text: string): bigint | null {
  const s = text.replace(/[\s  ]/g, "").replace(/^−/, "-").replace(/kr$/i, "");
  const m = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const ore = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -ore : ore;
}

/** Plain value for CSV and inputs: "1234.56" style with a comma, no grouping. */
export function plainOre(ore: bigint): string {
  return formatOre(ore).replace(/ /g, "").replace("−", "-");
}
