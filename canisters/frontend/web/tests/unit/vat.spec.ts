// VAT files built in the browser: eSKDUpload 6.0 (V3) and SKV574008 (V4), checked
// against the layouts and examples on Skatteverket's pages; periods and encoding.
import { expect, test } from "@playwright/test";
import { Variant_month_quarter_year, type Box, type FiscalYear } from "../../app/bindings/accounting";
import { BOXES, eslCode, eslFile, eslPeriods, latin1, vatPeriods, vatXml } from "../../app/admin/accounting/vat";

const b = (box: number, amount: bigint): Box => ({ box: BigInt(box), amount });

test("eSKDUpload: header, only non-zero boxes in file order, 49 always, signs", () => {
  // Skatteverket's example 4 (EU trade): 35, 20, 31, 48, 49.
  const xml = vatXml("556000-0175", "2024-01-31", [b(35, 50_000n), b(20, 10_000n), b(31, 1_200n), b(48, 1_200n), b(49, 0n)]);
  expect(xml.split("\r\n")).toEqual([
    '<?xml version="1.0" encoding="ISO-8859-1"?>', '<eSKDUpload Version="6.0">', "<OrgNr>556000-0175</OrgNr>", "<Moms>", "<Period>202401</Period>",
    "<InkopVaruAnnatEg>10000</InkopVaruAnnatEg>", "<MomsInkopUtgMedel>1200</MomsInkopUtgMedel>", "<ForsVaruAnnatEg>50000</ForsVaruAnnatEg>",
    "<MomsIngAvdr>1200</MomsIngAvdr>", "<MomsBetala>0</MomsBetala>", "</Moms>", "</eSKDUpload>", "",
  ]);
  // Refund: a leading minus on 49; nothing to report: only 49 = 0; quarter → last month.
  expect(vatXml("556000-0175", "2024-03-31", [b(48, 300n), b(49, -300n)])).toContain("<Period>202403</Period>\r\n<MomsIngAvdr>300</MomsIngAvdr>\r\n<MomsBetala>-300</MomsBetala>");
  expect(vatXml("556000-0175", "2024-01-31", [])).toContain("<Period>202401</Period>\r\n<MomsBetala>0</MomsBetala>\r\n</Moms>");
  expect(vatXml("556000-0175", "2024-01-31", [], " Rättelse <a> & b ")).toContain("<TextUpplysningMoms>Rättelse &lt;a&gt; &amp; b</TextUpplysningMoms>");
  expect(BOXES.map(([n]) => n).slice(-2)).toEqual([48, 49]);
  expect(BOXES).toHaveLength(29);
});

test("SKV574008: Skatteverket's example 1 (goods, triangulation, services)", () => {
  const file = eslFile("SE556000016701", "2020-01-01", "2020-01-31", { name: "Per Persson", phone: "0123-45690" }, [
    { vatNr: "FI01409351", buyer: "", goods: 16_400n, triangulation: 0n, services: 0n },
    { vatNr: "DK31283522", buyer: "", goods: 21_700n, triangulation: 13_600n, services: 0n },
    { vatNr: "ESA28480514", buyer: "", goods: 3_200n, triangulation: 0n, services: 15_300n },
  ]);
  expect(file.split("\r\n")).toEqual([
    "SKV574008;", "556000016701;2001;Per Persson;0123-45690",
    "FI01409351;16400;;;", "DK31283522;21700;13600;;", "ESA28480514;3200;;15300;", "",
  ]);
  expect(eslFile("SE556000016701", "2022-10-01", "2022-12-31", { name: "A", phone: "1", email: "post@example.se" }, []).split("\r\n")[1]).toBe("556000016701;22-4;A;1;post@example.se");
  expect(eslCode("2023-01-01", "2023-03-31")).toBe("23-1");
  expect(eslCode("2023-01-01", "2023-01-31")).toBe("2301");
});

test("ISO-8859-1: Swedish letters kept, others replaced", () => {
  expect([...latin1("åäöÅÄÖé€")]).toEqual([0xe5, 0xe4, 0xf6, 0xc5, 0xc4, 0xd6, 0xe9, 0x3f]);
});

test("periods: months, calendar quarters, fiscal year; deadlines per period", () => {
  const years: FiscalYear[] = [{ id: 1n, start: "2026-01-01", end: "2026-12-31", status: { __kind__: "open", open: null } as never }];
  const months = vatPeriods(Variant_month_quarter_year.month, years, "2026-03-15", false);
  expect(months.map((p) => p.from)).toEqual(["2026-03-01", "2026-02-01", "2026-01-01"]);
  expect(months[2]).toMatchObject({ to: "2026-01-31", due: "2026-03-12" });
  const q = vatPeriods(Variant_month_quarter_year.quarter, years, "2026-05-02", false);
  expect(q.map((p) => [p.from, p.to])).toEqual([["2026-04-01", "2026-06-30"], ["2026-01-01", "2026-03-31"]]);
  expect(vatPeriods(Variant_month_quarter_year.year, years, "2026-05-02", false)[0]).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
  const e = eslPeriods(true, "2026-11-25", 2);
  expect(e.map((p) => [p.from, p.to, p.due])).toEqual([["2026-10-01", "2026-12-31", "2027-01-25"], ["2026-07-01", "2026-09-30", "2026-10-26"]]);
});
