// Sales: customers, items, quotes, invoices, credit notes, payments, reminders.
// Issued documents are write-once; links (credits, payments, reminders, quote
// status) live in index maps and are joined into views (C8, C9).
import Map "mo:core/Map";
import R "RotRut";
import Types "../types";

module {
  type Date = Types.Date;
  type Money = Types.Money;

  public type Lang = { #sv; #en };
  public type Address = { street : Text; postalCode : Text; city : Text; country : Text };

  public type CustomerInput = {
    kind : { #company; #person };
    name : Text;
    orgNr : ?Text;
    vatNr : ?Text;
    address : Address;
    email : ?Text;
    peppolId : ?Text;
    termsDays : Nat;
    language : Lang;
    /// A reminder fee may be charged only if agreed when the debt arose (1981:739 2 §).
    reminderFeeAgreed : Bool;
    active : Bool;
  };
  public type Customer = CustomerInput and { id : Nat };

  public type ItemInput = {
    sku : Text;
    name : Text;
    unit : Text;
    priceExVat : Money;
    vatCode : Text;
    account : Nat;
    kind : { #goods; #service };
    active : Bool;
  };
  public type Item = ItemInput and { id : Nat };

  /// Quantity in thousandths (1 500 = 1,5); prices in the document currency's minor unit.
  public type DocLine = {
    itemId : ?Nat;
    description : Text;
    quantity : Int;
    unit : Text;
    unitPrice : Money;
    discountBp : Nat;
    vatCode : Text;
    account : Nat;
  };

  /// Exchange rate to SEK × 1 000 000, and the date it applies to (ML 17:29, 8 kap. 21–23 §§).
  public type FxRate = { rate : Nat; date : Date };

  public type DocInput = {
    customerId : Nat;
    language : Lang;
    deliveryDate : ?Date;
    /// Quotes: valid until. Invoices: payment terms come from `termsDays`.
    validUntil : ?Date;
    termsDays : Nat;
    currency : Text;
    fxRate : ?FxRate;
    lines : [DocLine];
    ourRef : ?Text;
    yourRef : ?Text;
    notes : ?Text;
    /// ROT/RUT (A8): SEK documents to a private customer only.
    hus : ?R.HusInput;
  };

  public type DocKind = { #quote; #invoice; #creditNote };

  public type SalesDraft = {
    id : Nat;
    kind : DocKind;
    input : DocInput;
    creditOf : ?Nat;
    quoteOf : ?Nat;
    updatedAt : Types.Time;
    updatedBy : Principal;
  };

  /// What is printed (C10): only the buyer's printed fields.
  public type PartySnapshot = {
    name : Text;
    orgNr : ?Text;
    vatNr : ?Text;
    address : Address;
    email : ?Text;
    peppolId : ?Text;
    kind : { #company; #person };
  };

  public type SnapLine = {
    description : Text;
    quantity : Int;
    unit : Text;
    unitPrice : Money;
    discountBp : Nat;
    vatCode : Text;
    rateBp : Nat;
    account : Nat;
    net : Money;
  };

  /// One row per VAT code; `category` is the EN 16931 code used in Peppol (S, Z, E, AE, K, G, O).
  public type VatRow = { vatCode : Text; rateBp : Nat; category : Text; base : Money; vat : Money };

  /// Everything printed on the document, frozen at issue and hashed (acj-1).
  public type Snapshot = {
    kind : DocKind;
    number : Nat;
    seller : Types.CompanyProfile;
    buyer : PartySnapshot;
    language : Lang;
    issueDate : Date;
    deliveryDate : ?Date;
    dueDate : ?Date;
    validUntil : ?Date;
    currency : Text;
    fxRate : ?FxRate;
    lines : [SnapLine];
    vat : [VatRow];
    totalNet : Money;
    totalVat : Money;
    total : Money;
    /// VAT in SEK when the document is in another currency (ML 17:29).
    totalVatSek : ?Money;
    legalNotes : [Text];
    ocr : ?Text;
    ourRef : ?Text;
    yourRef : ?Text;
    notes : ?Text;
    termsDays : Nat;
    lateInterestText : ?Text;
    creditOf : ?{ number : Nat; issueDate : Date };
    templateVersion : Text;
    /// ROT/RUT: the customer pays `total - hus.deduction`; Skatteverket pays the deduction.
    hus : ?R.HusPart;
  };

  public type SalesDoc = {
    id : Nat;
    kind : DocKind;
    number : Nat;
    snapshot : Snapshot;
    contentHash : Blob;
    customerId : Nat;
    creditOf : ?Nat;
    quoteOf : ?Nat;
    voucherId : ?Nat;
    issuedAt : Types.Time;
    issuedBy : Principal;
    retainUntil : Date;
  };

  public type QuoteStatus = { #sent; #accepted; #declined; #expired };
  public type DocStatus = { #issued; #paid; #partiallyPaid; #overdue; #credited; #quote : QuoteStatus };

  public type PaymentMethod = { #bankgiro; #swish; #card; #transfer; #cash };

  public type PaymentInput = {
    salesDocId : Nat;
    date : Date;
    /// In the invoice currency; reduces the invoice balance.
    amount : Money;
    /// Received in SEK (required for other currencies; the difference is an FX gain or loss).
    amountSek : ?Money;
    /// Interest and fees received on top (Räntelagen, 1981:739), in SEK.
    interest : Money;
    fees : Money;
    method : PaymentMethod;
    reference : ?Text;
  };
  public type Payment = PaymentInput and { id : Nat; voucherId : Nat; at : Types.Time; by : Principal };

  public type Reminder = {
    id : Nat;
    number : Nat;
    salesDocId : Nat;
    date : Date;
    invoiceNumber : Nat;
    dueDate : Date;
    balance : Money;
    interest : Money;
    interestRateBp : Int;
    fee : Money;
    /// "reminderFee" (agreed, 1981:739 2 §) or "forseningsersattning" (B2B, 4 a §) or "none".
    feeKind : Text;
    language : Lang;
    seller : Types.CompanyProfile;
    buyer : PartySnapshot;
    contentHash : Blob;
    at : Types.Time;
    by : Principal;
  };

  public type RefRate = { from : Date; rateBp : Int };

  /// Legal amounts kept as data with their source (V13, V14, V2).
  public type Parameters = {
    referenceRates : [RefRate];
    lateInterestMarginBp : Nat;
    reminderFee : Money;
    forseningsersattning : Money;
    simplifiedInvoiceLimit : Money;
    ocrLengthDigit : Bool;
    source : Text;
  };

  public type Sales = {
    customers : Map.Map<Nat, Customer>;
    items : Map.Map<Nat, Item>;
    drafts : Map.Map<Nat, SalesDraft>;
    docs : Map.Map<Nat, SalesDoc>;
    /// invoice -> credit notes
    creditsOf : Map.Map<Nat, [Nat]>;
    quoteStatus : Map.Map<Nat, QuoteStatus>;
    /// quote -> invoices made from it
    invoicesOf : Map.Map<Nat, [Nat]>;
    payments : Map.Map<Nat, Payment>;
    paymentsOf : Map.Map<Nat, [Nat]>;
    reminders : Map.Map<Nat, Reminder>;
    remindersOf : Map.Map<Nat, [Nat]>;
    /// "invoice" (invoices and credit notes share one series), "quote", "reminder" -> last number.
    numbering : Map.Map<Text, Nat>;
    /// ROT/RUT: invoice -> deduction Skatteverket did not pay, now owed by the customer.
    husAdjust : Map.Map<Nat, Int>;
    var params : Parameters;
    var next : Nat; // shared id counter for customers, items, drafts, documents, payments, reminders
  };

  // ── API views ──

  public type DocView = {
    doc : SalesDoc;
    status : DocStatus;
    credited : Money;
    paid : Money;
    /// What the customer pays: total less a ROT/RUT deduction, plus any part Skatteverket refused.
    payable : Money;
    balance : Money;
    overdue : Bool;
    credits : [Nat];
    payments : [Payment];
    reminders : [Nat];
    invoices : [Nat];
  };

  public type DocSummary = {
    id : Nat;
    kind : DocKind;
    number : Nat;
    customerName : Text;
    issueDate : Date;
    dueDate : ?Date;
    currency : Text;
    total : Money;
    balance : Money;
    status : DocStatus;
  };
};
