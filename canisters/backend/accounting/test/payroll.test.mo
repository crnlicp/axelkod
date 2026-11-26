// Payroll (V7–V11): fee categories incl. the youth reduction (born 2005, paid May 2026 →
// 20,81 % up to 25 000 kr), tax-table lookups with rows from Skatteverket's 2026 file,
// a payslip and its voucher, the AGI sums of Skatteverket's example 15, växa-stöd.
import { suite; test; expect } "mo:test";
import Array "mo:core/Array";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import PayLib "../src/lib/Payroll";
import Seed "../src/lib/Seed";
import Pr "../src/types/Payroll";
import Types "../src/types";

let p : Pr.Params = {
  year = 2026; feeFullBp = 3142; feePensionBp = 1021; pensionAge = 67; zeroBornBefore = 1938;
  youth = ?{ fromPeriod = "202604"; toPeriod = "202709"; minAge = 18; maxAge = 22; bp = 2081; cap = 2_500_000 };
  yearThreshold = 100_000; flatTaxBp = 3000; vacationPercentBp = 1200; vacationSupplementBp = 43; vaxaRefundBp = 2121;
  vaxaCap = 3_500_000; vaxaCapBefore202405 = 2_500_000; vaxaMonths = 24; mileageOwn = 2_500; mileageBenefitCar = 1_200;
  mileageElectric = 950; perDiemFull = 30_000; perDiemHalf = 15_000; perDiemAfter3Months = 21_000; perDiemNight = 15_000;
  mealBreakfast = 6_200; mealLunch = 12_400; mealFull = 31_000; prisbasbelopp = 5_920_000; source = "test";
};

let owner = Principal.fromText("2vxsx-fae");

// Table 33, 2026 (allmanna-tabeller-manad.txt): two amount rows and two percent rows.
let t33 : Pr.TaxTable = {
  year = 2026; table = 33; sha256 = ""; importedAt = 0; importedBy = owner;
  rows = [
    { from = 29_801; to = 30_000; percent = false; cols = [5878, 5748, 2644, 5878, 9103, 9103] },
    { from = 30_001; to = 30_200; percent = false; cols = [5928, 5796, 2692, 5928, 9175, 9175] },
    { from = 80_001; to = 81_000; percent = true; cols = [33, 33, 29, 29, 39, 39] },
    { from = 1_269_001; to = 9_999_999; percent = true; cols = [52, 52, 52, 44, 52, 52] },
  ];
};

let items = Map.empty<Text, Pr.PayItem>();
for (i in Seed.payItems().values()) items.add(i.code, i);

func emp(id : Nat, birthYear : Nat, tax : Pr.Tax) : Pr.Employee = {
  id; name = "Anställd " # id.toText(); email = null; birthYear; employedFrom = "2025-01-01"; employedTo = null;
  pay = #monthly(3_000_000); tax; jamkning = null; vacationRule = #procentregeln; vacationDays = 25; ownerOrRelated = false;
  vaxaFrom = null; costCenter = null; active = true; personnummerEnc = "............"; addressEnc = null; bankAccountEnc = null;
  workplaceStreet = null; workplaceCity = null;
};

func line(code : Text, amount : Int) : Pr.PayLine = { code; text = null; quantity = 1_000; rate = amount; amount };

suite("Employer fee categories (V8)", func() {
  test("born 2005 paid May 2026: youth, 20,81 % up to 25 000 kr, 31,42 % above", func() {
    expect.bool(PayLib.category(p, 2005, "202605") == #youth).isTrue();
    expect.int(PayLib.fees(p, #youth, 3_000_000)).equal(520_250 + 157_100); // 5 202,50 + 1 571,00
    expect.int(PayLib.fees(p, #youth, 2_000_000)).equal(416_200);
  });
  test("youth only from April 2026 to September 2027, ages 18–22 at the start of the year", func() {
    expect.bool(PayLib.category(p, 2005, "202603") == #full).isTrue();
    expect.bool(PayLib.category(p, 2003, "202612") == #youth).isTrue();
    expect.bool(PayLib.category(p, 2002, "202606") == #full).isTrue();
    expect.bool(PayLib.category(p, 2008, "202606") == #full).isTrue(); // 17 at the start of 2026
    expect.bool(PayLib.category(p, 2008, "202709") == #youth).isTrue();
    expect.bool(PayLib.category(p, 2008, "202710") == #full).isTrue();
  });
  test("turned 67 before the year: 10,21 %; born 1937 or earlier: 0 %", func() {
    expect.bool(PayLib.category(p, 1958, "202605") == #pension).isTrue();
    expect.bool(PayLib.category(p, 1959, "202605") == #full).isTrue();
    expect.bool(PayLib.category(p, 1937, "202605") == #none).isTrue();
    expect.int(PayLib.fees(p, #pension, 2_535_000)).equal(258_824);
    expect.int(PayLib.fees(p, #none, 1_670_000)).equal(0);
  });
});

suite("Tax tables (V10)", func() {
  test("amount rows, percent rows, above the last row", func() {
    expect.bool(PayLib.tableTax(t33, 1, 30_000) == ?5878).isTrue();
    expect.bool(PayLib.tableTax(t33, 3, 30_150) == ?2692).isTrue();
    expect.bool(PayLib.tableTax(t33, 1, 80_500) == ?26_565).isTrue(); // 33 % of 80 500
    expect.bool(PayLib.tableTax(t33, 1, 2_000_000) == ?1_040_000).isTrue();
    expect.bool(PayLib.tableTax(t33, 8, 30_000) == null).isTrue();
  });
  test("rows must be ordered and have six or seven columns", func() {
    expect.bool(PayLib.checkRows(t33.rows) == #ok(())).isTrue();
    expect.bool(PayLib.checkRows([t33.rows[1], t33.rows[0]]) == #ok(())).isFalse();
  });
});

suite("Payslip and voucher", func() {
  let e = emp(1, 1990, #table({ table = 33; column = 1 }));
  test("tax from the table on cash + benefits, fees on the base, vacation 12 % of vacation-bearing pay", func() {
    let s = switch (PayLib.calc(p, items, e, { employeeId = 1; lines = [line("LON", 2_800_000), line("BIL", 200_000), line("MIL", 50_000), line("NAVD", 10_000)]; taxOverride = null }, "202605", ?t33)) {
      case (#ok(x)) x;
      case (#err(_)) { assert false; loop {} };
    };
    expect.int(s.tax).equal(587_800); // 30 000 kr taxable → 5 878 kr
    expect.int(s.net).equal(2_800_000 + 50_000 - 587_800 - 10_000);
    expect.int(s.feeBase).equal(3_000_000);
    expect.int(s.fees).equal(942_600);
    expect.int(s.vacationAccrual).equal(336_000);
    expect.int(s.vacationFees).equal(105_571);
    expect.bool(s.agi.any(func(f : Pr.AgiField) : Bool = f.code == 11 and f.amount == 28_000)).isTrue();
    expect.bool(s.agi.any(func(f : Pr.AgiField) : Bool = f.code == 13 and f.amount == 2_000)).isTrue();
    expect.bool(s.agi.any(func(f : Pr.AgiField) : Bool = f.code == 50 and f.amount == 1)).isTrue();
    expect.bool(s.agi.any(func(f : Pr.AgiField) : Bool = f.code == 1 and f.amount == 5_878)).isTrue();
    let ls = PayLib.approveLines(items, [s]);
    var sum : Int = 0;
    for (l in ls.values()) sum += l.amount;
    expect.int(sum).equal(0);
    func on(a : Nat) : Int { var t : Int = 0; for (l in ls.values()) if (l.account == a) t += l.amount; t };
    expect.int(on(7210)).equal(2_800_000);
    expect.int(on(7331)).equal(50_000);
    expect.int(on(2710)).equal(-587_800);
    expect.int(on(2820)).equal(-s.net);
    expect.int(on(2890)).equal(-10_000);
    expect.int(on(7510)).equal(942_600);
    expect.int(on(2731)).equal(-942_600);
    expect.int(on(2920)).equal(-336_000);
    expect.int(on(2941)).equal(-105_571);
  });
  test("a missing table, an unknown code and the flat 30 %", func() {
    expect.bool(switch (PayLib.calc(p, items, e, { employeeId = 1; lines = [line("LON", 100_000)]; taxOverride = null }, "202605", null)) { case (#err(#invalid("taxTable"))) true; case (_) false }).isTrue();
    expect.bool(switch (PayLib.calc(p, items, e, { employeeId = 1; lines = [line("XYZ", 100_000)]; taxOverride = null }, "202605", ?t33)) { case (#err(_)) true; case (_) false }).isTrue();
    let flat = emp(2, 1990, #flat(3000));
    switch (PayLib.calc(p, items, flat, { employeeId = 2; lines = [line("TIM", 1_234_567)]; taxOverride = null }, "202605", null)) {
      case (#ok(s)) expect.int(s.tax).equal(370_300); // 30 % of 12 345 kr, whole kronor
      case (#err(_)) assert false;
    };
  });
});

suite("AGI sums (V7, Skatteverket's example 15, period 202604)", func() {
  // Ages: 1982 full, 1944 pension, 1936 none, 2007 youth.
  let employees = Map.empty<Nat, Pr.Employee>();
  for ((id, b) in [(1, 1982), (2, 1944), (3, 1936), (4, 2007)].values()) employees.add(id, emp(id, b, #none));
  func slip(id : Nat, fields : [Pr.AgiField]) : Pr.Payslip = {
    employeeId = id; name = ""; lines = []; cash = 0; benefits = 0; taxFree = 0; netDeductions = 0; tax = 0; net = 0;
    feeBase = 0; feeCategory = #full; fees = 0; vacationAccrual = 0; vacationFees = 0; agi = fields;
  };
  let run : Pr.PayRun = {
    id = 9; period = "202604"; paymentDate = "2026-04-25"; inputs = []; status = #approved; voucherId = null; paidVoucherId = null;
    approvedAt = null; approvedBy = null; updatedAt = 0;
    slips = [
      slip(1, [{ code = 11; amount = 28_500 }, { code = 13; amount = 2_500 }, { code = 18; amount = 1_200 }, { code = 1; amount = 9_300 }]),
      slip(2, [{ code = 11; amount = 25_350 }, { code = 1; amount = 7_590 }, { code = 50; amount = 1 }]),
      slip(3, [{ code = 11; amount = 16_700 }, { code = 1; amount = 3_250 }, { code = 51; amount = 1 }]),
      slip(4, [{ code = 11; amount = 25_800 }, { code = 13; amount = 2_500 }, { code = 1; amount = 8_000 }]),
    ];
  };
  test("487 = 18 881 and 497 = 28 140 as in the example file", func() {
    let (ind, fees, tax) = PayLib.agi(p, employees, [run], "202604");
    expect.nat(ind.size()).equal(4);
    expect.int(fees).equal(18_881);
    expect.int(tax).equal(28_140);
  });
});

suite("Växa-stöd (V9)", func() {
  test("Skatteverket's example: 42 500 kr → 7 423 kr; employment before May 2024 → 25 000 kr cap", func() {
    let e = { emp(1, 1990, #none) with employedFrom = "2026-01-01" };
    let (cap, refund) = PayLib.vaxaRefund(p, e, 42_500);
    expect.int(cap).equal(35_000);
    expect.int(refund).equal(7_423);
    let (cap2, _) = PayLib.vaxaRefund(p, { e with employedFrom = "2024-04-30" }, 42_500);
    expect.int(cap2).equal(25_000);
  });
  test("periods", func() {
    expect.int(PayLib.monthsBetween("202601", "202712")).equal(23);
    expect.text(PayLib.periodOf("2026-05-25")).equal("202605");
    expect.bool(PayLib.validPeriod("202613")).isFalse();
  });
});
