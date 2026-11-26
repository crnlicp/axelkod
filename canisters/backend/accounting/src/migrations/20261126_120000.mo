// ROT/RUT (A8): an optional `hus` part on sales drafts and documents, the refused-deduction
// adjustments, and the ROT/RUT register with the 2026 parameters verified in V12.
// Self-contained: types are copied, not imported.
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

  type HusKind = { #rot; #rut };
  type HusLinePart = { #labour : Text; #material : Text; #other };
  type HusBuyerInput = { identityEnc : Blob; shareBp : Nat };
  type HusInput = { kind : HusKind; lineParts : [?HusLinePart]; buyers : [HusBuyerInput]; propertyEnc : ?Blob; deductionLimit : ?Money };
  type HusWork = { workType : Text; labour : Money; material : Money };
  type HusBuyer = HusBuyerInput and { amount : Money };
  type HusPart = {
    kind : HusKind; rateBp : Nat; lineParts : [?HusLinePart]; labour : Money; material : Money; other : Money;
    work : [HusWork]; deduction : Money; buyers : [HusBuyer]; propertyEnc : ?Blob;
  };

  type NewDocInput = DocInput and { hus : ?HusInput };
  type NewSalesDraft = { id : Nat; kind : DocKind; input : NewDocInput; creditOf : ?Nat; quoteOf : ?Nat; updatedAt : Int; updatedBy : Principal };
  type NewSnapshot = Snapshot and { hus : ?HusPart };
  type NewSalesDoc = {
    id : Nat; kind : DocKind; number : Nat; snapshot : NewSnapshot; contentHash : Blob; customerId : Nat; creditOf : ?Nat;
    quoteOf : ?Nat; voucherId : ?Nat; issuedAt : Int; issuedBy : Principal; retainUntil : Date;
  };
  type NewSales = {
    customers : Map.Map<Nat, Customer>;
    items : Map.Map<Nat, Item>;
    drafts : Map.Map<Nat, NewSalesDraft>;
    docs : Map.Map<Nat, NewSalesDoc>;
    creditsOf : Map.Map<Nat, [Nat]>;
    quoteStatus : Map.Map<Nat, QuoteStatus>;
    invoicesOf : Map.Map<Nat, [Nat]>;
    payments : Map.Map<Nat, Payment>;
    paymentsOf : Map.Map<Nat, [Nat]>;
    reminders : Map.Map<Nat, Reminder>;
    remindersOf : Map.Map<Nat, [Nat]>;
    numbering : Map.Map<Text, Nat>;
    husAdjust : Map.Map<Nat, Int>;
    var params : Parameters;
    var next : Nat;
  };

  type HoursInput = { workType : Text; hours : Nat };
  type HusCase = {
    id : Nat; salesDocId : Nat; invoiceNumber : Nat; kind : HusKind; paymentIds : [Nat]; paymentDate : Date; year : Nat;
    labour : Money; paidLabour : Money; requested : Money; material : Money; other : Money; hours : [HoursInput];
    buyerAmounts : [Money]; subcontractor : Bool; staffingAgency : Bool; deadline : Date;
    status : { #draft; #claimed; #submitted; #decided; #cancelled }; claimId : ?Nat; approved : ?Money; decisionRef : ?Text;
    decisionDate : ?Date; voucherId : ?Nat; createdAt : Int; createdBy : Principal;
  };
  type Claim = {
    id : Nat; kind : HusKind; year : Nat; name : Text; caseIds : [Nat]; xmlVersion : Text; createdAt : Int; createdBy : Principal;
    submittedAt : ?Int; submittedDate : ?Date; confirmed : Bool;
  };
  type Params = { from : Date; rotBp : Nat; rutBp : Nat; rotCap : Money; totalCap : Money; xml11From : Date; source : Text };
  type RotRut = {
    cases : Map.Map<Nat, HusCase>;
    casesOf : Map.Map<Nat, [Nat]>;
    claims : Map.Map<Nat, Claim>;
    var params : [Params];
    var next : Nat;
  };

  type OldActor = { sales : Sales };
  type NewActor = { sales : NewSales; rotRut : RotRut };

  public func migration(old : OldActor) : NewActor {
    let s = old.sales;
    {
      sales = {
        customers = s.customers;
        items = s.items;
        drafts = s.drafts.map(func(_, d) = { d with input = { d.input with hus = null } });
        docs = s.docs.map(func(_, d) = { d with snapshot = { d.snapshot with hus = null } });
        creditsOf = s.creditsOf;
        quoteStatus = s.quoteStatus;
        invoicesOf = s.invoicesOf;
        payments = s.payments;
        paymentsOf = s.paymentsOf;
        reminders = s.reminders;
        remindersOf = s.remindersOf;
        numbering = s.numbering;
        husAdjust = Map.empty();
        var params = s.params;
        var next = s.next;
      };
      rotRut = {
        cases = Map.empty();
        casesOf = Map.empty();
        claims = Map.empty();
        // Skatteverket "Rot och rut – företag" (read 2026-11-26, sources.md V12): ROT 30 %, RUT 50 %,
        // 75 000 kr per person and year of which at most 50 000 kr ROT; the 2027 fields (XML 1.1) from 2027-01-01.
        var params = [{
          from = "2026-01-01"; rotBp = 3_000; rutBp = 5_000; rotCap = 5_000_000; totalCap = 7_500_000; xml11From = "2027-01-01";
          source = "https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut.4.2ef18e6a125660db8b080002674.html";
        }];
        var next = 1;
      };
    };
  };
};
