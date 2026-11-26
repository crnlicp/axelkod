// VAT returns (momsdeklaration), EU sales lists (periodisk sammanställning) and VIES
// checks (V3–V5). Box values come from the ledger; a filed return keeps its values.
import Map "mo:core/Map";
import Types "../types";

module {
  type Date = Types.Date;
  type Time = Types.Time;

  /// One box on the return. Filed values are whole kronor; previews also give öre.
  public type Box = { box : Nat; amount : Int };

  public type Warning = { code : Text; count : Nat };

  public type VatReturn = {
    id : Nat;
    from : Date;
    to : Date;
    /// Whole kronor, öre dropped per box; 49 computed from these.
    boxes : [Box];
    /// The same boxes in öre, before dropping öre.
    exact : [Box];
    /// Vouchers in the period that touch an account with a box, and their hash.
    voucherCount : Nat;
    voucherHash : Blob;
    /// Null when every VAT account was already zero.
    settlementVoucherId : ?Nat;
    note : ?Text; // TextUpplysningMoms, max 300
    lockedAt : Time;
    lockedBy : Principal;
    filedAt : ?Time;
    filedBy : ?Principal;
    receiptRef : ?Text;
    /// The tax-account VAT entry that settles the return.
    taxEntryId : ?Nat;
  };

  public type Preview = {
    from : Date;
    to : Date;
    boxes : [Box];
    exact : [Box];
    warnings : [Warning];
    filed : ?VatReturn;
  };

  /// Whole kronor in SEK, per buyer VAT number.
  public type EslRow = { vatNr : Text; buyer : Text; goods : Int; triangulation : Int; services : Int };

  public type EslPreview = { from : Date; to : Date; rows : [EslRow]; missingVatNr : Nat; filed : ?EcSalesList };

  public type EslFileInput = { from : Date; to : Date; contactName : Text; phone : Text; email : ?Text; receiptRef : ?Text };

  public type EcSalesList = EslFileInput and {
    id : Nat;
    rows : [EslRow];
    filedAt : Time;
    filedBy : Principal;
  };

  public type VatCheck = {
    vatNr : Text;
    valid : Bool;
    name : ?Text;
    address : ?Text;
    checkedAt : Time;
    checkedBy : Principal;
  };

  public type Vat = {
    returns : Map.Map<Nat, VatReturn>;
    /// period start -> return id
    returnOf : Map.Map<Text, Nat>;
    esl : Map.Map<Nat, EcSalesList>;
    eslOf : Map.Map<Text, Nat>;
    checks : Map.Map<Text, VatCheck>;
    /// (day number, VIES calls that day): cycle-drain guard.
    var viesUse : (Nat, Nat);
    var next : Nat;
  };

  // Management canister HTTPS outcall interface (IC interface spec).
  public type HttpHeader = { name : Text; value : Text };
  public type HttpResponse = { status : Nat; headers : [HttpHeader]; body : Blob };
  public type TransformArg = { response : HttpResponse; context : Blob };
  public type HttpRequest = {
    url : Text;
    max_response_bytes : ?Nat64;
    method : { #get; #head; #post };
    headers : [HttpHeader];
    body : ?Blob;
    transform : ?{ function : shared query TransformArg -> async HttpResponse; context : Blob };
    is_replicated : ?Bool;
  };
};
