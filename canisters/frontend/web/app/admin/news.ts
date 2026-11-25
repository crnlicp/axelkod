/** Slug from a title: lowercase ASCII, Swedish letters folded, hyphen-separated. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/é/g, "e").replace(/ü/g, "u")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** A cover is an uploaded file (/uploads/…) or an https:// image address (same rule as the canister). */
export function isCoverUrl(u: string): boolean {
  if (/^\/uploads\/[^\s"<>]{2,}$/.test(u)) return u.length <= 300;
  try {
    return new URL(u).protocol === "https:" && !/[\s"<>]/.test(u);
  } catch {
    return false;
  }
}

/** ns timestamp ⇄ <input type="datetime-local"> value (local time). */
export function toLocalInput(ns: bigint): string {
  const d = new Date(Number(ns / 1_000_000n));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v: string): bigint {
  const ms = new Date(v).getTime();
  return BigInt(Number.isFinite(ms) ? ms : Date.now()) * 1_000_000n;
}
