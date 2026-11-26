// VAT returns, EU sales lists and VIES checks (A6); purchases get the #importVat
// treatment (widened variant, documents copied unchanged). Self-contained: types are copied.
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";

module {
  type Date = Text;
  type Time = Int;
  type FxRate = { rate : Nat; date : Date };
  type Money = Int;
  type OldTreatment = { #domestic; #euGoods; #euServices; #nonEuServices; #seGoodsRC; #seServicesRC; #noVat };
  type Treatment = { #domestic; #euGoods; #euServices; #nonEuServices; #seGoodsRC; #seServicesRC; #noVat; #importVat };
  type Supplier<T> = {
    id : Nat; name : Text; orgNr : ?Text; vatNr : ?Text; country : Text; bankgiro : ?Text; plusgiro : ?Text;
    iban : ?Text; bic : ?Text; defaultAccount : ?Nat; treatment : T; active : Bool;
  };
  type PurchaseKind = { #supplierInvoice; #creditNote; #receipt; #expenseClaim };
  type PurchaseLine = { account : Nat; net : Money; rateBp : Nat; vat : Money; text : ?Text };
  type Purchase<T> = {
    kind : PurchaseKind; supplierId : ?Nat; payee : ?Text; docDate : Date; dueDate : ?Date; docNumber : ?Text;
    currency : Text; fxRate : ?FxRate; treatment : T; lines : [PurchaseLine]; total : Money;
    paymentRef : ?Text; paidFrom : ?{ #bank; #cash }; creditOf : ?Nat; description : Text; attachmentIds : [Nat];
    id : Nat; voucherId : ?Nat; bookedAt : Time; bookedBy : Principal; retainUntil : Date;
  };
  type SupplierPayment = {
    purchaseId : Nat; date : Date; amount : Money; amountSek : ?Money; reference : ?Text;
    id : Nat; voucherId : Nat; at : Time; by : Principal;
  };
  type Purchases<T> = {
    suppliers : Map.Map<Nat, Supplier<T>>;
    docs : Map.Map<Nat, Purchase<T>>;
    payments : Map.Map<Nat, SupplierPayment>;
    paymentsOf : Map.Map<Nat, [Nat]>;
    creditsOf : Map.Map<Nat, [Nat]>;
    used : Map.Map<Nat, Nat>;
    var next : Nat;
  };
  type Box = { box : Nat; amount : Int };
  type VatReturn = {
    id : Nat; from : Date; to : Date; boxes : [Box]; exact : [Box]; voucherCount : Nat; voucherHash : Blob;
    settlementVoucherId : ?Nat; note : ?Text; lockedAt : Time; lockedBy : Principal; filedAt : ?Time;
    filedBy : ?Principal; receiptRef : ?Text; taxEntryId : ?Nat;
  };
  type EslRow = { vatNr : Text; buyer : Text; goods : Int; triangulation : Int; services : Int };
  type EcSalesList = {
    from : Date; to : Date; contactName : Text; phone : Text; email : ?Text; receiptRef : ?Text;
    id : Nat; rows : [EslRow]; filedAt : Time; filedBy : Principal;
  };
  type VatCheck = { vatNr : Text; valid : Bool; name : ?Text; address : ?Text; checkedAt : Time; checkedBy : Principal };
  type Vat = {
    returns : Map.Map<Nat, VatReturn>;
    returnOf : Map.Map<Text, Nat>;
    esl : Map.Map<Nat, EcSalesList>;
    eslOf : Map.Map<Text, Nat>;
    checks : Map.Map<Text, VatCheck>;
    var viesUse : (Nat, Nat);
    var next : Nat;
  };

  type OldActor = { purchases : Purchases<OldTreatment> };
  type NewActor = { purchases : Purchases<Treatment>; vat : Vat };

  public func migration(old : OldActor) : NewActor {
    let p = old.purchases;
    {
      purchases = {
        suppliers = p.suppliers.map(func(_, x) = x);
        docs = p.docs.map(func(_, x) = x);
        payments = p.payments;
        paymentsOf = p.paymentsOf;
        creditsOf = p.creditsOf;
        used = p.used;
        var next = p.next;
      };
      vat = {
        returns = Map.empty();
        returnOf = Map.empty();
        esl = Map.empty();
        eslOf = Map.empty();
        checks = Map.empty();
        var viesUse = (0, 0);
        var next = 1;
      };
    };
  };
};
