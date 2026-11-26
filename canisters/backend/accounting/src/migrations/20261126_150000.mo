// Fixed assets and inventory (A9a): the asset register, depreciation runs, stock items,
// moves and counts start empty. Self-contained: types are copied, not imported.
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";

module {
  type Date = Text;
  type Money = Int;
  type Time = Int;

  type AssetAccounts = { cost : Nat; accumulated : Nat; expense : Nat };
  type Asset = {
    name : Text; tag : ?Text; accounts : AssetAccounts; acquired : Date; inUse : Date; cost : Money; residual : Money;
    lifeMonths : Nat; openingDepreciation : Money; purchaseId : ?Nat; note : ?Text;
    id : Nat; depreciations : [{ period : Text; amount : Money; voucherId : Nat }];
    disposal : ?{ date : Date; proceeds : Money; proceedsAccount : ?Nat; bookValue : Money; voucherId : Nat };
    createdAt : Time;
  };
  type DepRun = { id : Nat; period : Text; total : Money; rows : [{ assetId : Nat; amount : Money }]; voucherId : Nat; at : Time; by : Principal };
  type StockItem = { sku : Text; name : Text; unit : Text; salesItemId : ?Nat; active : Bool; id : Nat };
  type MoveKind = { #purchase; #sale; #adjust; #returned; #count };
  type StockMove = { stockItemId : Nat; date : Date; kind : MoveKind; qty : Int; unitCost : Money; note : ?Text; id : Nat; at : Time; by : Principal };
  type CountRow = { stockItemId : Nat; qty : Int; nrvUnit : ?Money; bookQty : Int; cost : Money; value : Money };
  type Count = {
    id : Nat; date : Date; rows : [CountRow]; rule97 : Bool; account : Nat; changeAccount : Nat;
    cost : Money; value : Money; bookBefore : Money; voucherId : ?Nat; at : Time; by : Principal;
  };
  type Assets = {
    assets : Map.Map<Nat, Asset>;
    runOf : Map.Map<Text, Nat>;
    runs : Map.Map<Nat, DepRun>;
    stockItems : Map.Map<Nat, StockItem>;
    moves : Map.Map<Nat, StockMove>;
    counts : Map.Map<Nat, Count>;
    var next : Nat;
  };

  public func migration(_ : {}) : { assets : Assets } = {
    assets = {
      assets = Map.empty(); runOf = Map.empty(); runs = Map.empty(); stockItems = Map.empty();
      moves = Map.empty(); counts = Map.empty(); var next = 1;
    };
  };
};
