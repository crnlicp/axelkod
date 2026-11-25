// Purchases, bank and tax account (A5). Self-contained: types are copied, not imported.
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";

module {
  type Date = Text;
  type Money = Int;
  type Time = Int;
  type FxRate = { rate : Nat; date : Date };

  type Treatment = { #domestic; #euGoods; #euServices; #nonEuServices; #seGoodsRC; #seServicesRC; #noVat };
  type Supplier = {
    id : Nat; name : Text; orgNr : ?Text; vatNr : ?Text; country : Text; bankgiro : ?Text; plusgiro : ?Text;
    iban : ?Text; bic : ?Text; defaultAccount : ?Nat; treatment : Treatment; active : Bool;
  };
  type PurchaseKind = { #supplierInvoice; #creditNote; #receipt; #expenseClaim };
  type PurchaseLine = { account : Nat; net : Money; rateBp : Nat; vat : Money; text : ?Text };
  type Purchase = {
    kind : PurchaseKind; supplierId : ?Nat; payee : ?Text; docDate : Date; dueDate : ?Date; docNumber : ?Text;
    currency : Text; fxRate : ?FxRate; treatment : Treatment; lines : [PurchaseLine]; total : Money;
    paymentRef : ?Text; paidFrom : ?{ #bank; #cash }; creditOf : ?Nat; description : Text; attachmentIds : [Nat];
    id : Nat; voucherId : ?Nat; bookedAt : Time; bookedBy : Principal; retainUntil : Date;
  };
  type SupplierPayment = {
    purchaseId : Nat; date : Date; amount : Money; amountSek : ?Money; reference : ?Text;
    id : Nat; voucherId : Nat; at : Time; by : Principal;
  };
  type Purchases = {
    suppliers : Map.Map<Nat, Supplier>;
    docs : Map.Map<Nat, Purchase>;
    payments : Map.Map<Nat, SupplierPayment>;
    paymentsOf : Map.Map<Nat, [Nat]>;
    creditsOf : Map.Map<Nat, [Nat]>;
    used : Map.Map<Nat, Nat>;
    var next : Nat;
  };

  type CsvMapping = {
    delimiter : Text; skipRows : Nat; dateCol : Nat; amountCol : Nat; textCol : Nat;
    referenceCol : ?Nat; counterpartyCol : ?Nat; decimalComma : Bool;
  };
  type BankAccount = { name : Text; ledgerAccount : Nat; bank : Text; mapping : ?CsvMapping; id : Nat };
  type Match = { #salesPayment : Nat; #supplierPayment : Nat; #booked; #existing };
  type BankTx = {
    date : Date; amount : Money; text : Text; reference : ?Text; counterparty : ?Text;
    id : Nat; accountId : Nat; batch : Nat; match : ?{ kind : Match; voucherId : Nat; at : Time; by : Principal };
  };
  type Rule = { id : Nat; contains : Text; account : Nat; vatRateBp : Nat; description : Text };
  type TaxKind = { #vat; #employerFee; #withheldTax; #prelimTax; #interestIncome; #interestCost; #payment; #refund; #other };
  type TaxEntry = { date : Date; amount : Money; text : Text; kind : TaxKind; id : Nat; batch : Nat; voucherId : ?Nat };
  type Bank = {
    accounts : Map.Map<Nat, BankAccount>;
    txs : Map.Map<Nat, BankTx>;
    txKeys : Map.Map<Text, Nat>;
    voucherTx : Map.Map<Nat, Nat>;
    rules : Map.Map<Nat, Rule>;
    tax : Map.Map<Nat, TaxEntry>;
    taxKeys : Map.Map<Text, Nat>;
    var next : Nat;
    var batch : Nat;
  };

  type OldActor = {};
  type NewActor = { purchases : Purchases; bank : Bank };

  public func migration(_ : OldActor) : NewActor {
    {
      purchases = {
        suppliers = Map.empty();
        docs = Map.empty();
        payments = Map.empty();
        paymentsOf = Map.empty();
        creditsOf = Map.empty();
        used = Map.empty();
        var next = 1;
      };
      bank = {
        // The company account (BAS 1930 "Företagskonto"), so import works from day one.
        accounts = Map.fromIter([(1, { id = 1; name = "Företagskonto"; ledgerAccount = 1930; bank = ""; mapping = null })].values());
        txs = Map.empty();
        txKeys = Map.empty();
        voucherTx = Map.empty();
        rules = Map.empty();
        tax = Map.empty();
        taxKeys = Map.empty();
        var next = 2;
        var batch = 0;
      };
    };
  };
};
