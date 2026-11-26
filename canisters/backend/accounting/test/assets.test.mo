// Fixed assets and inventory (V25, V26): the straight-line schedule month by month, catch-up
// and the never-twice rule, disposal postings with gain or loss, FIFO cost of what is left,
// the lowest-value principle and the 97 % rule.
import { suite; test; expect } "mo:test";
import Array "mo:core/Array";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import AssetsLib "../src/lib/Assets";
import Seed "../src/lib/Seed";
import A "../src/types/Assets";
import Types "../src/types";

func newChart() : Types.Chart {
  let c : Types.Chart = { fiscalYears = Map.empty(); accounts = Map.empty(); vatCodes = Map.empty(); series = Map.empty() };
  for (a in Seed.accounts.values()) c.accounts.add(a.number, a);
  c;
};
let chart = newChart();

let input : A.AssetInput = {
  name = "Servicebil-verktyg"; tag = ?"INV-1"; accounts = { cost = 1220; accumulated = 1229; expense = 7832 };
  acquired = "2026-03-14"; inUse = "2026-04-02"; cost = 3_000_000; residual = 0; lifeMonths = 60;
  openingDepreciation = 0; purchaseId = null; note = null;
};
func asset(i : A.AssetInput, deps : [A.Depreciation]) : A.Asset = { i with id = 1; depreciations = deps; disposal = null; createdAt = 0 };

func sum(ls : [Types.VoucherLine]) : Int = ls.foldLeft(0 : Int, func(s, l) = s + l.amount);
func on(ls : [Types.VoucherLine], n : Nat) : Int = ls.foldLeft(0 : Int, func(s, l) = if (l.account == n) s + l.amount else s);

suite("asset input", func() {
  test("accepts a valid asset and trims the name", func() {
    switch (AssetsLib.checkAsset({ input with name = " Svets " }, chart)) { case (#ok(a)) expect.text(a.name).equal("Svets"); case (#err(_)) assert false };
  });
  test("rejects wrong accounts, dates, residual and life", func() {
    for (bad in [
      { input with accounts = { input.accounts with cost = 7832 } },
      { input with accounts = { input.accounts with accumulated = 1220 } },
      { input with accounts = { input.accounts with expense = 1229 } },
      { input with inUse = "2026-03-01" },
      { input with residual = 3_000_000 },
      { input with lifeMonths = 0 },
      { input with cost = 0 },
      { input with openingDepreciation = 3_000_001 },
    ].values()) switch (AssetsLib.checkAsset(bad, chart)) { case (#ok(_)) assert false; case (#err(_)) {} };
  });
});

suite("depreciation schedule", func() {
  let a = asset(input, []);
  test("starts in the month taken into use (K2 10.23)", func() {
    expect.int(AssetsLib.planned(a, "2026-03")).equal(0);
    expect.int(AssetsLib.planned(a, "2026-04")).equal(50_000); // 30 000 kr / 60 months
    expect.int(AssetsLib.planned(a, "2026-12")).equal(450_000);
  });
  test("ends at cost less residual and never goes past it", func() {
    expect.int(AssetsLib.planned(a, "2031-03")).equal(3_000_000);
    expect.int(AssetsLib.planned(a, "2035-01")).equal(3_000_000);
    let r = asset({ input with residual = 600_000 }, []);
    expect.int(AssetsLib.planned(r, "2040-01")).equal(2_400_000);
  });
  test("truncates to öre and the last month takes the remainder", func() {
    let t = asset({ input with cost = 100_000; lifeMonths = 3 }, []);
    expect.int(AssetsLib.planned(t, "2026-04")).equal(33_333);
    expect.int(AssetsLib.planned(t, "2026-05")).equal(66_666);
    expect.int(AssetsLib.planned(t, "2026-06")).equal(100_000);
  });
  test("a run catches up skipped months and books nothing twice", func() {
    expect.int(AssetsLib.due(a, "2026-06")).equal(150_000);
    let after = asset(input, [{ period = "2026-06"; amount = 150_000; voucherId = 9 }]);
    expect.int(AssetsLib.due(after, "2026-06")).equal(0);
    expect.int(AssetsLib.due(after, "2026-05")).equal(0);
    expect.int(AssetsLib.due(after, "2026-07")).equal(50_000);
    expect.int(AssetsLib.bookValue(after)).equal(2_850_000);
  });
  test("opening depreciation counts as already booked", func() {
    let o = asset({ input with inUse = "2024-01-01"; acquired = "2024-01-01"; openingDepreciation = 1_200_000 }, []);
    // Jan 2024 – Dec 2025 = 24 months planned = 1 200 000; Jan 2026 is the next month.
    expect.int(AssetsLib.due(o, "2026-01")).equal(50_000);
  });
  test("run lines: one pair per account pair, balanced", func() {
    let ls = AssetsLib.runLines([(input.accounts, 50_000), (input.accounts, 20_000), ({ input.accounts with cost = 1224 }, 10_000)], "Avskrivningar 2026-04");
    expect.nat(ls.size()).equal(2);
    expect.int(on(ls, 7832)).equal(80_000);
    expect.int(on(ls, 1229)).equal(-80_000);
    expect.int(sum(ls)).equal(0);
  });
});

suite("disposal", func() {
  // Book value 30 000 − 6 000 = 24 000 kr.
  let a = asset(input, [{ period = "2027-03"; amount = 600_000; voucherId = 1 }]);
  test("cash sale with a gain", func() {
    let ls = AssetsLib.disposalLines(a, { date = "2027-04-10"; proceeds = 2_500_000; proceedsAccount = ?1930 });
    expect.int(sum(ls)).equal(0);
    expect.int(on(ls, 1220)).equal(-3_000_000);
    expect.int(on(ls, 1229)).equal(600_000);
    expect.int(on(ls, 1930)).equal(2_500_000);
    expect.int(on(ls, 3973)).equal(-100_000);
    expect.int(on(ls, 7973)).equal(0);
  });
  test("cash sale with a loss", func() {
    let ls = AssetsLib.disposalLines(a, { date = "2027-04-10"; proceeds = 2_000_000; proceedsAccount = ?1930 });
    expect.int(sum(ls)).equal(0);
    expect.int(on(ls, 7973)).equal(400_000);
  });
  test("invoiced sale: the book value is set off against the proceeds on 3973", func() {
    let gain = AssetsLib.disposalLines(a, { date = "2027-04-10"; proceeds = 2_500_000; proceedsAccount = null });
    expect.int(sum(gain)).equal(0);
    expect.int(on(gain, 3973)).equal(2_400_000); // proceeds −2 500 000 on 3973 from the invoice → net gain 100 000
    let loss = AssetsLib.disposalLines(a, { date = "2027-04-10"; proceeds = 2_000_000; proceedsAccount = null });
    expect.int(on(loss, 3973)).equal(2_000_000);
    expect.int(on(loss, 7973)).equal(400_000);
  });
  test("scrapping books the whole book value as a loss (K2 7.14)", func() {
    let ls = AssetsLib.disposalLines(a, { date = "2027-04-10"; proceeds = 0; proceedsAccount = null });
    expect.int(sum(ls)).equal(0);
    expect.int(on(ls, 7973)).equal(2_400_000);
  });
  test("disposal before a booked month is refused", func() {
    switch (AssetsLib.checkDisposal(a, { date = "2027-02-28"; proceeds = 0; proceedsAccount = null }, chart)) { case (#ok) assert false; case (#err(_)) {} };
    switch (AssetsLib.checkDisposal(a, { date = "2027-03-31"; proceeds = 0; proceedsAccount = null }, chart)) { case (#ok) {}; case (#err(_)) assert false };
  });
});

suite("inventory", func() {
  func mv(id : Nat, date : Text, qty : Int, unitCost : Int) : A.StockMove =
    { stockItemId = 1; date; kind = if (qty > 0) #purchase else #sale; qty; unitCost; note = null; id; at = 0; by = Principal.anonymous() };
  // 10 @ 100 kr, 10 @ 120 kr, sold 12: 8 left, the last bought (IL 17:3).
  let ms = [mv(1, "2026-01-10", 10_000, 10_000), mv(2, "2026-02-10", 10_000, 12_000), mv(3, "2026-03-01", -12_000, 0)];
  test("quantity on hand by date", func() {
    expect.int(AssetsLib.qtyAt(ms, "2026-02-28")).equal(20_000);
    expect.int(AssetsLib.qtyAt(ms, "2026-03-31")).equal(8_000);
  });
  test("FIFO: what is left is priced from the newest purchases", func() {
    expect.int(AssetsLib.fifoCost(ms, "2026-03-31", 8_000)).equal(96_000);
    expect.int(AssetsLib.fifoCost(ms, "2026-03-31", 15_000)).equal(170_000); // 10 @ 120 + 5 @ 100
    expect.int(AssetsLib.fifoCost(ms, "2026-03-31", 25_000)).equal(280_000); // 5 above what came in, at the last cost
    expect.int(AssetsLib.fifoCost(ms, "2026-01-31", 8_000)).equal(80_000);
  });
  test("lowest-value principle per item (K2 12.4)", func() {
    expect.int(AssetsLib.rowValue(96_000, 8_000, ?9_000)).equal(72_000);
    expect.int(AssetsLib.rowValue(96_000, 8_000, ?20_000)).equal(96_000);
    expect.int(AssetsLib.rowValue(96_000, 8_000, null)).equal(96_000);
  });
  test("97 % rule never above the lowest value (IL 17:4, K2 12.5)", func() {
    expect.int(AssetsLib.countValue(100_000, 100_000, true)).equal(97_000);
    expect.int(AssetsLib.countValue(100_000, 90_000, true)).equal(90_000);
    expect.int(AssetsLib.countValue(100_000, 100_000, false)).equal(100_000);
  });
  test("count lines move the stock account to the counted value", func() {
    let up = AssetsLib.countLines(25_000, 1460, 4960, "Lagerinventering");
    expect.int(on(up, 1460)).equal(25_000);
    expect.int(on(up, 4960)).equal(-25_000);
    expect.nat(AssetsLib.countLines(0, 1460, 4960, "x").size()).equal(0);
  });
  test("move rules", func() {
    let base : A.StockMoveInput = { stockItemId = 1; date = "2026-05-01"; kind = #purchase; qty = 1_000; unitCost = 100; note = null };
    for (bad in [{ base with qty = -1 }, { base with unitCost = 0 }, { base with kind = #sale }, { base with kind = #count }, { base with kind = #adjust; qty = 0 }].values())
      switch (AssetsLib.checkMove(bad)) { case (#ok(_)) assert false; case (#err(_)) {} };
    switch (AssetsLib.checkMove({ base with kind = #sale; qty = -2_000 })) { case (#ok(_)) {}; case (#err(_)) assert false };
  });
  test("periods", func() {
    assert AssetsLib.periodEnd("2028-02") == ?"2028-02-29";
    assert AssetsLib.periodStart("2026-13") == null;
    assert AssetsLib.periodStart("2026-1") == null;
  });
});
