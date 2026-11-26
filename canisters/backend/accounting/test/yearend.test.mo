// Year-end (sources.md tax row, V16): the corporate tax calculation (20,6 %, whole tens),
// the periodiseringsfond (25 %, schablonintäkt, sixth-year reversal), the closing voucher,
// opening-balance checks and the transfer of 2099 to 2098.
import { suite; test; expect } "mo:test";
import Array "mo:core/Array";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Seed "../src/lib/Seed";
import YE "../src/lib/YearEnd";
import Y "../src/types/YearEnd";
import Types "../src/types";

func newChart() : Types.Chart {
  let c : Types.Chart = { fiscalYears = Map.empty(); accounts = Map.empty(); vatCodes = Map.empty(); series = Map.empty() };
  for (a in Seed.accounts.values()) c.accounts.add(a.number, a);
  c;
};
let chart = newChart();
let fy : Types.FiscalYear = { id = 1; start = "2026-01-01"; end = "2026-12-31"; status = #open; lockedAt = null };
let none : Y.TaxInput = { deficitIn = 0; fund = 0; otherAdd = 0; otherDeduct = 0 };

func moves(xs : [(Nat, Int)]) : Map.Map<Nat, Int> {
  let m = Map.empty<Nat, Int>();
  for ((a, v) in xs.values()) m.add(a, v);
  m;
};
func ok(r : { #ok : Y.TaxCalc; #err : Types.Error }) : Y.TaxCalc = switch (r) { case (#ok(c)) c; case (#err(_)) { assert false; loop {} } };
func sum(ls : [Types.VoucherLine]) : Int = ls.foldLeft(0 : Int, func(s, l) = s + l.amount);
func on(ls : [Types.VoucherLine], n : Nat) : Int = ls.foldLeft(0 : Int, func(s, l) = if (l.account == n) s + l.amount else s);

// Revenue 1 000 000 kr, costs 600 000 kr, representation 5 000 kr not deductible, tax-free interest 1 234 kr.
let year = moves([(3001, -100_000_000), (5010, 60_000_000), (6072, 500_000), (8314, -123_400), (1930, 39_623_400)]);

suite("tax calculation", func() {
  test("result, adjustments, taxable rounded down to tens, 20,6 %", func() {
    let c = ok(YE.calc(chart, fy, year, [], none));
    expect.int(c.result).equal(39_623_400); // 1 000 000 + 1 234 − 600 000 − 5 000
    expect.int(c.nonDeductible).equal(500_000);
    expect.int(c.taxFree).equal(123_400);
    expect.int(c.base).equal(40_000_000); // 396 234 + 5 000 − 1 234
    expect.int(c.taxable).equal(40_000_000);
    expect.int(c.tax).equal(8_240_000); // 400 000 × 20,6 %
    expect.int(c.resultAfterTax).equal(39_623_400 - 8_240_000);
  });

  test("the allocation is at most 25 % of the surplus, in whole kronor", func() {
    let c = ok(YE.calc(chart, fy, year, [], { none with fund = 10_000_000 }));
    expect.int(c.fundMax).equal(10_000_000);
    expect.int(c.taxable).equal(30_000_000);
    expect.int(c.tax).equal(6_180_000);
    expect.nat(c.fundAccount ?? 0).equal(2126);
    expect.bool(YE.calc(chart, fy, year, [], { none with fund = 10_000_100 }) == #err(#invalid("fund"))).isTrue();
    expect.bool(YE.calc(chart, fy, year, [], { none with fund = 50 }) == #err(#invalid("fund"))).isTrue();
  });

  test("taxable income rounds down to whole tens of kronor", func() {
    let c = ok(YE.calc(chart, fy, moves([(3001, -1_234_599), (1930, 1_234_599)]), [], none));
    expect.int(c.taxable).equal(1_234_000);
    expect.int(c.tax).equal(254_204); // 12 340 kr × 20,6 % = 2 542,04 kr
  });

  test("a deficit carried forward reduces the base; a loss leaves a deficit and no tax", func() {
    let c = ok(YE.calc(chart, fy, year, [], { none with deficitIn = 50_000_000 }));
    expect.int(c.base).equal(-10_000_000);
    expect.int(c.deficitOut).equal(10_000_000);
    expect.int(c.tax).equal(0);
    expect.int(c.fundMax).equal(0);
  });

  test("schablonintäkt on funds at the start: 2,55 % for 2026", func() {
    let opening : [Y.OpeningLine] = [{ account = 2125; amount = -10_000_000 }, { account = 2098; amount = 10_000_000 }];
    let c = ok(YE.calc(chart, fy, year, opening, none));
    expect.int(c.fundsAtStart).equal(10_000_000);
    expect.int(c.schablon).equal(255_000);
    expect.int(c.base).equal(40_255_000);
  });

  test("a fund made six years earlier is reversed, oldest first", func() {
    expect.nat(YE.fundYear(2120, 2026)).equal(2020);
    expect.nat(YE.fundYear(2126, 2026)).equal(2016);
    expect.nat(YE.fundYear(2129, 2026)).equal(2019);
    let opening : [Y.OpeningLine] = [
      { account = 2120; amount = -2_000_000 }, { account = 2129; amount = -1_000_000 }, { account = 2125; amount = -3_000_000 },
      { account = 2091; amount = 6_000_000 },
    ];
    let c = ok(YE.calc(chart, fy, year, opening, none));
    expect.nat(c.reversals.size()).equal(2);
    expect.nat(c.reversals[0].year).equal(2019);
    expect.int(c.reversed).equal(3_000_000);
    expect.int(c.resultAfterTax).equal(c.result + 3_000_000 - c.tax);
  });

  test("appropriations already booked by hand are refused", func() {
    expect.bool(YE.calc(chart, fy, moves([(8811, 100), (2126, -100)]), [], none) == #err(#conflict("appropriationsBooked"))).isTrue();
  });

  test("a year without verified parameters cannot be calculated", func() {
    let later = { fy with start = "2030-01-01"; end = "2030-12-31" };
    expect.bool(YE.calc(chart, later, year, [], none) == #err(#invalid("taxParams"))).isTrue();
  });
});

suite("closing voucher", func() {
  test("balanced: reversal, allocation, tax and the result to 2099", func() {
    let opening : [Y.OpeningLine] = [{ account = 2120; amount = -2_000_000 }, { account = 2091; amount = 2_000_000 }];
    let c = ok(YE.calc(chart, fy, year, opening, { none with fund = 5_000_000 }));
    let ls = YE.closingLines(c);
    expect.int(sum(ls)).equal(0);
    expect.int(on(ls, 2120)).equal(2_000_000);
    expect.int(on(ls, 8819)).equal(-2_000_000);
    expect.int(on(ls, 8811)).equal(5_000_000);
    expect.int(on(ls, 2126)).equal(-5_000_000);
    expect.int(on(ls, 8910)).equal(c.tax);
    expect.int(on(ls, 2512)).equal(-c.tax);
    expect.int(on(ls, 8999)).equal(c.resultAfterTax);
    expect.int(on(ls, 2099)).equal(-c.resultAfterTax);
    // After the voucher the result accounts sum to zero.
    expect.int(c.result + c.reversed - c.fund - c.tax - c.resultAfterTax).equal(0);
  });
});

suite("opening balances", func() {
  test("balanced, balance-sheet accounts only, once each", func() {
    let good : [Y.OpeningLine] = [{ account = 1930; amount = 5_000_000 }, { account = 2081; amount = -2_500_000 }, { account = 2091; amount = -2_500_000 }];
    expect.bool(YE.checkOpening(chart, good) == #ok(good)).isTrue();
    expect.bool(YE.checkOpening(chart, [{ account = 1930; amount = 100 }]) == #err(#invalid("unbalanced"))).isTrue();
    expect.bool(YE.checkOpening(chart, [{ account = 3001; amount = 100 }, { account = 1930; amount = -100 }]) == #err(#invalid("lines[0].account"))).isTrue();
    expect.bool(YE.checkOpening(chart, [{ account = 1930; amount = 100 }, { account = 1930; amount = -100 }]) == #err(#invalid("lines[1].duplicate"))).isTrue();
  });

  test("the transfer carries balance-sheet accounts and moves 2099 to 2098", func() {
    let closing = moves([(1930, 7_000_000), (2081, -2_500_000), (2098, -1_000_000), (2099, -3_500_000), (3001, -9_000_000), (8999, 9_000_000)]);
    let ls = YE.transferLines(closing);
    let get = func(n : Nat) : Int = ls.foldLeft(0 : Int, func(s, l) = if (l.account == n) s + l.amount else s);
    expect.int(get(2098)).equal(-4_500_000);
    expect.int(get(2099)).equal(0);
    expect.int(get(3001)).equal(0);
    expect.int(ls.foldLeft(0 : Int, func(s, l) = s + l.amount)).equal(0);
  });
});

suite("checklist helpers", func() {
  test("VAT months not covered by a return", func() {
    expect.nat(YE.missingVatMonths(fy, [])).equal(12);
    expect.nat(YE.missingVatMonths(fy, [("2026-01-01", "2026-03-31"), ("2026-04-01", "2026-06-30")])).equal(6);
    expect.nat(YE.missingVatMonths(fy, [("2026-01-01", "2026-12-31")])).equal(0);
  });

  test("non-deductible and tax-free accounts from the BAS names", func() {
    let get = func(n : Nat) : Types.Account = chart.accounts.get(n) ?? { number = n; name = ""; kind = #expense; vatCode = null; sruCode = null; active = true; bas = false };
    expect.bool(YE.nonDeductible(get(6072))).isTrue();
    expect.bool(YE.nonDeductible(get(8423))).isTrue();
    expect.bool(YE.nonDeductible(get(5010))).isFalse();
    expect.bool(YE.taxFree(get(8314))).isTrue();
    expect.bool(YE.taxFree({ get(7321) with number = 7321; name = "Skattefria traktamenten, Sverige" })).isFalse();
  });
});
