// SIE 4 (V17: SIE file format 4C, 2025-08-06) and the backup ZIP: codepage 437, field
// quoting, amounts, the item order and compulsory 4E items, a parse round trip, opening
// balances from #UB/#IB (2099 → 2098), #RTRANS/#BTRANS, CRC-32 and the stored ZIP.
import { expect, test } from "@playwright/test";
import { AccountKind, FiscalYearStatus, type Account, type VoucherView } from "../../app/bindings/accounting";
import { amount, decode437, encode437, fields, openingFromSie, parseAmount, parseSie, sie4 } from "../../app/admin/accounting/sie4";
import { crc32, unzip, zip } from "../../app/admin/accounting/zip";
import { fyMonths } from "../../app/admin/accounting/ledger";

const acct = (n: number, name: string, kind: AccountKind, sruCode?: string): Account => ({ number: BigInt(n), name, kind, active: true, bas: true, sruCode });
const year = { id: 2n, start: "2026-01-01", end: "2026-12-31", status: FiscalYearStatus.open };
const prev = { id: 1n, start: "2025-01-01", end: "2025-12-31", status: FiscalYearStatus.locked };
const voucher = (series: string, number: bigint, lines: [number, bigint, string?][]): VoucherView => ({
  id: number, series, number, fiscalYearId: 2n, eventDate: "2026-03-15", description: 'Kontorsmaterial "special"', lines: lines.map(([account, amount, text]) => ({ account: BigInt(account), amount, text })),
  attachmentIds: [], source: { __kind__: "manual", manual: null }, createdBy: { toText: () => "x" }, registeredAt: 1_773_532_800_000_000_000n,
  retainUntil: "2033-12-31", correctedBy: [], linkedAttachments: [],
} as unknown as VoucherView);

const input = () => ({
  program: { name: "Axelkod Ekonomi", version: "1" }, generated: new Date("2026-11-26T10:00:00Z"),
  company: { legalName: "Målerifirman Åström AB", orgNr: "556036-0793", street: "Gatan 1", postalCode: "411 01", city: "Göteborg" },
  accounts: [acct(1930, "Företagskonto", AccountKind.asset), acct(2081, "Aktiekapital", AccountKind.equity), acct(2099, "Årets resultat", AccountKind.equity), acct(3001, "Försäljning 25 %", AccountKind.revenue), acct(6110, "Kontorsmaterial", AccountKind.expense)],
  current: { year, months: fyMonths(year), opening: new Map([[1930, 5_000_000n], [2081, -5_000_000n]]),
    balances: [{ account: 1930n, months: [-100_000n, ...Array(11).fill(0n)] }, { account: 6110n, months: [100_000n, ...Array(11).fill(0n)] }] },
  previous: { year: prev, months: fyMonths(prev), opening: new Map<number, bigint>(), balances: [{ account: 1930n, months: [5_000_000n, ...Array(11).fill(0n)] }, { account: 2081n, months: [-5_000_000n, ...Array(11).fill(0n)] }] },
  vouchers: [voucher("A", 2n, [[6110, 50_000n], [1930, -50_000n]]), voucher("A", 1n, [[6110, 50_000n, "Papper"], [1930, -50_000n]])],
});

test("codepage 437, amounts and fields", () => {
  expect(Array.from(encode437("åäöÅÄÖé"))).toEqual([0x86, 0x84, 0x94, 0x8f, 0x8e, 0x99, 0x82]);
  expect(decode437(encode437("Målerifirman Åström"))).toBe("Målerifirman Åström");
  expect(Array.from(encode437("€"))).toEqual([63]); // not in 437
  expect(amount(-123450n)).toBe("-1234.50");
  expect(amount(5n)).toBe("0.05");
  expect(parseAmount("-1234.5")).toBe(-123450n);
  expect(parseAmount("23780")).toBe(2_378_000n);
  expect(() => parseAmount("1,50")).toThrow();
  // 5.7 and 10.15: quotes optional, \" inside, {} object lists as one field.
  expect(fields('#KONTO 1915 "Kassa \\"special\\""')).toEqual(["#KONTO", "1915", 'Kassa "special"']);
  expect(fields('#TRANS 7010 {"1" "456"} 13200.00')).toEqual(["#TRANS", "7010", '{"1" "456"}', "13200.00"]);
});

test("4E file: item order, compulsory items, balances and verifications", () => {
  const text = sie4(input());
  const lines = text.split("\n");
  expect(lines[0]).toBe("#FLAGGA 0");
  expect(text).not.toContain("\r");
  for (const label of ["#PROGRAM", "#FORMAT PC8", "#GEN 20261126", "#SIETYP 4", '#FNAMN "Målerifirman Åström AB"', "#ORGNR 556036-0793", "#RAR 0 20260101 20261231", "#RAR -1 20250101 20251231", "#KONTO 1930"]) {
    expect(text).toContain(label);
  }
  // Groups in order (5.12): identification, chart of accounts, balances, verifications.
  const at = (p: string) => lines.findIndex((l) => l.startsWith(p));
  expect(at("#FNAMN")).toBeLessThan(at("#KONTO"));
  expect(at("#KONTO")).toBeLessThan(at("#IB"));
  expect(at("#IB")).toBeLessThan(at("#VER"));
  expect(text).toContain("#KTYP 1930 T");
  expect(text).toContain("#KTYP 6110 K");
  expect(text).toContain("#IB 0 1930 50000.00");
  expect(text).toContain("#UB 0 1930 49000.00");
  expect(text).toContain("#UB -1 1930 50000.00");
  expect(text).toContain("#RES 0 6110 1000.00");
  expect(text).toContain("#PSALDO 0 202601 6110 {} 1000.00");
  // Verifications in ascending number order within a series (#VER 7); quotes escaped.
  expect(at("#VER \"A\" 1 ")).toBeLessThan(at("#VER \"A\" 2 "));
  expect(text).toContain('#VER "A" 1 20260315 "Kontorsmaterial \\"special\\"" 20260315');
  expect(text).toContain('#TRANS 6110 {} 500.00 "" "Papper"');
});

test("parse round trip, #RTRANS/#BTRANS and opening balances", () => {
  const f = parseSie(encode437(sie4(input())));
  expect(f.sieType).toBe("4");
  expect(f.company).toBe("Målerifirman Åström AB");
  expect(f.accounts.get(2099)).toBe("Årets resultat");
  expect(f.vers.map((v) => v.number)).toEqual(["1", "2"]);
  expect(f.vers[0].text).toBe('Kontorsmaterial "special"');
  expect(f.vers[0].trans).toEqual([{ account: 6110, amount: 50_000n, text: "Papper" }, { account: 1930, amount: -50_000n, text: "" }]);
  // The spec's example (#RTRANS, then the identical #TRANS once; #BTRANS ignored).
  const r = parseSie(encode437(`#FLAGGA 0\n#VER "" "" 20250101 "Postage"\n{\n#TRANS 1910 {} -1000.00\n#TRANS 2640 {} 200.00\n#BTRANS 6110 {} 800.00\n#RTRANS 6250 {} 800.00\n#TRANS 6250 {} 800.00\n}\n#OKAND 1 2\n`));
  expect(r.vers[0].trans.map((t) => [t.account, t.amount])).toEqual([[1910, -100_000n], [2640, 20_000n], [6250, 80_000n]]);
  // Opening balances: #IB of a year starting the same day …
  expect([...openingFromSie(f, "2026-01-01")!.lines]).toEqual([[1930, 5_000_000n], [2081, -5_000_000n]]);
  // … or #UB of the year that ended the day before; 2099 goes to 2098, result accounts are left out.
  const old = parseSie(encode437("#RAR 0 20250101 20251231\n#UB 0 1930 1500.00\n#UB 0 2099 -500.00\n#UB 0 2081 -1000.00\n#RES 0 3001 -500.00\n"));
  expect([...openingFromSie(old, "2026-01-01")!.lines]).toEqual([[1930, 150_000n], [2098, -50_000n], [2081, -100_000n]]);
  expect(openingFromSie(old, "2027-01-01")).toBeNull();
});

test("CRC-32 and the stored ZIP", () => {
  expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  const entries = [{ name: "manifest.json", data: new TextEncoder().encode("{}") }, { name: "files/1-kvitto_åäö.pdf", data: new Uint8Array([1, 2, 3, 255]) }];
  const z = zip(entries, new Date("2026-11-26T10:00:00Z"));
  expect(Array.from(z.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  const back = unzip(z);
  expect(back.map((e) => e.name)).toEqual(entries.map((e) => e.name));
  expect(Array.from(back[1].data)).toEqual([1, 2, 3, 255]);
  const bad = z.slice();
  bad[30 + "manifest.json".length] ^= 1; // first data byte
  expect(() => unzip(bad)).toThrow(/crc/);
});
