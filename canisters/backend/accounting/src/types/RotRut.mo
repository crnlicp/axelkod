// ROT/RUT (husavdrag, A8): the invoice part, claim cases, claims (begäran) and
// Skatteverket's decisions. Personnummer, buyer names and the property are
// encrypted in the browser with pii-v1; the canister sees amounts, shares and dates.
// Sources: docs/accounting/sources.md V12.
import Map "mo:core/Map";
import Types "../types";

module {
  type Date = Types.Date;
  type Money = Types.Money;
  type Time = Types.Time;

  public type HusKind = { #rot; #rut };

  /// What an invoice line is for the deduction. The text is Skatteverket's work type
  /// (TypAvUtfortArbete, e.g. "BYGG", "IT_TJANSTER").
  public type HusLinePart = { #labour : Text; #material : Text; #other };

  /// `identityEnc`: JSON {"name","personnummer"} encrypted with pii-v1.
  public type HusBuyerInput = { identityEnc : Blob; shareBp : Nat };

  public type HusInput = {
    kind : HusKind;
    /// Parallel to the document lines; null = not part of the work (e.g. a fee).
    lineParts : [?HusLinePart];
    buyers : [HusBuyerInput];
    /// ROT only: JSON {"fastighetsbeteckning"} or {"brfOrgNr","lagenhetsnummer"} encrypted with pii-v1.
    propertyEnc : ?Blob;
    /// A lower deduction than the maximum (e.g. the buyer has less left), in öre.
    deductionLimit : ?Money;
  };

  public type HusWork = { workType : Text; labour : Money; material : Money };
  public type HusBuyer = HusBuyerInput and { amount : Money };

  /// Frozen in the invoice snapshot. Amounts in öre incl. VAT; `deduction` is whole kronor.
  public type HusPart = {
    kind : HusKind;
    rateBp : Nat;
    lineParts : [?HusLinePart];
    labour : Money;
    material : Money;
    other : Money;
    work : [HusWork];
    deduction : Money;
    buyers : [HusBuyer];
    propertyEnc : ?Blob;
  };

  public type CaseStatus = { #draft; #claimed; #submitted; #decided; #cancelled };

  public type HoursInput = { workType : Text; hours : Nat };

  public type CaseInput = {
    salesDocId : Nat;
    hours : [HoursInput];
    /// Asked from 2027 (XML 1.1).
    subcontractor : Bool;
    staffingAgency : Bool;
  };

  /// One claimed set of payments on an invoice. Amounts in öre, whole kronor.
  public type HusCase = {
    id : Nat;
    salesDocId : Nat;
    invoiceNumber : Nat;
    kind : HusKind;
    paymentIds : [Nat];
    paymentDate : Date;
    year : Nat;
    /// Labour incl. VAT, the part of it the buyers paid, and the deduction claimed, for this case.
    labour : Money;
    paidLabour : Money;
    requested : Money;
    material : Money;
    other : Money;
    hours : [HoursInput];
    /// Per buyer, in the order of the invoice's buyers.
    buyerAmounts : [Money];
    subcontractor : Bool;
    staffingAgency : Bool;
    deadline : Date;
    status : CaseStatus;
    claimId : ?Nat;
    approved : ?Money;
    decisionRef : ?Text;
    decisionDate : ?Date;
    voucherId : ?Nat;
    createdAt : Time;
    createdBy : Principal;
  };

  public type Claim = {
    id : Nat;
    kind : HusKind;
    year : Nat;
    /// NamnPaBegaran, 1–16 characters.
    name : Text;
    caseIds : [Nat];
    /// "1.0", or "1.1" from 2027 (with the confirmation and the subcontractor fields).
    xmlVersion : Text;
    createdAt : Time;
    createdBy : Principal;
    submittedAt : ?Time;
    submittedDate : ?Date;
    confirmed : Bool;
  };

  public type HusParams = {
    from : Date;
    rotBp : Nat;
    rutBp : Nat;
    rotCap : Money;
    totalCap : Money;
    /// The first date XML 1.1 (with the 2027 fields) is used.
    xml11From : Date;
    source : Text;
  };

  public type RotRut = {
    cases : Map.Map<Nat, HusCase>;
    casesOf : Map.Map<Nat, [Nat]>;
    claims : Map.Map<Nat, Claim>;
    var params : [HusParams];
    var next : Nat;
  };

  /// A ROT/RUT invoice with payments not yet in a case (API view).
  public type HusReady = {
    salesDocId : Nat; number : Nat; customerName : Text; kind : HusKind; deduction : Money; payable : Money;
    paid : Money; unclaimed : Money; work : [Text];
  };

  public type DecisionInput = { caseId : Nat; approved : Money; reference : Text; date : Date; bankAccount : Nat };
};
