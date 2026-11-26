// Lön against the local accounting canister: tax table import from Skatteverket's 2026
// file, employees, a pay run with a youth-rate employee (born 2005) and a pensioner,
// approval (series P), payment (series B), the AGI return and the XML against the XSD.
// An AGI return uses up its period, so the test takes the first free one of Dec–Oct 2026.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { validateXML } from "xmllint-wasm";
import type { Employee, EmployeeInput } from "../../app/bindings/accounting";
import { agiXml, parseTaxTables } from "../../app/admin/accounting/payroll";
import { ensureOwnerAndYear, ok, owner } from "../support/accounting";

test.describe.configure({ mode: "serial" });

const fx = (p: string) => readFileSync(new URL(`../fixtures/${p}`, import.meta.url), "utf8");
const today = new Date().toISOString().slice(0, 10);
const run = Date.now() % 100000;
// The canister stores ciphertext only; a test value of the right size stands in for it.
const fakeEnc = (s: string) => new TextEncoder().encode(`enc:${s}`);
const pnrs: Record<string, string> = {};

const employee = (name: string, birthYear: number, pnr: string, tax: EmployeeInput["tax"], monthly: bigint): EmployeeInput => ({
  name, birthYear: BigInt(birthYear), employedFrom: "2026-01-01", pay: { __kind__: "monthly", monthly }, tax,
  vacationRule: "procentregeln" as EmployeeInput["vacationRule"], vacationDays: 25n, ownerOrRelated: false, active: true,
  personnummerEnc: fakeEnc(pnr), workplaceStreet: "Gatan 1", workplaceCity: "Göteborg",
});

let youth: Employee;
let senior: Employee;

test.beforeAll(async () => {
  await ensureOwnerAndYear();
  const text = fx("agi/allmanna-tabeller-manad-2026.txt");
  const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  ok(await owner.importTaxTable(2026n, 33n, parseTaxTables(text).get(33)!, sha));
  youth = ok(await owner.saveEmployee(null, employee(`Ung ${run}`, 2005, "200507154441", { __kind__: "table", table: { table: 33n, column: 1n } }, 2_800_000n)));
  senior = ok(await owner.saveEmployee(null, employee(`Senior ${run}`, 1958, "195803120190", { __kind__: "flat", flat: 3000n }, 2_000_000n)));
  pnrs[String(youth.id)] = "200507154441";
  pnrs[String(senior.id)] = "195803120190";
});

test("tables and employees: bad input is refused", async () => {
  expect((await owner.importTaxTable(2026n, 33n, [], new Uint8Array(32))).__kind__).toBe("err");
  expect((await owner.saveEmployee(null, { ...employee("X", 2005, "1", { __kind__: "table", table: { table: 99n, column: 1n } }, 1n) })).__kind__).toBe("err");
  const tables = ok(await owner.listTaxTables());
  expect(tables.find((t) => t.year === 2026n && t.table === 33n)?.rows).toBeGreaterThan(400n);
});

test("pay run: calculate, approve (P), pay (B), AGI with the youth rate, XML valid", async () => {
  const returns = ok(await owner.listAgiReturns());
  const { lockDate } = ok(await owner.getSettings());
  const runs = ok(await owner.listPayRuns());
  const period = ["202612", "202611", "202610"].find((p) => !returns.some((r) => r.period === p) && !runs.some((r) => r.period === p && r.status === "draft")
    && (!lockDate || `${p.slice(0, 4)}-${p.slice(4)}-01` > lockDate));
  test.skip(!period, "no free AGI period left on this canister");
  const paymentDate = `${period!.slice(0, 4)}-${period!.slice(4)}-25`;
  const r = ok(await owner.savePayRun(null, paymentDate, [
    { employeeId: youth.id, lines: [{ code: "LON", quantity: 1_000n, rate: 2_800_000n, amount: 2_800_000n }, { code: "MIL", quantity: 10_000n, rate: 2_500n, amount: 25_000n }] },
    { employeeId: senior.id, lines: [{ code: "LON", quantity: 1_000n, rate: 2_000_000n, amount: 2_000_000n }, { code: "BIL", quantity: 1_000n, rate: 300_000n, amount: 300_000n }] },
  ]));
  expect(r.period).toBe(period);
  const y = r.slips.find((s) => s.employeeId === youth.id)!;
  const s = r.slips.find((s) => s.employeeId === senior.id)!;
  // Born 2005: 20,81 % up to 25 000 kr and 31,42 % above (V8).
  expect(y.feeCategory).toBe("youth");
  expect(y.fees).toBe(520_250n + 94_260n);
  // Table 33, column 1, 28 000 kr (Skatteverket's 2026 file).
  const row = parseTaxTables(fx("agi/allmanna-tabeller-manad-2026.txt")).get(33)!.find((x) => x.from <= 28_000n && x.to >= 28_000n)!;
  expect(y.tax).toBe(row.cols[0] * 100n);
  expect(y.net).toBe(2_800_000n + 25_000n - y.tax);
  // Born 1958: 10,21 % on salary + car benefit; 30 % flat tax on 23 000 kr.
  expect(s.feeCategory).toBe("pension");
  expect(s.fees).toBe(234_830n);
  expect(s.tax).toBe(690_000n);

  const approved = ok(await owner.approvePayRun(r.id));
  const v = ok(await owner.getVoucher(approved.voucherId!));
  expect(v.series).toBe("P");
  expect(v.lines.reduce((a, l) => a + l.amount, 0n)).toBe(0n);
  expect(v.lines.find((l) => l.account === 2710n)?.amount).toBe(-(y.tax + s.tax));
  expect(v.lines.find((l) => l.account === 2731n)?.amount).toBe(-(y.fees + s.fees));
  expect(v.lines.find((l) => l.account === 7331n)?.amount).toBe(25_000n);
  expect((await owner.savePayRun(r.id, paymentDate, [])).__kind__).toBe("err");

  const paid = ok(await owner.markPayRunPaid(r.id, today));
  const b = ok(await owner.getVoucher(paid.paidVoucherId!));
  expect(b.series).toBe("B");
  expect(b.lines.find((l) => l.account === 1930n)?.amount).toBe(-(y.net + s.net));

  const a = ok(await owner.createAgiReturn(period!));
  const iu = a.individuals.find((i) => i.employeeId === youth.id)!;
  expect(iu.fields).toEqual(expect.arrayContaining([{ code: 11n, amount: 28_000n }, { code: 50n, amount: 1n }, { code: 1n, amount: row.cols[0] }]));
  // 487 per Skatteverket's rule on whole kronor: youth 25 000 × 20,81 % + 3 000 × 31,42 % ; senior 23 000 × 10,21 %.
  const exact = 25_000 * 0.2081 + 3_000 * 0.3142 + 23_000 * 0.1021;
  const others = a.individuals.length - 2;
  if (others === 0) expect(Number(a.sumFees)).toBe(Math.floor(exact));
  expect(a.sumTax).toBeGreaterThanOrEqual(row.cols[0] + 6_900n);
  expect((await owner.createAgiReturn(period!)).__kind__).toBe("err");

  const employees = ok(await owner.listEmployees());
  const company = ok(await owner.getCompany())!;
  const payees = a.individuals.map((i) => ({ employeeId: i.employeeId, personnummer: pnrs[String(i.employeeId)] ?? "198202252386", street: "Gatan 1", city: "Göteborg" }));
  expect(employees.length).toBeGreaterThanOrEqual(2);
  const xml = agiXml(company, { name: "Test Person", phone: "031-123456", email: "lon@example.se" }, a, payees, new Date());
  const res = await validateXML({
    xml: [{ fileName: "agi.xml", contents: xml }],
    schema: [{ fileName: "arbetsgivardeklaration_1.1.xsd", contents: fx("xsd/agi-1.1/arbetsgivardeklaration_1.1.xsd") }],
    preload: [{ fileName: "arbetsgivardeklaration_component_1.1.xsd", contents: fx("xsd/agi-1.1/arbetsgivardeklaration_component_1.1.xsd") }],
  });
  expect(res.errors.map((e) => e.rawMessage)).toEqual([]);

  // Växa-stöd needs the AGI filed first, and never for someone without växa months.
  expect((await owner.createVaxa(period!, youth.id)).__kind__).toBe("err");
  const filed = ok(await owner.markAgiFiled(a.id, "AGI-1"));
  expect(filed.receiptRef).toBe("AGI-1");
  expect((await owner.approvePayRun(r.id)).__kind__).toBe("err");
});
