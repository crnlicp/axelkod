// Tillgångar & lager (A9a): the asset register, depreciation runs and disposals, and the
// periodic inventory (stock items, moves, counts). Postings go to series I.
import Array "mo:core/Array";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import AssetsLib "../lib/Assets";
import Audit "../lib/Audit";
import C "../lib/Canonical";
import Chart "../lib/Chart";
import Dates "../lib/Dates";
import Ledger "../lib/Ledger";
import Posting "../lib/Posting";
import Roles "../lib/Roles";
import A "../types/Assets";
import Pr "../types/Payroll";
import Types "../types";

mixin (
  roles : Types.Roles,
  config : Types.Config,
  chart : Types.Chart,
  ledger : Types.Ledger,
  files : Types.Files,
  counters : Types.Counters,
  audit : Types.Audit,
  assets : A.Assets,
  payroll : Pr.Payroll,
) {
  func assetCtx() : Posting.Ctx = { chart; config; ledger; files; counters; audit };

  func assetValue(a : A.AssetInput) : C.Value = #obj([
    ("name", #text(a.name)), ("tag", switch (a.tag) { case (?t) #text(t); case null #null_ }),
    ("accounts", #obj([("cost", #int(a.accounts.cost)), ("accumulated", #int(a.accounts.accumulated)), ("expense", #int(a.accounts.expense))])),
    ("acquired", #text(a.acquired)), ("inUse", #text(a.inUse)), ("cost", #int(a.cost)), ("residual", #int(a.residual)),
    ("lifeMonths", #int(a.lifeMonths)), ("openingDepreciation", #int(a.openingDepreciation)),
    ("purchaseId", switch (a.purchaseId) { case (?p) #int(p); case null #null_ }),
  ]);

  func afterLock(date : Text) : Bool = switch (config.lockDate) { case (?d) date > d; case null true };

  // ── Assets ──

  /// Half the prisbasbelopp from the stored parameters: below it an asset may be expensed
  /// directly (IL 18:4, K2 10.5). Shown as a hint; the register does not enforce it.
  public shared query ({ caller }) func smallAssetLimit() : async Result.Result<{ year : Nat; limit : Int }, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok({ year = payroll.params.year; limit = payroll.params.prisbasbelopp / 2 });
  };

  public shared query ({ caller }) func listAssets() : async Result.Result<[A.AssetView], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(assets.assets.values().map(AssetsLib.view).toArray());
  };

  /// Create (id = null) or edit. An asset can be edited only until its first depreciation.
  public shared ({ caller }) func saveAsset(id : ?Nat, input : A.AssetInput) : async Result.Result<A.AssetView, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let clean = switch (AssetsLib.checkAsset(input, chart)) { case (#ok(c)) c; case (#err(e)) return #err(e) };
    let now = Time.now();
    let a : A.Asset = switch (id) {
      case (?i) {
        let old = assets.assets.get(i) ?? (return #err(#notFound));
        if (old.depreciations.size() > 0 or old.disposal != null) return #err(#conflict("depreciated"));
        { clean and { id = old.id; depreciations = old.depreciations; disposal = old.disposal; createdAt = old.createdAt } };
      };
      case null {
        let i = assets.next;
        assets.next += 1;
        { clean with id = i; depreciations = []; disposal = null; createdAt = now };
      };
    };
    assets.assets.add(a.id, a);
    ignore Audit.append(audit, now, caller, "asset.save", "asset", ?a.id, assetValue(clean));
    #ok(AssetsLib.view(a));
  };

  public shared ({ caller }) func deleteAsset(id : Nat) : async Result.Result<(), Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let a = assets.assets.get(id) ?? (return #err(#notFound));
    if (a.depreciations.size() > 0 or a.disposal != null) return #err(#conflict("depreciated"));
    assets.assets.remove(id);
    ignore Audit.append(audit, Time.now(), caller, "asset.delete", "asset", ?id, #null_);
    #ok(());
  };

  func dueRows(period : Text) : [(A.Asset, Int)] =
    assets.assets.values().filterMap(func(a : A.Asset) : ?(A.Asset, Int) {
      let d = AssetsLib.due(a, period);
      if (d > 0) ?(a, d) else null;
    }).toArray();

  /// What "Kör avskrivningar" for the period would book, per asset.
  public shared query ({ caller }) func previewDepreciation(period : Text) : async Result.Result<[{ assetId : Nat; amount : Int }], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    if (AssetsLib.periodStart(period) == null) return #err(#invalid("period"));
    #ok(dueRows(period).map(func((a, d) : (A.Asset, Int)) : { assetId : Nat; amount : Int } = { assetId = a.id; amount = d }));
  };

  /// One voucher for all assets, dated the last day of the period. Each period runs once;
  /// a month that was skipped is caught up by the next run.
  public shared ({ caller }) func runDepreciation(period : Text) : async Result.Result<A.DepRun, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let end = AssetsLib.periodEnd(period) ?? (return #err(#invalid("period")));
    if (assets.runOf.containsKey(period)) return #err(#conflict("periodDone"));
    let rows = dueRows(period);
    if (rows.size() == 0) return #err(#invalid("nothingDue"));
    if (rows.size() > AssetsLib.MAX_ROWS) return #err(#invalid("tooMany"));
    let text = "Avskrivningar " # period;
    let vin : Types.VoucherInput = {
      series = AssetsLib.SERIES; eventDate = end; description = text;
      lines = AssetsLib.runLines(rows.map(func((a, d)) = (a.accounts, d)), text);
      attachmentIds = []; counterparty = null;
    };
    let fy = switch (Posting.check(assetCtx(), vin)) { case (#ok(fy)) fy; case (#err(e)) return #err(e) };
    let now = Time.now();
    let id = assets.next;
    assets.next += 1;
    let v = Posting.post(assetCtx(), fy, vin, #asset(id), caller, now);
    for ((a, d) in rows.values()) assets.assets.add(a.id, { a with depreciations = a.depreciations.concat([{ period; amount = d; voucherId = v.id }]) });
    var total : Int = 0;
    for ((_, d) in rows.values()) total += d;
    let run : A.DepRun = { id; period; total; rows = rows.map(func((a, d) : (A.Asset, Int)) : { assetId : Nat; amount : Int } = { assetId = a.id; amount = d }); voucherId = v.id; at = now; by = caller };
    assets.runs.add(id, run);
    assets.runOf.add(period, id);
    ignore Audit.append(audit, now, caller, "asset.depreciate", "depRun", ?id, #obj([("period", #text(period)), ("total", #int(total)), ("voucherId", #int(v.id))]));
    #ok(run);
  };

  public shared query ({ caller }) func listDepRuns() : async Result.Result<[A.DepRun], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(assets.runs.reverseEntries().map(func((_, r) : (Nat, A.DepRun)) : A.DepRun = r).toArray());
  };

  /// Sale or scrapping: removes cost and accumulated depreciation, books the gain or loss.
  public shared ({ caller }) func disposeAsset(id : Nat, input : A.DisposalInput) : async Result.Result<A.AssetView, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let a = assets.assets.get(id) ?? (return #err(#notFound));
    switch (AssetsLib.checkDisposal(a, input, chart)) { case (#err(e)) return #err(e); case (#ok) {} };
    let vin : Types.VoucherInput = {
      series = AssetsLib.SERIES; eventDate = input.date;
      description = (if (input.proceeds == 0) "Utrangering " else "Försäljning ") # a.name;
      lines = AssetsLib.disposalLines(a, input); attachmentIds = []; counterparty = null;
    };
    let fy = switch (Posting.check(assetCtx(), vin)) { case (#ok(fy)) fy; case (#err(e)) return #err(e) };
    let now = Time.now();
    let v = Posting.post(assetCtx(), fy, vin, #asset(id), caller, now);
    let x = { a with disposal = ?{ input with bookValue = AssetsLib.bookValue(a); voucherId = v.id } };
    assets.assets.add(id, x);
    ignore Audit.append(audit, now, caller, "asset.dispose", "asset", ?id, #obj([
      ("date", #text(input.date)), ("proceeds", #int(input.proceeds)),
      ("proceedsAccount", switch (input.proceedsAccount) { case (?n) #int(n); case null #null_ }), ("voucherId", #int(v.id)),
    ]));
    #ok(AssetsLib.view(x));
  };

  // ── Inventory ──

  func movesOf(itemId : Nat) : [A.StockMove] =
    assets.moves.values().filter(func m = m.stockItemId == itemId).toArray();

  func lastCountDate() : ?Text = switch (assets.counts.maxEntry()) { case (?(_, c)) ?c.date; case null null };

  func open(date : Text) : Bool = afterLock(date) and (switch (lastCountDate()) { case (?d) date > d; case null true });

  /// Balance of an account from all postings through `date` (the last day of a month).
  func balanceThrough(acct : Nat, date : Text) : Int {
    var sum : Int = 0;
    for (fy in chart.fiscalYears.values()) if (fy.start <= date) {
      let last = Int.min(Dates.monthIndex(fy.start, date), Chart.months(fy) - 1);
      var m = 0;
      while (m <= last) { sum += ledger.balances.get(Ledger.balanceKey(fy.id, acct, Int.abs(m))) ?? 0; m += 1 };
    };
    sum;
  };

  public shared query ({ caller }) func listStockItems() : async Result.Result<[A.StockItem], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(assets.stockItems.values().toArray());
  };

  public shared ({ caller }) func saveStockItem(id : ?Nat, input : A.StockItemInput) : async Result.Result<A.StockItem, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (not config.settings.modules.inventory) return #err(#invalid("inventory.module"));
    let clean = switch (AssetsLib.checkStockItem(input)) { case (#ok(c)) c; case (#err(e)) return #err(e) };
    for (s in assets.stockItems.values()) if (s.sku == clean.sku and ?s.id != id) return #err(#conflict("sku"));
    let i = switch (id) {
      case (?i) { if (not assets.stockItems.containsKey(i)) return #err(#notFound); i };
      case null { let i = assets.next; assets.next += 1; i };
    };
    let s = { clean with id = i };
    assets.stockItems.add(i, s);
    ignore Audit.append(audit, Time.now(), caller, "stock.item.save", "stockItem", ?i, #obj([("sku", #text(s.sku)), ("name", #text(s.name)), ("unit", #text(s.unit)), ("active", #bool(s.active))]));
    #ok(s);
  };

  public shared query ({ caller }) func listStockMoves() : async Result.Result<[A.StockMove], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(assets.moves.reverseEntries().map(func((_, m) : (Nat, A.StockMove)) : A.StockMove = m).toArray());
  };

  /// Moves dated after the last count and the lock date only, so a count's figures never change.
  public shared ({ caller }) func addStockMove(input : A.StockMoveInput) : async Result.Result<A.StockMove, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (not config.settings.modules.inventory) return #err(#invalid("inventory.module"));
    let clean = switch (AssetsLib.checkMove(input)) { case (#ok(c)) c; case (#err(e)) return #err(e) };
    if (not assets.stockItems.containsKey(clean.stockItemId)) return #err(#notFound);
    if (not open(clean.date)) return #err(#locked("counted"));
    let now = Time.now();
    let id = assets.next;
    assets.next += 1;
    let m = { clean with id; at = now; by = caller };
    assets.moves.add(id, m);
    ignore Audit.append(audit, now, caller, "stock.move.add", "stockMove", ?id, #obj([("stockItemId", #int(m.stockItemId)), ("date", #text(m.date)), ("qty", #int(m.qty)), ("unitCost", #int(m.unitCost))]));
    #ok(m);
  };

  public shared ({ caller }) func deleteStockMove(id : Nat) : async Result.Result<(), Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let m = assets.moves.get(id) ?? (return #err(#notFound));
    if (m.kind == #count or not open(m.date)) return #err(#locked("counted"));
    assets.moves.remove(id);
    ignore Audit.append(audit, Time.now(), caller, "stock.move.delete", "stockMove", ?id, #null_);
    #ok(());
  };

  public shared query ({ caller }) func stockLevels(date : Text) : async Result.Result<[A.StockLevel], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    if (not Dates.isValid(date)) return #err(#invalid("date"));
    #ok(assets.stockItems.values().map(func(s : A.StockItem) : A.StockLevel {
      let ms = movesOf(s.id);
      let qty = AssetsLib.qtyAt(ms, date);
      { stockItemId = s.id; qty; value = AssetsLib.fifoCost(ms, date, qty) };
    }).toArray());
  };

  func evaluate(input : A.CountInput, caller : Principal) : Result.Result<A.Count, Types.Error> {
    if (not Dates.isLastOfMonth(input.date)) return #err(#invalid("date"));
    if (not open(input.date)) return #err(#locked("counted"));
    for ((n, f) in [(input.account, "account"), (input.changeAccount, "changeAccount")].values()) {
      switch (chart.accounts.get(n)) { case (?a) { if (not a.active) return #err(#invalid(f)) }; case null { return #err(#invalid(f)) } };
    };
    if (input.account < 1400 or input.account >= 1500 or input.changeAccount < 4900 or input.changeAccount >= 5000) return #err(#invalid("account"));
    if (input.rows.size() > AssetsLib.MAX_ROWS) return #err(#invalid("rows"));
    let seen = Map.empty<Nat, ()>();
    var rows : [A.CountRow] = [];
    var cost : Int = 0;
    var lowest : Int = 0;
    for ((i, r) in input.rows.enumerate()) {
      if (seen.containsKey(r.stockItemId) or not assets.stockItems.containsKey(r.stockItemId)) return #err(#invalid("rows[" # i.toText() # "]"));
      if (r.qty < 0) return #err(#invalid("rows[" # i.toText() # "].qty"));
      switch (r.nrvUnit) { case (?n) { if (n < 0) return #err(#invalid("rows[" # i.toText() # "].nrvUnit")) }; case null {} };
      seen.add(r.stockItemId, ());
      let ms = movesOf(r.stockItemId);
      let c = AssetsLib.fifoCost(ms, input.date, r.qty);
      let v = AssetsLib.rowValue(c, r.qty, r.nrvUnit);
      cost += c;
      lowest += v;
      rows := rows.concat([{ r with bookQty = AssetsLib.qtyAt(ms, input.date); cost = c; value = v }]);
    };
    // Every item with stock on hand must be counted (an empty row means zero).
    for (s in assets.stockItems.values()) if (not seen.containsKey(s.id) and AssetsLib.qtyAt(movesOf(s.id), input.date) != 0) return #err(#invalid("rows.missing"));
    let value = AssetsLib.countValue(cost, lowest, input.rule97);
    #ok({
      id = 0; date = input.date; rows; rule97 = input.rule97; account = input.account; changeAccount = input.changeAccount;
      cost; value; bookBefore = balanceThrough(input.account, input.date); voucherId = null; at = 0; by = caller;
    });
  };

  public shared query ({ caller }) func previewStockCount(input : A.CountInput) : async Result.Result<A.Count, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    evaluate(input, caller);
  };

  /// Enters a count: quantity differences become count moves, and the stock account is set
  /// to the counted value against the change-of-stock account.
  public shared ({ caller }) func postStockCount(input : A.CountInput) : async Result.Result<A.Count, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (not config.settings.modules.inventory) return #err(#invalid("inventory.module"));
    let c = switch (evaluate(input, caller)) { case (#ok(c)) c; case (#err(e)) return #err(e) };
    let text = "Lagerinventering " # input.date;
    let lines = AssetsLib.countLines(c.value - c.bookBefore, input.account, input.changeAccount, text);
    let vin : Types.VoucherInput = { series = AssetsLib.SERIES; eventDate = input.date; description = text; lines; attachmentIds = []; counterparty = null };
    let fy = if (lines.size() == 0) null else switch (Posting.check(assetCtx(), vin)) { case (#ok(fy)) ?fy; case (#err(e)) return #err(e) };
    let now = Time.now();
    let id = assets.next;
    assets.next += 1;
    let voucherId = switch (fy) { case (?f) ?Posting.post(assetCtx(), f, vin, #inventory(id), caller, now).id; case null null };
    for (r in c.rows.values()) if (r.qty != r.bookQty) {
      let mid = assets.next;
      assets.next += 1;
      let unit = if (r.qty > 0) r.cost * 1000 / r.qty else 0;
      assets.moves.add(mid, { stockItemId = r.stockItemId; date = input.date; kind = #count; qty = r.qty - r.bookQty; unitCost = unit; note = ?text; id = mid; at = now; by = caller });
    };
    let x = { c with id; voucherId; at = now };
    assets.counts.add(id, x);
    ignore Audit.append(audit, now, caller, "stock.count", "stockCount", ?id, #obj([
      ("date", #text(x.date)), ("cost", #int(x.cost)), ("value", #int(x.value)), ("bookBefore", #int(x.bookBefore)), ("rule97", #bool(x.rule97)),
      ("voucherId", switch (voucherId) { case (?v) #int(v); case null #null_ }),
    ]));
    #ok(x);
  };

  public shared query ({ caller }) func listStockCounts() : async Result.Result<[A.Count], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(assets.counts.reverseEntries().map(func((_, c) : (Nat, A.Count)) : A.Count = c).toArray());
  };
};
