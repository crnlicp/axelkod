// Fixed assets and inventory (A9a). Sources: docs/accounting/sources.md V25, V26.
// Assets are depreciated straight-line per month from the month taken into use (K2
// 10.23, 10.25, 10.27). The inventory is periodic: purchases are booked as costs, the
// moves keep quantities and cost layers, and a count posts the change of stock value.
import Map "mo:core/Map";
import Types "../types";

module {
  type Date = Types.Date;
  type Money = Types.Money;
  type Time = Types.Time;

  public type AssetAccounts = { cost : Nat; accumulated : Nat; expense : Nat };

  public type AssetInput = {
    name : Text;
    /// Inventory number on the asset (optional).
    tag : ?Text;
    accounts : AssetAccounts;
    acquired : Date;
    /// Depreciation starts in this month.
    inUse : Date;
    /// Acquisition cost in öre, excluding deductible VAT (K2 10.5, 10.9).
    cost : Money;
    /// Fixed residual value (K2 10.25); 0 when the 5-year rule (10.27) is used.
    residual : Money;
    lifeMonths : Nat;
    /// Depreciation booked before the asset entered the register (assets from earlier years).
    openingDepreciation : Money;
    /// The purchase that booked the cost (the register posts nothing at acquisition).
    purchaseId : ?Nat;
    note : ?Text;
  };

  public type Depreciation = { period : Text; amount : Money; voucherId : Nat };

  public type DisposalInput = {
    date : Date;
    /// Ex VAT, 0 when scrapped.
    proceeds : Money;
    /// Where the proceeds were received (e.g. 1930). null when an invoice already booked
    /// them on 3973: the book value is then set off against 3973 (K2 7.13).
    proceedsAccount : ?Nat;
  };
  public type Disposal = DisposalInput and { bookValue : Money; voucherId : Nat };

  public type Asset = AssetInput and {
    id : Nat;
    depreciations : [Depreciation];
    disposal : ?Disposal;
    createdAt : Time;
  };

  public type AssetView = Asset and { depreciated : Money; bookValue : Money };

  public type DepRun = { id : Nat; period : Text; total : Money; rows : [{ assetId : Nat; amount : Money }]; voucherId : Nat; at : Time; by : Principal };

  // ── Inventory ──

  public type StockItemInput = { sku : Text; name : Text; unit : Text; salesItemId : ?Nat; active : Bool };
  public type StockItem = StockItemInput and { id : Nat };

  /// `qty` in thousandths, signed: in > 0, out < 0. Incoming moves carry their unit cost.
  public type MoveKind = { #purchase; #sale; #adjust; #returned; #count };
  public type StockMoveInput = { stockItemId : Nat; date : Date; kind : MoveKind; qty : Int; unitCost : Money; note : ?Text };
  public type StockMove = StockMoveInput and { id : Nat; at : Time; by : Principal };

  public type CountRowInput = {
    stockItemId : Nat;
    qty : Int;
    /// Net realisable value per unit, when below cost (K2 12.4).
    nrvUnit : ?Money;
  };
  public type CountInput = {
    /// Last day of a month, so the ledger balance it compares with is exact.
    date : Date;
    rows : [CountRowInput];
    /// IL 17:4, K2 12.5: at least 97 % of total cost.
    rule97 : Bool;
    account : Nat;
    changeAccount : Nat;
  };
  public type CountRow = CountRowInput and { bookQty : Int; cost : Money; value : Money };
  public type Count = {
    id : Nat;
    date : Date;
    rows : [CountRow];
    rule97 : Bool;
    account : Nat;
    changeAccount : Nat;
    cost : Money;
    value : Money;
    bookBefore : Money;
    voucherId : ?Nat;
    at : Time;
    by : Principal;
  };

  public type StockLevel = { stockItemId : Nat; qty : Int; value : Money };

  public type Assets = {
    assets : Map.Map<Nat, Asset>;
    /// "YYYY-MM" -> run id
    runOf : Map.Map<Text, Nat>;
    runs : Map.Map<Nat, DepRun>;
    stockItems : Map.Map<Nat, StockItem>;
    moves : Map.Map<Nat, StockMove>;
    counts : Map.Map<Nat, Count>;
    var next : Nat;
  };
};
