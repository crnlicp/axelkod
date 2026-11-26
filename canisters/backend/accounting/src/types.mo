// Accounting schema. Money is Int in öre (signed), dates are "YYYY-MM-DD",
// times are ns. Posted records are write-once; links live in index maps.
import List "mo:core/List";
import Map "mo:core/Map";

module {
  public type Date = Text;
  public type Money = Int;
  public type Time = Int;

  // ── Roles ──

  public type Role = { #owner; #bookkeeper; #payroll; #auditor };
  public type RoleAssignment = { role : Role; addedAt : Time; addedBy : Principal };
  public type Roles = Map.Map<Principal, RoleAssignment>;

  // ── Company and settings ──

  /// The legal profile printed on issued documents (C6). Owner-only.
  public type CompanyProfile = {
    legalName : Text;
    orgNr : Text; // NNNNNN-NNNN
    vatNr : Text; // SE + 10 digits + 01
    registeredOffice : Text; // säte
    street : Text;
    postalCode : Text;
    city : Text;
    country : Text; // ISO 3166-1 alpha-2
    email : Text;
    phone : ?Text;
    web : ?Text;
    bankgiro : ?Text;
    plusgiro : ?Text;
    iban : ?Text;
    bic : ?Text;
    fSkatt : Bool;
    peppolId : ?Text;
  };

  /// BFL 7:3 a: storage location reported to Skatteverket (C22).
  public type StorageNotice = { date : Date; location : Text };

  public type Modules = { payroll : Bool; rotRut : Bool; inventory : Bool };

  public type AccountingSettings = {
    accountingMethod : { #invoice; #cash };
    vatPeriod : { #month; #quarter; #year };
    invoiceTermsDays : Nat;
    defaultLanguage : { #sv; #en };
    storageNotice : ?StorageNotice;
    modules : Modules;
  };

  /// `lockDate` only moves forward: postings on or before it are rejected.
  public type Config = {
    var company : ?CompanyProfile;
    var settings : AccountingSettings;
    var lockDate : ?Date;
    var seedVersion : Text; // Seed.VERSION last applied (add-only)
    /// vetKD key name, fixed at first use: another key would make stored ciphertext unreadable.
    var vetkdKey : ?Text;
  };

  // ── Fiscal years, accounts, VAT, series ──

  public type FiscalYearStatus = { #open; #closing; #locked };
  public type FiscalYear = { id : Nat; start : Date; end : Date; status : FiscalYearStatus; lockedAt : ?Time };

  public type AccountKind = { #asset; #liability; #equity; #revenue; #expense };
  public type Account = {
    number : Nat; // 1000–8999
    name : Text;
    kind : AccountKind;
    vatCode : ?Text;
    sruCode : ?Text;
    active : Bool;
    bas : Bool; // from the BAS seed
  };

  public type VatKind = {
    #outputDomestic;
    #inputDomestic;
    #reverseChargePurchase;
    #euGoodsSale;
    #euServiceSale;
    #exportGoods;
    #exportServices;
    #exempt;
    #buyerLiableSE;
    #importVat;
  };
  /// `boxBase`: the VAT return box for amounts on accounts carrying this code; `boxVat`: the box for the code's VAT account (V3).
  public type VatCode = {
    code : Text;
    name : Text;
    rateBp : Nat;
    kind : VatKind;
    account : ?Nat;
    boxBase : ?Nat;
    boxVat : ?Nat;
    active : Bool;
  };

  public type Series = { code : Text; name : Text };

  // ── Vouchers ──

  public type VoucherLine = {
    account : Nat;
    amount : Money; // + debit, - credit
    vatCode : ?Text;
    costCenter : ?Text;
    project : ?Text;
    quantity : ?Int; // thousandths
    text : ?Text;
  };

  public type SourceRef = {
    #manual;
    #salesInvoice : Nat;
    #creditNote : Nat;
    #purchase : Nat;
    #payment : Nat;
    #bankTx : Nat;
    #taxAccount : Nat;
    #payRun : Nat;
    #vatReturn : Nat;
    #rotRut : Nat;
    #asset : Nat;
    #inventory : Nat;
    #yearEnd : Nat;
  };

  public type Voucher = {
    id : Nat;
    fiscalYearId : Nat;
    series : Text;
    number : Nat; // gapless per (series, fiscal year)
    eventDate : Date;
    registeredAt : Time;
    description : Text;
    lines : [VoucherLine];
    source : SourceRef;
    attachmentIds : [Nat];
    counterparty : ?Text;
    corrects : ?Nat;
    createdBy : Principal;
    retainUntil : Date;
  };

  public type VoucherInput = {
    series : Text;
    eventDate : Date;
    description : Text;
    lines : [VoucherLine];
    attachmentIds : [Nat];
    counterparty : ?Text;
  };

  public type VoucherDraft = VoucherInput and { id : Nat; updatedAt : Time; updatedBy : Principal };

  /// A voucher with its links joined in (C8).
  public type VoucherView = Voucher and { correctedBy : [Nat]; linkedAttachments : [Nat] };

  // ── Attachments (files live encrypted in the vault) ──

  public type AttachmentMeta = {
    filename : Text;
    mime : Text;
    size : Nat; // plaintext bytes
    plainSha256 : Blob;
    wrappedKey : Blob; // per-file AES key, wrapped by the `keyId` vetKey
    keyId : Text; // e.g. "docs-v1"
    receivedVia : { #upload; #email; #scan };
  };

  public type Attachment = AttachmentMeta and {
    id : Nat;
    vaultFileId : Nat;
    cipherSha256 : Blob;
    uploadedAt : Time;
    uploadedBy : Principal;
  };

  public type Ticket = { meta : AttachmentMeta; by : Principal; at : Time };

  // ── Audit (behandlingshistorik) ──

  public type AuditEntry = {
    seq : Nat;
    at : Time;
    principal : Principal;
    action : Text;
    entity : Text;
    entityId : ?Nat;
    detailHash : Blob;
    prevHash : Blob;
    hash : Blob;
  };

  // ── State bundles ──

  public type Counters = {
    var nextFiscalYear : Nat;
    var nextVoucher : Nat;
    var nextDraft : Nat;
    var nextAttachment : Nat;
    var nextTicket : Nat;
  };

  public type Chart = {
    fiscalYears : Map.Map<Nat, FiscalYear>;
    accounts : Map.Map<Nat, Account>;
    vatCodes : Map.Map<Text, VatCode>;
    series : Map.Map<Text, Series>;
  };

  public type Ledger = {
    vouchers : Map.Map<Nat, Voucher>;
    drafts : Map.Map<Nat, VoucherDraft>;
    /// "series/fiscalYearId" -> last number used.
    numbering : Map.Map<Text, Nat>;
    /// original voucher -> correction vouchers.
    correctionsOf : Map.Map<Nat, [Nat]>;
    /// Balances.key(fiscalYear, account, month index) -> net amount (C18).
    balances : Map.Map<Nat, Int>;
  };

  public type Files = {
    attachments : Map.Map<Nat, Attachment>;
    tickets : Map.Map<Nat, Ticket>;
    /// attachment -> vouchers it was linked to after posting.
    links : Map.Map<Nat, [SourceRef]>;
    /// voucher -> attachments linked after posting.
    voucherLinks : Map.Map<Nat, [Nat]>;
  };

  public type Audit = List.List<AuditEntry>;

  /// Per-principal vetKey derivations in the current UTC day (cycle-drain guard).
  public type KeyUse = Map.Map<Principal, (Nat, Nat)>; // (day number, count)

  // ── API types ──

  public type Error = {
    #notAuthorized;
    #notFound;
    #invalid : Text; // field or rule that failed
    #conflict : Text;
    #lastOwner;
    #locked : Text; // fiscal year locked or date before the lock date
    #vault : Text;
    #keys : Text;
  };

  public type Page<T> = { items : [T]; total : Nat };

  public type Me = { principal : Principal; role : ?Role };

  public type RoleView = { principal : Principal; role : Role; addedAt : Time; addedBy : Principal };

  public type BalanceRow = { account : Nat; months : [Int] }; // per month of the fiscal year
};
