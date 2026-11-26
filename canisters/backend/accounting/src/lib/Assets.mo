// Fixed assets and inventory (A9a): depreciation schedules, disposal postings and the
// stock valuation at a count. Pure functions; the mixin owns state and posting.
// Sources: docs/accounting/sources.md V25 (IL 18 kap., K2 kap. 10), V26 (IL 17 kap., K2 kap. 12).
import Array "mo:core/Array";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Dates "Dates";
import A "../types/Assets";
import Types "../types";

module {
  type R<T> = Result.Result<T, Types.Error>;
  type Money = Types.Money;

  public let SERIES = "I";
  public let GAIN_ACCOUNT = 3973;
  public let LOSS_ACCOUNT = 7973;
  public let MAX_LIFE_MONTHS = 1_200;
  public let MAX_ROWS = 400;

  /// "YYYY-MM" -> the first day of that month.
  public func periodStart(p : Text) : ?Text {
    if (p.size() != 7) return null;
    let d = p # "-01";
    if (Dates.isValid(d)) ?d else null;
  };

  public func periodEnd(p : Text) : ?Text {
    let s = periodStart(p) ?? (return null);
    let c = Dates.parse(s) ?? (return null);
    ?Dates.format({ c with d = Dates.daysInMonth(c.y, c.m) });
  };

  public func periodOf(date : Text) : Text = Text.fromIter(date.chars().take(7));

  func line(account : Nat, amount : Money, text : ?Text) : Types.VoucherLine =
    { account; amount; vatCode = null; costCenter = null; project = null; quantity = null; text };

  func account(chart : Types.Chart, n : Nat, field : Text, ok : Nat -> Bool) : R<()> =
    switch (chart.accounts.get(n)) {
      case (?a) { if (a.active and ok(n)) #ok(()) else #err(#invalid(field)) };
      case null { #err(#invalid(field)) };
    };

  func optText(t : ?Text, max : Nat, field : Text) : R<?Text> = switch (t) {
    case (?x) {
      let y = x.trim(#char ' ');
      if (y.size() > max) #err(#invalid(field)) else if (y.size() == 0) #ok(null) else #ok(?y);
    };
    case null { #ok(null) };
  };

  public func checkAsset(i : A.AssetInput, chart : Types.Chart) : R<A.AssetInput> {
    let name = i.name.trim(#char ' ');
    if (name.size() == 0 or name.size() > 200) return #err(#invalid("name"));
    let tag = switch (optText(i.tag, 50, "tag")) { case (#ok(t)) t; case (#err(e)) return #err(e) };
    let note = switch (optText(i.note, 500, "note")) { case (#ok(t)) t; case (#err(e)) return #err(e) };
    // Balance-sheet accounts for cost and accumulated depreciation, a cost account for the expense.
    switch (account(chart, i.accounts.cost, "accounts.cost", func n = n >= 1000 and n < 1400)) { case (#err(e)) return #err(e); case (#ok) {} };
    switch (account(chart, i.accounts.accumulated, "accounts.accumulated", func n = n >= 1000 and n < 1400 and n != i.accounts.cost)) { case (#err(e)) return #err(e); case (#ok) {} };
    switch (account(chart, i.accounts.expense, "accounts.expense", func n = n >= 7700 and n < 7900)) { case (#err(e)) return #err(e); case (#ok) {} };
    if (not Dates.isValid(i.acquired)) return #err(#invalid("acquired"));
    if (not Dates.isValid(i.inUse) or i.inUse < i.acquired) return #err(#invalid("inUse"));
    if (i.cost <= 0) return #err(#invalid("cost"));
    if (i.residual < 0 or i.residual >= i.cost) return #err(#invalid("residual"));
    if (i.lifeMonths == 0 or i.lifeMonths > MAX_LIFE_MONTHS) return #err(#invalid("lifeMonths"));
    if (i.openingDepreciation < 0 or i.openingDepreciation > i.cost - i.residual) return #err(#invalid("openingDepreciation"));
    #ok({ i with name; tag; note });
  };

  public func posted(a : A.Asset) : Money = a.depreciations.foldLeft(0 : Int, func(s, d) = s + d.amount);

  public func depreciated(a : A.Asset) : Money = a.openingDepreciation + posted(a);

  public func bookValue(a : A.Asset) : Money = a.cost - depreciated(a);

  public func view(a : A.Asset) : A.AssetView = { a with depreciated = depreciated(a); bookValue = bookValue(a) };

  /// Planned accumulated depreciation through `period` (straight line, month by month,
  /// truncated to öre; the last month takes the remainder).
  public func planned(a : A.Asset, period : Text) : Money {
    let start = periodStart(periodOf(a.inUse)) ?? (return 0);
    let end = periodStart(period) ?? (return 0);
    let k = Dates.monthIndex(start, end) + 1;
    if (k <= 0) return 0;
    let months = Int.min(k, a.lifeMonths);
    (a.cost - a.residual) * months / a.lifeMonths;
  };

  /// What a run for `period` books for the asset: the plan through the period less what is
  /// already depreciated (catches up skipped months, never goes back).
  public func due(a : A.Asset, period : Text) : Money {
    if (a.disposal != null) return 0;
    let d = planned(a, period) - depreciated(a);
    if (d > 0) d else 0;
  };

  /// One debit and one credit line per account pair.
  public func runLines(rows : [(A.AssetAccounts, Money)], text : Text) : [Types.VoucherLine] {
    let sums = Map.empty<Text, (A.AssetAccounts, Money)>();
    for ((acc, amount) in rows.values()) {
      let k = acc.expense.toText() # "/" # acc.accumulated.toText();
      let prev = switch (sums.get(k)) { case (?(_, x)) x; case null 0 };
      sums.add(k, (acc, prev + amount));
    };
    var ls : [Types.VoucherLine] = [];
    for ((acc, amount) in sums.values()) ls := ls.concat([line(acc.expense, amount, ?text), line(acc.accumulated, -amount, ?text)]);
    ls;
  };

  public func checkDisposal(a : A.Asset, d : A.DisposalInput, chart : Types.Chart) : R<()> {
    if (a.disposal != null) return #err(#conflict("disposed"));
    if (not Dates.isValid(d.date) or d.date < a.acquired) return #err(#invalid("date"));
    if (d.proceeds < 0) return #err(#invalid("proceeds"));
    switch (d.proceedsAccount) {
      case (?n) {
        if (d.proceeds == 0) return #err(#invalid("proceedsAccount"));
        switch (account(chart, n, "proceedsAccount", func n = n >= 1000 and n < 2000)) { case (#err(e)) return #err(e); case (#ok) {} };
      };
      case null {};
    };
    for (n in [GAIN_ACCOUNT, LOSS_ACCOUNT].values()) if (not chart.accounts.containsKey(n)) return #err(#invalid("account." # n.toText()));
    // Depreciation booked for a later month than the disposal would have to be reversed first.
    for (x in a.depreciations.values()) if (x.period > periodOf(d.date)) return #err(#invalid("depreciatedAfterDate"));
    #ok(());
  };

  /// Removes the asset at cost and its accumulated depreciation; the net result goes to
  /// 3973 (gain) or 7973 (loss), K2 7.13 and 7.14.
  public func disposalLines(a : A.Asset, d : A.DisposalInput) : [Types.VoucherLine] {
    let text = ?a.name;
    let acc = depreciated(a);
    let bv = bookValue(a);
    var ls : [Types.VoucherLine] = [line(a.accounts.cost, -a.cost, text)];
    if (acc > 0) ls := ls.concat([line(a.accounts.accumulated, acc, text)]);
    switch (d.proceedsAccount) {
      case (?n) {
        ls := ls.concat([line(n, d.proceeds, text)]);
        let net = d.proceeds - bv;
        if (net > 0) ls := ls.concat([line(GAIN_ACCOUNT, -net, text)]) else if (net < 0) ls := ls.concat([line(LOSS_ACCOUNT, -net, text)]);
      };
      case null {
        // Proceeds already on 3973 from the invoice: set the book value off against them.
        let against = Int.min(bv, d.proceeds);
        if (against > 0) ls := ls.concat([line(GAIN_ACCOUNT, against, text)]);
        if (bv - against > 0) ls := ls.concat([line(LOSS_ACCOUNT, bv - against, text)]);
      };
    };
    ls;
  };

  // ── Inventory ──

  public func checkStockItem(i : A.StockItemInput) : R<A.StockItemInput> {
    let sku = i.sku.trim(#char ' ');
    let name = i.name.trim(#char ' ');
    let unit = i.unit.trim(#char ' ');
    if (sku.size() == 0 or sku.size() > 50) return #err(#invalid("sku"));
    if (name.size() == 0 or name.size() > 200) return #err(#invalid("name"));
    if (unit.size() == 0 or unit.size() > 20) return #err(#invalid("unit"));
    #ok({ i with sku; name; unit });
  };

  public func checkMove(m : A.StockMoveInput) : R<A.StockMoveInput> {
    if (not Dates.isValid(m.date)) return #err(#invalid("date"));
    let ok = switch (m.kind) {
      case (#purchase or #returned) { m.qty > 0 };
      case (#sale) { m.qty < 0 };
      case (#adjust) { m.qty != 0 };
      case (#count) { false }; // made by a count only
    };
    if (not ok) return #err(#invalid("qty"));
    if (m.unitCost < 0 or (m.qty > 0 and m.unitCost == 0 and m.kind == #purchase)) return #err(#invalid("unitCost"));
    let note = switch (optText(m.note, 200, "note")) { case (#ok(t)) t; case (#err(e)) return #err(e) };
    #ok({ m with note });
  };

  /// Quantity on hand (thousandths) from the moves up to and including `date`.
  public func qtyAt(moves : [A.StockMove], date : Text) : Int =
    moves.foldLeft(0 : Int, func(s, m) = if (m.date <= date) s + m.qty else s);

  /// Cost of `qty` units on hand: the items left are taken to be the last bought (IL 17:3,
  /// FIFO), so they are priced from the newest incoming moves backwards. A quantity above
  /// what came in is priced at the last known cost. Money in öre, qty in thousandths.
  public func fifoCost(moves : [A.StockMove], date : Text, qty : Int) : Money {
    if (qty <= 0) return 0;
    let ins = moves.filter(func m = m.qty > 0 and m.date <= date).sort(func(x, y) = if (x.date != y.date) Text.compare(x.date, y.date) else Nat.compare(x.id, y.id));
    var left = qty;
    var cost : Int = 0;
    var i = ins.size();
    var last : Money = 0;
    if (ins.size() > 0) last := ins[ins.size() - 1].unitCost;
    while (i > 0 and left > 0) {
      i -= 1;
      let take = Int.min(left, ins[i].qty);
      cost += take * ins[i].unitCost;
      left -= take;
    };
    cost += left * last;
    cost / 1000;
  };

  /// Lowest-value principle per item (K2 12.4): the lower of cost and NRV × qty.
  public func rowValue(cost : Money, qty : Int, nrvUnit : ?Money) : Money = switch (nrvUnit) {
    case (?n) { Int.min(cost, n * qty / 1000) };
    case null { cost };
  };

  /// With the 97 % rule (IL 17:4, K2 12.5) the stock may go down to 97 % of total cost, but
  /// never above what the lowest-value principle gives.
  public func countValue(cost : Money, lowest : Money, rule97 : Bool) : Money =
    if (rule97) Int.min(lowest, cost * 97 / 100) else lowest;

  /// The stock account against the change-of-stock account, for the difference.
  public func countLines(diff : Money, account : Nat, changeAccount : Nat, text : Text) : [Types.VoucherLine] =
    if (diff == 0) [] else [line(account, diff, ?text), line(changeAccount, -diff, ?text)];
};
