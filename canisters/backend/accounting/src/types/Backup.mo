// Full backup and restore (A9c, spec §10). Every store is exported verbatim, a page at
// a time; a restore into an empty canister writes the same records back, so numbers,
// content hashes and the audit chain stay exactly as they were. Ciphertext from the old
// canister's vetKeys is kept, and `rekey` maps it to the same plaintext re-encrypted
// under this canister's keys.
import Map "mo:core/Map";
import Types "../types";
import As "Assets";
import B "Bank";
import P "Purchases";
import Pr "Payroll";
import R "RotRut";
import S "Sales";
import V "Vat";
import YT "YearEnd";

module {
  /// The `var` fields of every store.
  public type Singletons = {
    company : ?Types.CompanyProfile;
    settings : Types.AccountingSettings;
    lockDate : ?Types.Date;
    seedVersion : Text;
    nextFiscalYear : Nat;
    nextVoucher : Nat;
    nextDraft : Nat;
    nextAttachment : Nat;
    nextTicket : Nat;
    salesParams : S.Parameters;
    salesNext : Nat;
    purchasesNext : Nat;
    bankNext : Nat;
    bankBatch : Nat;
    vatNext : Nat;
    payrollParams : Pr.Params;
    payrollNext : Nat;
    husParams : [R.HusParams];
    rotRutNext : Nat;
    assetsNext : Nat;
  };

  /// One page of one store. Index maps of the same shape share a case, named by `store`.
  public type Chunk = {
    #roles : [(Principal, Types.RoleAssignment)];
    #fiscalYears : [(Nat, Types.FiscalYear)];
    #accounts : [(Nat, Types.Account)];
    #vatCodes : [(Text, Types.VatCode)];
    #series : [(Text, Types.Series)];
    #vouchers : [(Nat, Types.Voucher)];
    #voucherDrafts : [(Nat, Types.VoucherDraft)];
    #attachmentLinks : [(Nat, [Types.SourceRef])];
    #attachments : [Types.Attachment];
    #audit : [Types.AuditEntry];
    #customers : [(Nat, S.Customer)];
    #items : [(Nat, S.Item)];
    #salesDrafts : [(Nat, S.SalesDraft)];
    #salesDocs : [(Nat, S.SalesDoc)];
    #quoteStatus : [(Nat, S.QuoteStatus)];
    #payments : [(Nat, S.Payment)];
    #reminders : [(Nat, S.Reminder)];
    #suppliers : [(Nat, P.Supplier)];
    #purchases : [(Nat, P.Purchase)];
    #supplierPayments : [(Nat, P.SupplierPayment)];
    #bankAccounts : [(Nat, B.BankAccount)];
    #bankTxs : [(Nat, B.BankTx)];
    #bankRules : [(Nat, B.Rule)];
    #taxEntries : [(Nat, B.TaxEntry)];
    #vatReturns : [(Nat, V.VatReturn)];
    #ecSalesLists : [(Nat, V.EcSalesList)];
    #vatChecks : [(Text, V.VatCheck)];
    #employees : [(Nat, Pr.Employee)];
    #payItems : [(Text, Pr.PayItem)];
    #taxTables : [(Nat, Pr.TaxTable)];
    #payRuns : [(Nat, Pr.PayRun)];
    #agiReturns : [(Nat, Pr.AgiReturn)];
    #vaxa : [(Nat, Pr.VaxaApplication)];
    #husCases : [(Nat, R.HusCase)];
    #claims : [(Nat, R.Claim)];
    #assets : [(Nat, As.Asset)];
    #depRuns : [(Nat, As.DepRun)];
    #stockItems : [(Nat, As.StockItem)];
    #stockMoves : [(Nat, As.StockMove)];
    #counts : [(Nat, As.Count)];
    #opening : [(Nat, [YT.OpeningLine])];
    #closings : [(Nat, YT.Closing)];
    #natNats : { store : Text; entries : [(Nat, [Nat])] };
    #textNat : { store : Text; entries : [(Text, Nat)] };
    #natInt : { store : Text; entries : [(Nat, Int)] };
    #natNat : { store : Text; entries : [(Nat, Nat)] };
  };

  public type Restore = {
    /// The owner running a restore; other restore calls are refused meanwhile.
    var by : ?Principal;
    /// Old ciphertext (pii-v1 under the backed-up canister's key) -> the same plaintext
    /// encrypted under this canister's key.
    rekey : Map.Map<Blob, Blob>;
  };

  public type Summary = { store : Text; count : Nat };
};
