// Year-end (A9b): opening balances and the year-end state per fiscal year start empty.
// Self-contained: types are copied, not imported.
import Map "mo:core/Map";
import Nat "mo:core/Nat";

module {
  type Money = Int;
  type OpeningLine = { account : Nat; amount : Money };
  type TaxParams = { year : Nat; corporateTaxBp : Nat; fundMaxBp : Nat; statslaneRantaBp : Nat; source : Text };
  type TaxInput = { deficitIn : Money; fund : Money; otherAdd : Money; otherDeduct : Money };
  type Reversal = { account : Nat; year : Nat; amount : Money };
  type TaxCalc = {
    result : Money; nonDeductible : Money; taxFree : Money; fundsAtStart : Money; schablon : Money;
    reversals : [Reversal]; reversed : Money; otherAdd : Money; otherDeduct : Money; deficitIn : Money;
    base : Money; fundMax : Money; fund : Money; fundAccount : ?Nat; surplus : Money; deficitOut : Money;
    taxable : Money; tax : Money; resultAfterTax : Money; params : TaxParams;
  };
  type Closing = {
    fiscalYearId : Nat; confirmed : [Text]; bankStatement : ?Money; taxStatement : ?Money;
    cashVoucherId : ?Nat; cashReversalId : ?Nat; tax : ?TaxCalc; taxInput : ?TaxInput;
    closingVoucherId : ?Nat; transferredTo : ?Nat;
  };
  type YearEnd = { opening : Map.Map<Nat, [OpeningLine]>; closings : Map.Map<Nat, Closing> };

  public func migration(_ : {}) : { yearEnd : YearEnd } = {
    yearEnd = { opening = Map.empty(); closings = Map.empty() };
  };
};
