// acj-1 canonical JSON, byte-identical to accounting/src/lib/Canonical.mo (C11).
// Values: bigint (or a safe integer), string, boolean, null, Uint8Array (hex),
// arrays and plain objects. A variant case is an object with one key: {"tag": v}.

export type Value = bigint | number | string | boolean | null | Uint8Array | Value[] | { [k: string]: Value };

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function escape(s: string): string {
  let out = '"';
  for (const c of s) {
    const n = c.codePointAt(0)!;
    if (c === '"') out += '\\"';
    else if (c === "\\") out += "\\\\";
    else if (n < 0x20) out += "\\u00" + n.toString(16).padStart(2, "0");
    else out += c;
  }
  return out + '"';
}

// Keys are ASCII field names, so code-unit order equals Motoko's Text.compare.
const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function encode(v: Value): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new Error(`acj-1: not an integer: ${v}`);
    return String(v);
  }
  if (typeof v === "string") return escape(v);
  if (v instanceof Uint8Array) return escape(hex(v));
  if (Array.isArray(v)) return `[${v.map(encode).join(",")}]`;
  const keys = Object.keys(v).sort(byKey);
  return `{${keys.map((k) => `${escape(k)}:${encode(v[k])}`).join(",")}}`;
}

export async function sha256(v: Value): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encode(v))));
}
