// Payroll (A7): empty registers and the 2026 parameters verified in V8, V9, V11.
// Pay items come from the seed. Self-contained: types are copied, not imported.
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";

module {
  type Date = Text;
  type Money = Int;
  type Time = Int;
  type Pay = { #monthly : Money; #hourly : Money };
  type Tax = { #table : { table : Nat; column : Nat }; #flat : Nat; #none };
  type Employee = {
    name : Text; email : ?Text; birthYear : Nat; employedFrom : Date; employedTo : ?Date; pay : Pay; tax : Tax;
    jamkning : ?Text; vacationRule : { #sammaloneregeln; #procentregeln }; vacationDays : Nat; ownerOrRelated : Bool;
    vaxaFrom : ?Text; costCenter : ?Text; active : Bool; personnummerEnc : Blob; addressEnc : ?Blob; bankAccountEnc : ?Blob;
    workplaceStreet : ?Text; workplaceCity : ?Text; id : Nat;
  };
  type ItemKind = { #cash; #benefit; #taxFree; #netDeduction };
  type PayItem = { code : Text; name : Text; kind : ItemKind; vacationBearing : Bool; agiField : ?Nat; account : ?Nat; active : Bool };
  type PayLine = { code : Text; text : ?Text; quantity : Int; rate : Money; amount : Money };
  type SlipInput = { employeeId : Nat; lines : [PayLine]; taxOverride : ?Money };
  type FeeCategory = { #full; #pension; #none; #youth };
  type AgiField = { code : Nat; amount : Int };
  type Payslip = {
    employeeId : Nat; name : Text; lines : [PayLine]; cash : Money; benefits : Money; taxFree : Money; netDeductions : Money;
    tax : Money; net : Money; feeBase : Money; feeCategory : FeeCategory; fees : Money; vacationAccrual : Money;
    vacationFees : Money; agi : [AgiField];
  };
  type PayRun = {
    id : Nat; period : Text; paymentDate : Date; inputs : [SlipInput]; slips : [Payslip]; status : { #draft; #approved; #paid };
    voucherId : ?Nat; paidVoucherId : ?Nat; approvedAt : ?Time; approvedBy : ?Principal; updatedAt : Time;
  };
  type AgiReturn = {
    id : Nat; period : Text; runIds : [Nat]; individuals : [{ employeeId : Nat; specNr : Nat; fields : [AgiField] }];
    sumFees : Int; sumTax : Int; createdAt : Time; createdBy : Principal; filedAt : ?Time; receiptRef : ?Text;
  };
  type VaxaApplication = {
    id : Nat; period : Text; employeeId : Nat; base : Int; cap : Int; refund : Int; monthIndex : Nat;
    status : { #draft; #submitted; #approved; #rejected }; createdAt : Time; updatedAt : Time;
  };
  type TaxTable = { year : Nat; table : Nat; rows : [{ from : Nat; to : Nat; percent : Bool; cols : [Nat] }]; sha256 : Blob; importedAt : Time; importedBy : Principal };
  type Params = {
    year : Nat; feeFullBp : Nat; feePensionBp : Nat; pensionAge : Nat; zeroBornBefore : Nat;
    youth : ?{ fromPeriod : Text; toPeriod : Text; minAge : Nat; maxAge : Nat; bp : Nat; cap : Money };
    yearThreshold : Money; flatTaxBp : Nat; vacationPercentBp : Nat; vacationSupplementBp : Nat; vaxaRefundBp : Nat;
    vaxaCap : Money; vaxaCapBefore202405 : Money; vaxaMonths : Nat; mileageOwn : Money; mileageBenefitCar : Money;
    mileageElectric : Money; perDiemFull : Money; perDiemHalf : Money; perDiemAfter3Months : Money; perDiemNight : Money;
    mealBreakfast : Money; mealLunch : Money; mealFull : Money; prisbasbelopp : Money; source : Text;
  };
  type Payroll = {
    employees : Map.Map<Nat, Employee>;
    items : Map.Map<Text, PayItem>;
    tables : Map.Map<Nat, TaxTable>;
    runs : Map.Map<Nat, PayRun>;
    agi : Map.Map<Nat, AgiReturn>;
    agiOf : Map.Map<Text, Nat>;
    vaxa : Map.Map<Nat, VaxaApplication>;
    var params : Params;
    var next : Nat;
  };

  type OldActor = {};
  type NewActor = { payroll : Payroll };

  public func migration(_ : OldActor) : NewActor {
    {
      payroll = {
        employees = Map.empty();
        items = Map.empty();
        tables = Map.empty();
        runs = Map.empty();
        agi = Map.empty();
        agiOf = Map.empty();
        vaxa = Map.empty();
        var params = {
          year = 2026;
          feeFullBp = 3142;
          feePensionBp = 1021;
          pensionAge = 67;
          zeroBornBefore = 1938;
          // 1 Apr 2026 – 30 Sep 2027, turned 18 but not 23 at the start of the year: 20,81 % up to 25 000 kr.
          youth = ?{ fromPeriod = "202604"; toPeriod = "202709"; minAge = 18; maxAge = 22; bp = 2081; cap = 2_500_000 };
          yearThreshold = 100_000;
          flatTaxBp = 3000;
          vacationPercentBp = 1200;
          vacationSupplementBp = 43;
          vaxaRefundBp = 2121;
          vaxaCap = 3_500_000;
          vaxaCapBefore202405 = 2_500_000;
          vaxaMonths = 24;
          mileageOwn = 2_500;
          mileageBenefitCar = 1_200;
          mileageElectric = 950;
          perDiemFull = 30_000;
          perDiemHalf = 15_000;
          perDiemAfter3Months = 21_000;
          perDiemNight = 15_000;
          mealBreakfast = 6_200;
          mealLunch = 12_400;
          mealFull = 31_000;
          prisbasbelopp = 5_920_000;
          source = "Skatteverket: Arbetsgivaravgifter; AGI teknisk beskrivning 1.1.18.2; Regler för växa-stöd; Belopp och procent 2026; semesterlagen 16 a–16 b §§ (retrieved 2026-11-26, docs/accounting/sources.md V8, V9, V11)";
        };
        var next = 1;
      };
    };
  };
};
