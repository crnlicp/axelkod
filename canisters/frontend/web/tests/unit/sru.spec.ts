// Year-end outputs (V15, V16, V19): BAS → INK2R, the K2 statements, INK2S/INK2, the SRU
// files against Skatteverket's format description, and the INK2/AGM/annual report dates.
import { expect, test } from "@playwright/test";
import { agmDue, annualReportDue, ink2Due } from "../../app/admin/accounting/deadlines";
import { balanceSheet, incomeStatement, ink2, ink2r, ink2s, sruFiles, sruOrgNr, statementFields, targetOf, taxPeriod } from "../../app/admin/accounting/sru";

// A small AB after the closing voucher: share capital 25 000 kr, balanced profit 10 000 kr,
// sales 500 000 kr, a fund of 30 000 kr, tax 25 950 kr, the result 264 000 kr closed to 2099.
const closed = new Map<number, bigint>([
  [1220, 4_000_000n], [1229, -800_000n], [1510, 6_250_000n], [1930, 30_045_000n], [1460, 1_000_000n],
  [2081, -2_500_000n], [2091, -1_000_000n], [2099, -26_400_000n], [2126, -3_000_000n], [2440, -1_500_000n], [2512, -2_595_000n], [2611, -2_500_000n], [2920, -1_000_000n],
  [3001, -50_000_000n], [4010, 5_000_000n], [4960, -1_000_000n], [6110, 3_000_000n], [6072, 200_000n], [7210, 10_000_000n], [7832, 800_000n],
  [8314, -5_000n], [8423, 10_000n], [8811, 3_000_000n], [8910, 2_595_000n], [8999, 26_400_000n],
]);

test("accounts map to the BAS interval table; an own SRU code wins; 899x is not reported", () => {
  expect(targetOf(1930)).toEqual({ code: 7281 });
  expect(targetOf(2611)).toEqual({ code: 7369 });
  expect(targetOf(2512)).toEqual({ code: 7368 });
  expect(targetOf(4010)).toEqual({ code: 7511 });
  expect(targetOf(4010, "7512")).toEqual({ code: 7512 });
  expect(targetOf(8811)).toEqual({ code: 7525 });
  expect(targetOf(8819)).toEqual({ code: 7420 });
  expect(targetOf(4960)).toEqual({ code: 7512 });
  expect(targetOf(4900)).toEqual({ pair: 0 });
  expect(targetOf(8999)).toBeNull();
});

test("INK2R: whole kronor, the form's signs, the result from the rounded fields", () => {
  const f = ink2r(closed);
  expect(f.get(7215)).toBe(32_000n);
  expect(f.get(7243)).toBe(10_000n);
  expect(f.get(7251)).toBe(62_500n);
  expect(f.get(7281)).toBe(300_450n);
  expect(f.get(7301)).toBe(25_000n);
  expect(f.get(7302)).toBe(274_000n);
  expect(f.get(7321)).toBe(30_000n);
  expect(f.get(7368)).toBe(25_950n);
  expect(f.get(7369)).toBe(25_000n);
  expect(f.get(7410)).toBe(500_000n);
  expect(f.get(7511)).toBe(50_000n);
  expect(f.get(7512)).toBe(-10_000n); // a credit on a cost field is given negative
  expect(f.get(7513)).toBe(32_000n); // 6110 + 6072
  expect(f.get(7514)).toBe(100_000n);
  expect(f.get(7515)).toBe(8_000n);
  expect(f.get(7417)).toBe(50n);
  expect(f.get(7522)).toBe(100n);
  expect(f.get(7525)).toBe(30_000n);
  expect(f.get(7528)).toBe(25_950n);
  expect(f.get(7450)).toBe(264_000n);
  expect(f.has(7550)).toBe(false);
  // Assets equal equity and liabilities.
  const assets = [7215, 7243, 7251, 7281].reduce((s, c) => s + (f.get(c) ?? 0n), 0n);
  const claims = [7301, 7302, 7321, 7365, 7368, 7369, 7370].reduce((s, c) => s + (f.get(c) ?? 0n), 0n);
  expect(assets).toBe(claims);
});

test("K2: the income statement adds up and the balance sheet balances, before and after closing", () => {
  const prev = new Map<number, bigint>();
  const is = incomeStatement(statementFields(closed), prev);
  const get = (rows: { label: string; cur: bigint }[], label: string) => rows.find((r) => r.label === label)?.cur;
  expect(get(is, "Nettoomsättning")).toBe(500_000n);
  expect(get(is, "Rörelseresultat")).toBe(500_000n - 50_000n + 10_000n - 32_000n - 100_000n - 8_000n);
  expect(get(is, "Årets resultat")).toBe(264_000n);
  expect(is.some((r) => r.label === "Aktiverat arbete för egen räkning")).toBe(false);
  const bs = balanceSheet(statementFields(closed), prev);
  expect(get(bs, "Summa tillgångar")).toBe(get(bs, "Summa eget kapital och skulder"));
  expect(get(bs, "Årets resultat")).toBe(264_000n);
  expect(get(bs, "Balanserat resultat")).toBe(10_000n);
  // Before the closing voucher: no tax, no fund, nothing on 2099 or 8999; the result is the open one.
  const open = new Map(closed);
  for (const a of [2099, 8999, 8811, 8910, 2126, 2512]) open.delete(a);
  const bsOpen = balanceSheet(statementFields(open), prev);
  const isOpen = incomeStatement(statementFields(open), prev);
  expect(get(isOpen, "Årets resultat")).toBe(264_000n + 30_000n + 25_950n);
  expect(get(bsOpen, "Årets resultat")).toBe(get(isOpen, "Årets resultat"));
  expect(get(bsOpen, "Summa tillgångar")).toBe(get(bsOpen, "Summa eget kapital och skulder"));
});

test("INK2S and INK2: book result, add-backs, surplus", () => {
  const r = ink2r(closed);
  const s = ink2s(r, { nonDeductible: 210_000n, taxFree: 5_000n, schablon: 0n, deficitIn: 0n, otherAdd: 0n, otherDeduct: 0n });
  expect(s.get(7650)).toBe(264_000n);
  expect(s.get(7651)).toBe(25_950n);
  expect(s.get(7653)).toBe(2_100n);
  expect(s.get(7754)).toBe(50n);
  expect(s.get(7670)).toBe(292_000n);
  expect(ink2(s).get(7104)).toBe(s.get(7670));
  const loss = ink2s(new Map([[7550, 1_000n]]), { nonDeductible: 0n, taxFree: 0n, schablon: 0n, deficitIn: 500_000n, otherAdd: 0n, otherDeduct: 0n });
  expect(loss.get(7770)).toBe(6_000n);
  expect(ink2(loss).get(7114)).toBe(6_000n);
});

test("SRU files: record order, block names, org. no. with 16, ISO 8859-1, no # in text", () => {
  expect(taxPeriod("2026-12-31")).toBe("2026P4");
  expect(taxPeriod("2027-04-30")).toBe("2027P1");
  expect(taxPeriod("2027-06-30")).toBe("2027P2");
  expect(taxPeriod("2027-08-31")).toBe("2027P3");
  expect(sruOrgNr("556000-0100")).toBe("165560000100");
  const r = ink2r(closed);
  const out = sruFiles({
    orgNr: "556000-0100", name: "Axelkod #1 AB", street: "Storgatan 1", postalCode: "123 45", city: "Göteborg", email: "info@example.se",
    start: "2026-01-01", end: "2026-12-31", created: new Date(2027, 2, 1, 9, 5, 7),
    forms: [{ form: "INK2", fields: new Map([[7104, 191_450n]]) }, { form: "INK2R", fields: r }, { form: "INK2S", fields: new Map([[7650, 264_000n], [7512, 0n]]) }],
  });
  expect(out.infoText.split("\n").slice(0, 10)).toEqual([
    "#DATABESKRIVNING_START", "#PRODUKT SRU", "#SKAPAD 20270301 090507", "#PROGRAM AXELKOD", "#FILNAMN BLANKETTER.SRU", "#DATABESKRIVNING_SLUT",
    "#MEDIELEV_START", "#ORGNR 165560000100", "#NAMN Axelkod  1 AB", "#ADRESS Storgatan 1",
  ]);
  expect(out.infoText).toContain("#POSTNR 12345\n#POSTORT Göteborg\n#EMAIL info@example.se\n#MEDIELEV_SLUT\n");
  const lines = out.blanketterText.trimEnd().split("\n");
  expect(lines.slice(0, 7)).toEqual(["#BLANKETT INK2-2026P4", "#IDENTITET 165560000100 20270301 090507", "#NAMN Axelkod  1 AB", "#UPPGIFT 7011 20260101", "#UPPGIFT 7012 20261231", "#UPPGIFT 7104 191450", "#BLANKETTSLUT"]);
  expect(lines).toContain("#BLANKETT INK2R-2026P4");
  expect(lines).toContain("#UPPGIFT 7512 -10000");
  expect(lines.filter((l) => l.startsWith("#UPPGIFT 7512")).length).toBe(1); // zero left out in INK2S
  expect(lines.at(-1)).toBe("#FIL_SLUT");
  // Every #UPPGIFT code appears once per block.
  const blocks = out.blanketterText.split("#BLANKETTSLUT");
  for (const b of blocks) { const codes = [...b.matchAll(/#UPPGIFT (\d+)/g)].map((m) => m[1]); expect(new Set(codes).size).toBe(codes.length); }
  // ISO 8859-1: "ö" is one byte 0xF6.
  expect([...out.info].includes(0xf6)).toBe(true);
  expect(out.info.length).toBe(out.infoText.length);
});

test("deadlines: INK2 by period (next weekday), AGM six months, annual report seven months", () => {
  expect(ink2Due("2026-12-31")).toBe("2027-08-02"); // 1 Aug 2027 is a Sunday (Skatteverket: 2 augusti)
  expect(ink2Due("2027-04-30")).toBe("2027-12-01");
  expect(ink2Due("2027-06-30")).toBe("2028-01-17"); // 15 Jan 2028 is a Saturday (Skatteverket: 17 januari)
  expect(ink2Due("2027-08-31")).toBe("2028-04-03"); // 1 Apr 2028 is a Saturday (Skatteverket: 3 april)
  expect(agmDue("2026-12-31")).toBe("2027-06-30");
  expect(annualReportDue("2026-12-31")).toBe("2027-08-02"); // 31 Jul 2027 is a Saturday
  expect(agmDue("2027-04-30")).toBe("2027-10-31");
});
