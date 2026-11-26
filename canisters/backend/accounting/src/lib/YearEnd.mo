// Year-end (A9b): closing balances, opening-balance checks, the corporate tax calculation
// and the closing voucher. Sources (docs/accounting/sources.md, tax row): IL 1:7 (taxable
// income rounded down to whole tens), 30:5 (fund ≤ 25 %), 30:6 a (schablonintäkt), 30:7
// (reversal in the sixth year, oldest first), 65:10 (20,6 %). BAS 2026 account names.
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Chart "Chart";
import Dates "Dates";
import Ledger "Ledger";
import Y "../types/YearEnd";
import Types "../types";

module {
  type R<T> = Result.Result<T, Types.Error>;

  public let SERIES = "X";
  public let RESULT_ACCOUNT = 2099; // Årets resultat
  public let PREVIOUS_RESULT = 2098; // Vinst eller förlust från föregående år
  public let RESULT_PL = 8999; // Årets resultat (resultaträkning)
  public let TAX_COST = 8910; // Skatt som belastar årets resultat
  public let TAX_LIABILITY = 2512; // Beräknad inkomstskatt
  public let FUND_ALLOCATION = 8811; // Avsättning till periodiseringsfond
  public let FUND_REVERSAL = 8819; // Återföring från periodiseringsfond
  public let MAX_OPENING = 500;

  /// Verified rates (sources.md, tax row). A year that is not listed cannot be calculated.
  public let PARAMS : [Y.TaxParams] = [
    { year = 2026; corporateTaxBp = 2060; fundMaxBp = 2500; statslaneRantaBp = 255; source = "IL 65:10, 30:5, 30:6 a; Skatteverket Belopp och procent 2026" },
  ];

  public func params(year : Nat) : ?Y.TaxParams = PARAMS.find(func(p : Y.TaxParams) : Bool = p.year == year);

  public func yearOf(date : Text) : Nat = switch (Dates.parse(date)) { case (?c) c.y; case null 0 };

  /// Periodiseringsfond accounts 2120–2139: the year in the BAS name ends in the last digit.
  public func isFundAccount(n : Nat) : Bool = n >= 2120 and n <= 2139;
  public func fundAccountFor(year : Nat) : Nat = 2120 + year % 10;

  /// The year a fund on account `n` was made, seen from a tax year ending in `endYear`.
  public func fundYear(n : Nat, endYear : Nat) : Nat {
    let d = n % 10;
    let back = Nat.sub(endYear + 10, d) % 10;
    let b = if (back == 0) 10 else back;
    if (endYear >= b) Nat.sub(endYear, b) else 0;
  };

  /// BAS names "… ej avdragsgill(a)" and 8423 Räntekostnader för skatter och avgifter.
  public func nonDeductible(a : Types.Account) : Bool =
    a.number == 8423 or a.name.toLower().contains(#text "ej avdragsgill");

  /// Tax-free income: financial income named "skattefri…" (8254, 8314).
  public func taxFree(a : Types.Account) : Bool =
    a.number >= 8000 and a.number < 8800 and a.name.toLower().contains(#text "skattefri");

  /// Opening balance + movements for every account with a balance at the end of the year.
  public func closingBalances(ledger : Types.Ledger, fy : Types.FiscalYear, opening : [Y.OpeningLine]) : Map.Map<Nat, Int> {
    let m = Map.empty<Nat, Int>();
    for (l in opening.values()) m.add(l.account, (m.get(l.account) ?? 0) + l.amount);
    for (row in Ledger.balances(ledger, fy).values()) {
      var s : Int = 0;
      for (x in row.months.values()) s += x;
      m.add(row.account, (m.get(row.account) ?? 0) + s);
    };
    m;
  };

  public func checkOpening(chart : Types.Chart, lines : [Y.OpeningLine]) : R<[Y.OpeningLine]> {
    if (lines.size() > MAX_OPENING) return #err(#invalid("lines"));
    let seen = Map.empty<Nat, ()>();
    var sum : Int = 0;
    for ((i, l) in lines.enumerate()) {
      let field = "lines[" # i.toText() # "]";
      if (l.account < 1000 or l.account > 2999 or not chart.accounts.containsKey(l.account)) return #err(#invalid(field # ".account"));
      if (l.amount == 0) return #err(#invalid(field # ".amount"));
      if (seen.containsKey(l.account)) return #err(#invalid(field # ".duplicate"));
      seen.add(l.account, ());
      sum += l.amount;
    };
    if (sum != 0) return #err(#invalid("unbalanced"));
    #ok(lines);
  };

  /// Next year's opening balances: balance-sheet accounts carried over, 2099 moved to 2098.
  public func transferLines(closing : Map.Map<Nat, Int>) : [Y.OpeningLine] {
    let m = Map.empty<Nat, Int>();
    for ((acc, a) in closing.entries()) if (acc >= 1000 and acc <= 2999 and a != 0) {
      let target = if (acc == RESULT_ACCOUNT) PREVIOUS_RESULT else acc;
      m.add(target, (m.get(target) ?? 0) + a);
    };
    m.entries().filter(func((_, a) : (Nat, Int)) : Bool = a != 0).map(func((account, amount) : (Nat, Int)) : Y.OpeningLine = { account; amount }).toArray();
  };

  func floorTo(x : Int, unit : Int) : Int = if (x >= 0) (x / unit) * unit else -(((-x) + unit - 1) / unit) * unit;

  /// The tax calculation for a year from its balances; see the module header.
  public func calc(chart : Types.Chart, fy : Types.FiscalYear, movements : Map.Map<Nat, Int>, opening : [Y.OpeningLine], input : Y.TaxInput) : R<Y.TaxCalc> {
    let endYear = yearOf(fy.end);
    let p = params(endYear) ?? (return #err(#invalid("taxParams")));
    if (input.deficitIn < 0) return #err(#invalid("deficitIn"));
    if (input.fund < 0 or input.fund % 100 != 0) return #err(#invalid("fund"));
    if (input.otherAdd < 0 or input.otherDeduct < 0) return #err(#invalid("adjustments"));
    var result : Int = 0;
    var nonDed : Int = 0;
    var free : Int = 0;
    for ((acc, a) in movements.entries()) {
      if (acc >= 8800 and acc <= 8999 and a != 0) return #err(#conflict("appropriationsBooked"));
      if (acc >= 3000 and acc < 8800) {
        result -= a;
        switch (chart.accounts.get(acc)) {
          case (?account) {
            if (nonDeductible(account)) nonDed += a;
            if (taxFree(account)) free -= a;
          };
          case null {};
        };
      };
    };
    // Funds at the start of the year (credit balances), and those due for reversal.
    var funds : Int = 0;
    var reversals : [Y.Reversal] = [];
    for (l in opening.values()) if (l.account >= 2110 and l.account <= 2149 and l.amount < 0) {
      funds += -l.amount;
      if (isFundAccount(l.account)) {
        let made = fundYear(l.account, endYear);
        if (endYear >= made + 6) reversals := reversals.concat([{ account = l.account; year = made; amount = -l.amount }]);
      };
    };
    reversals := reversals.sort(func(a : Y.Reversal, b : Y.Reversal) : { #less; #equal; #greater } = Nat.compare(a.year, b.year));
    var reversed : Int = 0;
    for (r in reversals.values()) reversed += r.amount;
    let months = Chart.months(fy);
    let rateBp : Int = Nat.max(p.statslaneRantaBp, 50);
    let schablon = floorTo(funds * rateBp * months / (10_000 * 12), 100);
    let base = result + reversed + nonDed - free + schablon + input.otherAdd - input.otherDeduct - input.deficitIn;
    let fundMax = if (base > 0) floorTo(base * p.fundMaxBp / 10_000, 100) else 0;
    if (input.fund > fundMax) return #err(#invalid("fund"));
    let fundAccount = if (input.fund > 0) {
      let n = fundAccountFor(endYear);
      if (not chart.accounts.containsKey(n)) return #err(#invalid("fundAccount"));
      ?n;
    } else null;
    let surplus = base - input.fund;
    let taxable = if (surplus > 0) floorTo(surplus, 1_000) else 0;
    let tax = taxable * p.corporateTaxBp / 10_000;
    #ok({
      result; nonDeductible = nonDed; taxFree = free; fundsAtStart = funds; schablon; reversals; reversed;
      otherAdd = input.otherAdd; otherDeduct = input.otherDeduct; deficitIn = input.deficitIn; base; fundMax;
      fund = input.fund; fundAccount; surplus; deficitOut = if (surplus < 0) -surplus else 0; taxable; tax;
      resultAfterTax = result + reversed - input.fund - tax; params = p;
    });
  };

  func line(account : Nat, amount : Int, text : Text) : Types.VoucherLine =
    { account; amount; vatCode = null; text = ?text; costCenter = null; project = null; quantity = null };

  /// Fund reversals, the allocation, the tax and the year's result, in one voucher.
  public func closingLines(c : Y.TaxCalc) : [Types.VoucherLine] {
    var ls : [Types.VoucherLine] = [];
    for (r in c.reversals.values()) ls := ls.concat([line(r.account, r.amount, "Återföring periodiseringsfond " # r.year.toText()), line(FUND_REVERSAL, -r.amount, "Återföring periodiseringsfond " # r.year.toText())]);
    switch (c.fundAccount) {
      case (?acc) ls := ls.concat([line(FUND_ALLOCATION, c.fund, "Avsättning periodiseringsfond"), line(acc, -c.fund, "Avsättning periodiseringsfond")]);
      case null {};
    };
    if (c.tax != 0) ls := ls.concat([line(TAX_COST, c.tax, "Beräknad inkomstskatt"), line(TAX_LIABILITY, -c.tax, "Beräknad inkomstskatt")]);
    if (c.resultAfterTax != 0) ls := ls.concat([line(RESULT_PL, c.resultAfterTax, "Årets resultat"), line(RESULT_ACCOUNT, -c.resultAfterTax, "Årets resultat")]);
    ls;
  };

  /// Months of the year (by their first day) not covered by any VAT return (from, to).
  public func missingVatMonths(fy : Types.FiscalYear, returns : [(Text, Text)]) : Nat {
    var missing = 0;
    var d = fy.start;
    while (d <= fy.end) {
      let m = d;
      if (not returns.any(func((from, to) : (Text, Text)) : Bool = from <= m and m <= to)) missing += 1;
      d := switch (Dates.parse(d)) {
        case (?c) Dates.format(if (c.m == 12) ({ y = c.y + 1; m = 1; d = 1 }) else ({ y = c.y; m = c.m + 1; d = 1 }));
        case null "9999-12-31";
      };
    };
    missing;
  };

  public func emptyClosing(fiscalYearId : Nat) : Y.Closing = {
    fiscalYearId; confirmed = []; bankStatement = null; taxStatement = null; cashVoucherId = null;
    cashReversalId = null; tax = null; taxInput = null; closingVoucherId = null; transferredTo = null;
  };

  public func reverse(lines : [Types.VoucherLine]) : [Types.VoucherLine] = lines.map(func(l : Types.VoucherLine) : Types.VoucherLine = { l with amount = -l.amount });
};
