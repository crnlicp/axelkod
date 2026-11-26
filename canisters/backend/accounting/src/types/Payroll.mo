// Payroll: employees (personal data encrypted in the browser with pii-v1), pay items
// (lönearter), tax tables, pay runs, AGI returns and växa-stöd applications (V7–V11).
// Pay runs are calculated here so totals are trusted and repeatable (C24).
import Map "mo:core/Map";
import Types "../types";

module {
  type Date = Types.Date;
  type Money = Types.Money;
  type Time = Types.Time;

  public type Pay = { #monthly : Money; #hourly : Money };

  /// Withholding: a table and column (huvudinkomst), a flat rate in basis points (30 % for
  /// non-main income, or a decision from Skatteverket), or none (decision: no withholding).
  public type Tax = { #table : { table : Nat; column : Nat }; #flat : Nat; #none };

  public type VacationRule = { #sammaloneregeln; #procentregeln };

  public type EmployeeInput = {
    name : Text;
    email : ?Text;
    birthYear : Nat;
    employedFrom : Date;
    employedTo : ?Date;
    pay : Pay;
    tax : Tax;
    jamkning : ?Text;
    vacationRule : VacationRule;
    vacationDays : Nat;
    /// Delägare/företagsledare or närstående: never växa-stöd.
    ownerOrRelated : Bool;
    /// First month of växa-stöd (YYYYMM), set when the employer has checked the conditions.
    vaxaFrom : ?Text;
    costCenter : ?Text;
    active : Bool;
    /// AES-GCM ciphertext under the pii-v1 vetKey (C16); the canister never sees plaintext.
    personnummerEnc : Blob;
    addressEnc : ?Blob;
    bankAccountEnc : ?Blob;
    /// AGI 245/246: where the employee works (defaults to the company address).
    workplaceStreet : ?Text;
    workplaceCity : ?Text;
  };
  public type Employee = EmployeeInput and { id : Nat };

  /// #cash: paid out, taxable, fee-bearing. #benefit: not paid out, taxable, fee-bearing.
  /// #taxFree: paid out, neither. #netDeduction: deducted from net pay after tax.
  public type ItemKind = { #cash; #benefit; #taxFree; #netDeduction };

  public type PayItem = {
    code : Text;
    name : Text;
    kind : ItemKind;
    vacationBearing : Bool;
    /// AGI field the amount is reported in (011, 012, 013, 018, 020) or flagged (050, 051).
    agiField : ?Nat;
    /// Debit for cash and tax-free items, credit for net deductions; none for benefits.
    account : ?Nat;
    active : Bool;
  };

  public type PayLine = {
    code : Text;
    text : ?Text;
    quantity : Int; // thousandths
    rate : Money;
    amount : Money;
  };

  public type SlipInput = { employeeId : Nat; lines : [PayLine]; taxOverride : ?Money };

  public type FeeCategory = { #full; #pension; #none; #youth };

  public type AgiField = { code : Nat; amount : Int };

  public type Payslip = {
    employeeId : Nat;
    name : Text;
    lines : [PayLine];
    cash : Money;
    benefits : Money;
    taxFree : Money;
    netDeductions : Money;
    tax : Money;
    net : Money;
    /// AeIU: 011 + 012 + 013 + 018/1.2 (V7).
    feeBase : Money;
    feeCategory : FeeCategory;
    fees : Money;
    vacationAccrual : Money;
    vacationFees : Money;
    /// What the individuppgift reports, whole kronor.
    agi : [AgiField];
  };

  public type RunStatus = { #draft; #approved; #paid };

  public type PayRun = {
    id : Nat;
    period : Text; // YYYYMM
    paymentDate : Date;
    inputs : [SlipInput];
    slips : [Payslip];
    status : RunStatus;
    voucherId : ?Nat;
    paidVoucherId : ?Nat;
    approvedAt : ?Time;
    approvedBy : ?Principal;
    updatedAt : Time;
  };

  public type AgiIndividual = { employeeId : Nat; specNr : Nat; fields : [AgiField] };

  public type AgiReturn = {
    id : Nat;
    period : Text;
    runIds : [Nat];
    individuals : [AgiIndividual];
    sumFees : Int; // 487
    sumTax : Int; // 497
    createdAt : Time;
    createdBy : Principal;
    filedAt : ?Time;
    receiptRef : ?Text;
  };

  public type VaxaStatus = { #draft; #submitted; #approved; #rejected };

  public type VaxaApplication = {
    id : Nat;
    period : Text;
    employeeId : Nat;
    base : Int; // kronor
    cap : Int;
    refund : Int;
    monthIndex : Nat; // 1..24
    status : VaxaStatus;
    createdAt : Time;
    updatedAt : Time;
  };

  public type TaxTableRow = { from : Nat; to : Nat; percent : Bool; cols : [Nat] };

  public type TaxTableInfo = { year : Nat; table : Nat; rows : Nat; sha256 : Blob; importedAt : Time };

  public type TaxTable = { year : Nat; table : Nat; rows : [TaxTableRow]; sha256 : Blob; importedAt : Time; importedBy : Principal };

  /// Legal amounts kept as data with their source (V8, V9, V11). Rates in basis points,
  /// money in öre. Owner-editable; every change is audited.
  public type Params = {
    year : Nat;
    feeFullBp : Nat;
    feePensionBp : Nat;
    /// Only ålderspensionsavgift from the year after turning this age.
    pensionAge : Nat;
    /// No fees for those born before this year.
    zeroBornBefore : Nat;
    youth : ?{ fromPeriod : Text; toPeriod : Text; minAge : Nat; maxAge : Nat; bp : Nat; cap : Money };
    /// No fees or withholding below this total in a year.
    yearThreshold : Money;
    flatTaxBp : Nat;
    vacationPercentBp : Nat;
    vacationSupplementBp : Nat;
    vaxaRefundBp : Nat;
    vaxaCap : Money;
    vaxaCapBefore202405 : Money;
    vaxaMonths : Nat;
    mileageOwn : Money;
    mileageBenefitCar : Money;
    mileageElectric : Money;
    perDiemFull : Money;
    perDiemHalf : Money;
    perDiemAfter3Months : Money;
    perDiemNight : Money;
    mealBreakfast : Money;
    mealLunch : Money;
    mealFull : Money;
    prisbasbelopp : Money;
    source : Text;
  };

  public type Payroll = {
    employees : Map.Map<Nat, Employee>;
    items : Map.Map<Text, PayItem>;
    tables : Map.Map<Nat, TaxTable>; // year * 100 + table
    runs : Map.Map<Nat, PayRun>;
    agi : Map.Map<Nat, AgiReturn>;
    agiOf : Map.Map<Text, Nat>; // period -> return
    vaxa : Map.Map<Nat, VaxaApplication>;
    var params : Params;
    var next : Nat;
  };

  public type RunSummary = {
    id : Nat;
    period : Text;
    paymentDate : Date;
    status : RunStatus;
    employees : Nat;
    gross : Money;
    tax : Money;
    net : Money;
    fees : Money;
  };
};
