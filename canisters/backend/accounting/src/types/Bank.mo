// Bank accounts, imported transactions, matching rules and the tax account
// (skattekonto). Imports are rows the browser parsed from a CSV file; the canister
// skips duplicates and books matches as B vouchers.
import Map "mo:core/Map";
import Types "../types";

module {
  type Date = Types.Date;
  type Money = Types.Money;

  /// Column mapping remembered per bank account (0-based column indexes).
  public type CsvMapping = {
    delimiter : Text;
    skipRows : Nat;
    dateCol : Nat;
    amountCol : Nat;
    textCol : Nat;
    referenceCol : ?Nat;
    counterpartyCol : ?Nat;
    decimalComma : Bool;
  };

  public type BankAccountInput = { name : Text; ledgerAccount : Nat; bank : Text; mapping : ?CsvMapping };
  public type BankAccount = BankAccountInput and { id : Nat };

  public type Row = { date : Date; amount : Money; text : Text; reference : ?Text; counterparty : ?Text };

  /// What a transaction was matched to; always a posted voucher.
  public type Match = {
    #salesPayment : Nat;
    #supplierPayment : Nat;
    #booked; // a new voucher from a rule or manual counter lines
    #existing; // linked to a voucher that already had the bank line
  };

  public type BankTx = Row and {
    id : Nat;
    accountId : Nat;
    batch : Nat;
    match : ?{ kind : Match; voucherId : Nat; at : Types.Time; by : Principal };
  };

  public type Rule = {
    id : Nat;
    /// Case-insensitive substring of the transaction text or counterparty.
    contains : Text;
    account : Nat;
    /// Input VAT included in the amount (0 = none), split out to 2641.
    vatRateBp : Nat;
    description : Text;
  };
  public type RuleInput = { contains : Text; account : Nat; vatRateBp : Nat; description : Text };

  public type Suggestion = {
    reason : { #ocr; #amount; #rule };
    target : { #invoice : Nat; #purchase : Nat; #rule : Nat };
    title : Text;
    amount : Money;
  };

  public type ImportResult = { batch : Nat; added : Nat; duplicates : Nat };

  public type TaxKind = {
    #vat; // 2650
    #employerFee; // 2731
    #withheldTax; // 2710
    #prelimTax; // 2518
    #interestIncome; // 8314, tax-free (V24)
    #interestCost; // 8423, not deductible (V24)
    #payment; // deposit from the bank: linked to the bank voucher
    #refund; // payout to the bank: linked to the bank voucher
    #other; // account chosen when booking
  };

  public type TaxRow = { date : Date; amount : Money; text : Text; kind : TaxKind };
  public type TaxEntry = TaxRow and { id : Nat; batch : Nat; voucherId : ?Nat };

  public type TaxSummary = { balance : Money; ledger : Money; unbooked : Nat; lastDate : ?Date };

  public type Bank = {
    accounts : Map.Map<Nat, BankAccount>;
    txs : Map.Map<Nat, BankTx>;
    /// duplicate key -> transaction
    txKeys : Map.Map<Text, Nat>;
    /// voucher -> transaction (one bank transaction per voucher)
    voucherTx : Map.Map<Nat, Nat>;
    rules : Map.Map<Nat, Rule>;
    tax : Map.Map<Nat, TaxEntry>;
    taxKeys : Map.Map<Text, Nat>;
    var next : Nat;
    var batch : Nat;
  };
};
