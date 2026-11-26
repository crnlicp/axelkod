// Year-end (A9b): opening balances, the year-end checklist, the tax calculation and the
// closing voucher. Sources: docs/accounting/sources.md (tax row, V16, V19).
import Map "mo:core/Map";
import Types "../types";

module {
  type Money = Types.Money;

  /// Ingående balans for one account; amounts in öre, debit positive.
  public type OpeningLine = { account : Nat; amount : Money };

  /// Verified per calendar year in which the tax year ends (IL 65:10, 30:5, 30:6 a).
  public type TaxParams = {
    year : Nat;
    corporateTaxBp : Nat;
    fundMaxBp : Nat;
    /// Statslåneräntan at the end of November of the year before.
    statslaneRantaBp : Nat;
    source : Text;
  };

  public type TaxInput = {
    /// Outnyttjat underskott from last year's return (INK2S 4.14a), positive.
    deficitIn : Money;
    /// Allocation to a periodiseringsfond, whole kronor.
    fund : Money;
    /// Further adjustments (INK2S 4.13), positive.
    otherAdd : Money;
    otherDeduct : Money;
  };

  public type Reversal = { account : Nat; year : Nat; amount : Money };

  /// Amounts in öre. `result` is the book result before appropriations and tax.
  public type TaxCalc = {
    result : Money;
    nonDeductible : Money;
    taxFree : Money;
    fundsAtStart : Money;
    schablon : Money;
    reversals : [Reversal];
    reversed : Money;
    otherAdd : Money;
    otherDeduct : Money;
    deficitIn : Money;
    /// Surplus before the fund allocation, after the deficit.
    base : Money;
    fundMax : Money;
    fund : Money;
    fundAccount : ?Nat;
    surplus : Money;
    deficitOut : Money;
    taxable : Money;
    tax : Money;
    resultAfterTax : Money;
    params : TaxParams;
  };

  public type StepState = { #done; #todo; #notApplicable };
  /// `amount`: the ledger figure the step compares against; `count`: items still open.
  public type Step = { id : Text; state : StepState; amount : ?Money; count : ?Nat };

  public type Closing = {
    fiscalYearId : Nat;
    /// Steps confirmed by hand: "accruals", "payroll".
    confirmed : [Text];
    /// Balances from the bank and tax account statements at the last day of the year.
    bankStatement : ?Money;
    taxStatement : ?Money;
    cashVoucherId : ?Nat;
    cashReversalId : ?Nat;
    tax : ?TaxCalc;
    taxInput : ?TaxInput;
    closingVoucherId : ?Nat;
    transferredTo : ?Nat;
  };

  public type Status = { fiscalYear : Types.FiscalYear; steps : [Step]; closing : Closing; canLock : Bool };

  public type YearEnd = {
    opening : Map.Map<Nat, [OpeningLine]>;
    closings : Map.Map<Nat, Closing>;
  };
};
