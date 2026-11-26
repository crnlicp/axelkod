// Purchases: suppliers and received documents (supplier invoices and credit notes,
// receipts, expense claims). The original file is the voucher evidence (ML 13:32,
// BFL 7 kap.); booked documents are never changed.
import Map "mo:core/Map";
import S "Sales";
import Types "../types";

module {
  type Date = Types.Date;
  type Money = Types.Money;

  /// Who accounts for the VAT (ML 16 kap.). Reverse charge: the buyer computes Swedish
  /// output VAT and deducts the same amount as input VAT (V22).
  public type Treatment = {
    #domestic; // input VAT as stated on the document (2641)
    #euGoods; // 16:17 unionsinternt förvärv
    #euServices; // 16:9, seller in another EU country
    #nonEuServices; // 16:9, seller outside the EU
    #seGoodsRC; // 16:6, 14, 16 domestic goods, buyer liable
    #seServicesRC; // 16:6, 13, 15 domestic services, buyer liable (construction)
    #noVat; // exempt, foreign VAT (never deductible) or no VAT on the document
    /// Import VAT from Tullverket's tullräkning (13:35, V3): lines carry the tax base per
    /// rate, the total is 0 and the goods and any duty are booked as separate documents.
    #importVat;
  };

  public type SupplierInput = {
    name : Text;
    orgNr : ?Text;
    vatNr : ?Text;
    country : Text;
    bankgiro : ?Text;
    plusgiro : ?Text;
    iban : ?Text;
    bic : ?Text;
    defaultAccount : ?Nat;
    treatment : Treatment;
    active : Bool;
  };
  public type Supplier = SupplierInput and { id : Nat };

  public type PurchaseKind = { #supplierInvoice; #creditNote; #receipt; #expenseClaim };

  public type PurchaseLine = {
    account : Nat;
    /// Document currency, excluding VAT.
    net : Money;
    rateBp : Nat;
    /// Domestic: the input VAT stated on the document. Reverse charge: ignored, computed in SEK.
    vat : Money;
    text : ?Text;
  };

  public type PurchaseInput = {
    kind : PurchaseKind;
    supplierId : ?Nat;
    /// The person who paid an expense claim, or the shop on a receipt without a supplier.
    payee : ?Text;
    docDate : Date;
    dueDate : ?Date;
    docNumber : ?Text;
    currency : Text;
    fxRate : ?S.FxRate;
    treatment : Treatment;
    lines : [PurchaseLine];
    /// Gross total as printed on the document (document currency).
    total : Money;
    /// OCR or message for the payment.
    paymentRef : ?Text;
    /// Receipts: paid from the bank account or cash.
    paidFrom : ?{ #bank; #cash };
    /// Supplier credit note: the invoice it reduces.
    creditOf : ?Nat;
    description : Text;
    attachmentIds : [Nat];
  };

  public type Purchase = PurchaseInput and {
    id : Nat;
    /// Null under the cash method until paid.
    voucherId : ?Nat;
    bookedAt : Types.Time;
    bookedBy : Principal;
    retainUntil : Date;
  };

  public type PayInput = {
    purchaseId : Nat;
    date : Date;
    /// Document currency; reduces the balance.
    amount : Money;
    /// Paid in SEK (required for other currencies; the difference is an FX gain or loss).
    amountSek : ?Money;
    reference : ?Text;
  };
  public type SupplierPayment = PayInput and { id : Nat; voucherId : Nat; at : Types.Time; by : Principal };

  public type Status = { #booked; #partiallyPaid; #paid; #overdue; #credited };

  public type PurchaseView = {
    purchase : Purchase;
    supplierName : Text;
    status : Status;
    credited : Money;
    paid : Money;
    balance : Money;
    payments : [SupplierPayment];
    credits : [Nat];
  };

  public type Purchases = {
    suppliers : Map.Map<Nat, Supplier>;
    docs : Map.Map<Nat, Purchase>;
    payments : Map.Map<Nat, SupplierPayment>;
    paymentsOf : Map.Map<Nat, [Nat]>;
    creditsOf : Map.Map<Nat, [Nat]>;
    /// attachment -> purchase that used it (so it leaves the inbox).
    used : Map.Map<Nat, Nat>;
    var next : Nat;
  };
};
