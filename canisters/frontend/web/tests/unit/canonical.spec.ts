// acj-1 parity: the canonical strings and hashes come from the Motoko test file,
// so both implementations are checked against the same vectors (C11).
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encode, hex, sha256, type Value } from "../../app/admin/accounting/canonical";

const mo = readFileSync(new URL("../../../../backend/accounting/test/canonical.test.mo", import.meta.url), "utf8");

/** Decodes a Motoko text literal body (\" \\ \n \u{X}). */
const unMo = (s: string) =>
  s.replace(/\\(u\{([0-9a-fA-F]+)\}|n|"|\\)/g, (_, e: string, cp?: string) =>
    cp ? String.fromCodePoint(parseInt(cp, 16)) : e === "n" ? "\n" : e);

// (name, value-literal, "canonical", "sha") tuples; the value is rebuilt below in TS.
const vectors = [...mo.matchAll(/\(\s*"([\w-]+)",\s*#[\s\S]*?,\s*"((?:[^"\\]|\\.)*)",\s*"([0-9a-f]{64})",\s*\)/g)]
  .map(([, name, canonical, sha]) => ({ name, canonical: unMo(canonical), sha }));

const values: Record<string, Value> = {
  "sorting-escapes-variant": { b: [true, null, 'x"y'], a: 1n, c: { tag: -5n } },
  "unicode-control-blob": { name: "Åsa\n\u0001\\", blob: Uint8Array.of(0x01, 0xab) },
  "empty-and-bigint": { list: [], n: -1234567890123456789012n, empty: {} },
};

test("reads all vectors from the Motoko suite", () => {
  expect(vectors.map((v) => v.name).sort()).toEqual(Object.keys(values).sort());
});

for (const v of vectors) {
  test(`acj-1 ${v.name}`, async () => {
    expect(encode(values[v.name])).toBe(v.canonical);
    expect(hex(await sha256(values[v.name]))).toBe(v.sha);
  });
}

test("rejects non-integer numbers", () => {
  expect(() => encode(1.5)).toThrow();
});
