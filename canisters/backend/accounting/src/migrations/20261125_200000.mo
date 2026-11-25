// Sales (A4): customers, items, quotes, invoices, credit notes, payments, reminders
// and the legal parameters. Self-contained: types are copied, not imported.
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";

module {
  type Date = Text;
  type Money = Int;
  type CompanyProfile = {
    legalName : Text; orgNr : Text; vatNr : Text; registeredOffice : Text; street : Text;
    postalCode : Text; city : Text; country : Text; email : Text; phone : ?Text; web : ?Text;
    bankgiro : ?Text; plusgiro : ?Text; iban : ?Text; bic : ?Text; fSkatt : Bool; peppolId : ?Text;
  };

  type Lang = { #sv; #en };
  type Address = { street : Text; postalCode : Text; city : Text; country : Text };

  type CustomerInput = {
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
  type Customer = CustomerInput and { id : Nat };

  type ItemInput = {
    sku : Text;
    name : Text;
    unit : Text;
    priceExVat : Money;
    vatCode : Text;
    account : Nat;
    kind : { #goods; #service };
    active : Bool;
  };
  type Item = ItemInput and { id : Nat };

  /// Quantity in thousandths (1 500 = 1,5); prices in the document currency's minor unit.
  type DocLine = {
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
  type FxRate = { rate : Nat; date : Date };

  type DocInput = {
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
  };

  type DocKind = { #quote; #invoice; #creditNote };

  type SalesDraft = {
    id : Nat;
    kind : DocKind;
    input : DocInput;
    creditOf : ?Nat;
    quoteOf : ?Nat;
    updatedAt : Int;
    updatedBy : Principal;
  };

  /// What is printed (C10): only the buyer's printed fields.
  type PartySnapshot = {
    name : Text;
    orgNr : ?Text;
    vatNr : ?Text;
    address : Address;
    email : ?Text;
    peppolId : ?Text;
    kind : { #company; #person };
  };

  type SnapLine = {
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
  type VatRow = { vatCode : Text; rateBp : Nat; category : Text; base : Money; vat : Money };

  /// Everything printed on the document, frozen at issue and hashed (acj-1).
  type Snapshot = {
    kind : DocKind;
    number : Nat;
    seller : CompanyProfile;
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
  };

  type SalesDoc = {
    id : Nat;
    kind : DocKind;
    number : Nat;
    snapshot : Snapshot;
    contentHash : Blob;
    customerId : Nat;
    creditOf : ?Nat;
    quoteOf : ?Nat;
    voucherId : ?Nat;
    issuedAt : Int;
    issuedBy : Principal;
    retainUntil : Date;
  };

  type QuoteStatus = { #sent; #accepted; #declined; #expired };
  type DocStatus = { #issued; #paid; #partiallyPaid; #overdue; #credited; #quote : QuoteStatus };

  type PaymentMethod = { #bankgiro; #swish; #card; #transfer; #cash };

  type PaymentInput = {
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
  type Payment = PaymentInput and { id : Nat; voucherId : Nat; at : Int; by : Principal };

  type Reminder = {
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
    seller : CompanyProfile;
    buyer : PartySnapshot;
    contentHash : Blob;
    at : Int;
    by : Principal;
  };

  type RefRate = { from : Date; rateBp : Int };

  /// Legal amounts kept as data with their source (V13, V14, V2).
  type Parameters = {
    referenceRates : [RefRate];
    lateInterestMarginBp : Nat;
    reminderFee : Money;
    forseningsersattning : Money;
    simplifiedInvoiceLimit : Money;
    ocrLengthDigit : Bool;
    source : Text;
  };

  type Sales = {
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
    var params : Parameters;
    var next : Nat; // shared id counter for customers, items, drafts, documents, payments, reminders
  };


  type OldActor = {};
  type NewActor = { sales : Sales };

  public func migration(_ : OldActor) : NewActor {
    {
      sales = {
        customers = Map.empty();
        items = Map.empty();
        drafts = Map.empty();
        docs = Map.empty();
        creditsOf = Map.empty();
        quoteStatus = Map.empty();
        invoicesOf = Map.empty();
        payments = Map.empty();
        paymentsOf = Map.empty();
        reminders = Map.empty();
        remindersOf = Map.empty();
        numbering = Map.empty();
        // Riksbanken "Referensränta" (read 2026-11-25), Räntelagen 6 §, 1981:739 4 and 4 a §§, ML 17:26 (sources.md V2, V13, V14).
        var params = {
          referenceRates = [
            { from = "2025-01-01"; rateBp = 300 },
            { from = "2025-07-01"; rateBp = 200 },
            { from = "2026-01-01"; rateBp = 200 },
            { from = "2026-07-01"; rateBp = 200 },
          ];
          lateInterestMarginBp = 800;
          reminderFee = 6_000;
          forseningsersattning = 45_000;
          simplifiedInvoiceLimit = 400_000;
          ocrLengthDigit = true;
          source = "https://www.riksbank.se/sv/statistik/rantor-och-valutakurser/referensranta/ (2026-06-30); SFS 1975:635 6 §; SFS 1981:739 4, 4 a §§; SFS 2023:200 17 kap. 26 §";
        };
        var next = 1;
      };
    };
  };
};
