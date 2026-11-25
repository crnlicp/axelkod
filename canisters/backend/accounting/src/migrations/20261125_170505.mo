// Initial state. Pending (never deployed to mainnet), so later phases may extend
// it in place. Self-contained: types are copied, not imported. Seed data is
// applied by main.mo (add-only), not here.
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Text "mo:core/Text";

module {
  type Role = { #owner; #bookkeeper; #payroll; #auditor };
  type RoleAssignment = { role : Role; addedAt : Int; addedBy : Principal };
  type CompanyProfile = {
    legalName : Text; orgNr : Text; vatNr : Text; registeredOffice : Text; street : Text;
    postalCode : Text; city : Text; country : Text; email : Text; phone : ?Text; web : ?Text;
    bankgiro : ?Text; plusgiro : ?Text; iban : ?Text; bic : ?Text; fSkatt : Bool; peppolId : ?Text;
  };
  type AccountingSettings = {
    accountingMethod : { #invoice; #cash };
    vatPeriod : { #month; #quarter; #year };
    invoiceTermsDays : Nat;
    defaultLanguage : { #sv; #en };
    storageNotice : ?{ date : Text; location : Text };
    modules : { payroll : Bool; rotRut : Bool; inventory : Bool };
  };
  type Config = { var company : ?CompanyProfile; var settings : AccountingSettings; var lockDate : ?Text; var seedVersion : Text; var vetkdKey : ?Text };
  type FiscalYear = { id : Nat; start : Text; end : Text; status : { #open; #closing; #locked }; lockedAt : ?Int };
  type Account = {
    number : Nat; name : Text; kind : { #asset; #liability; #equity; #revenue; #expense };
    vatCode : ?Text; sruCode : ?Text; active : Bool; bas : Bool;
  };
  type VatKind = {
    #outputDomestic; #inputDomestic; #reverseChargePurchase; #euGoodsSale; #euServiceSale;
    #exportGoods; #exportServices; #exempt; #buyerLiableSE; #importVat;
  };
  type VatCode = { code : Text; name : Text; rateBp : Nat; kind : VatKind; account : ?Nat; boxBase : ?Nat; boxVat : ?Nat; active : Bool };
  type Series = { code : Text; name : Text };
  type VoucherLine = { account : Nat; amount : Int; vatCode : ?Text; costCenter : ?Text; project : ?Text; quantity : ?Int; text : ?Text };
  type SourceRef = {
    #manual; #salesInvoice : Nat; #creditNote : Nat; #purchase : Nat; #payment : Nat; #bankTx : Nat;
    #taxAccount : Nat; #payRun : Nat; #vatReturn : Nat; #rotRut : Nat; #asset : Nat; #inventory : Nat; #yearEnd : Nat;
  };
  type Voucher = {
    id : Nat; fiscalYearId : Nat; series : Text; number : Nat; eventDate : Text; registeredAt : Int;
    description : Text; lines : [VoucherLine]; source : SourceRef; attachmentIds : [Nat];
    counterparty : ?Text; corrects : ?Nat; createdBy : Principal; retainUntil : Text;
  };
  type VoucherDraft = {
    id : Nat; updatedAt : Int; updatedBy : Principal; series : Text; eventDate : Text; description : Text;
    lines : [VoucherLine]; attachmentIds : [Nat]; counterparty : ?Text;
  };
  type AttachmentMeta = {
    filename : Text; mime : Text; size : Nat; plainSha256 : Blob; wrappedKey : Blob; keyId : Text;
    receivedVia : { #upload; #email; #scan };
  };
  type Attachment = {
    filename : Text; mime : Text; size : Nat; plainSha256 : Blob; wrappedKey : Blob; keyId : Text;
    receivedVia : { #upload; #email; #scan };
    id : Nat; vaultFileId : Nat; cipherSha256 : Blob; uploadedAt : Int; uploadedBy : Principal;
  };
  type AuditEntry = {
    seq : Nat; at : Int; principal : Principal; action : Text; entity : Text; entityId : ?Nat;
    detailHash : Blob; prevHash : Blob; hash : Blob;
  };

  type OldActor = {};
  type NewActor = {
    roles : Map.Map<Principal, RoleAssignment>;
    config : Config;
    chart : {
      fiscalYears : Map.Map<Nat, FiscalYear>;
      accounts : Map.Map<Nat, Account>;
      vatCodes : Map.Map<Text, VatCode>;
      series : Map.Map<Text, Series>;
    };
    ledger : {
      vouchers : Map.Map<Nat, Voucher>;
      drafts : Map.Map<Nat, VoucherDraft>;
      numbering : Map.Map<Text, Nat>;
      correctionsOf : Map.Map<Nat, [Nat]>;
      balances : Map.Map<Nat, Int>;
    };
    files : {
      attachments : Map.Map<Nat, Attachment>;
      tickets : Map.Map<Nat, { meta : AttachmentMeta; by : Principal; at : Int }>;
      links : Map.Map<Nat, [SourceRef]>;
      voucherLinks : Map.Map<Nat, [Nat]>;
    };
    counters : { var nextFiscalYear : Nat; var nextVoucher : Nat; var nextDraft : Nat; var nextAttachment : Nat; var nextTicket : Nat };
    audit : List.List<AuditEntry>;
    keyUse : Map.Map<Principal, (Nat, Nat)>;
  };

  public func migration(_ : OldActor) : NewActor {
    {
      roles = Map.empty();
      config = {
        var company = null;
        var settings = {
          accountingMethod = #invoice;
          vatPeriod = #quarter;
          invoiceTermsDays = 30;
          defaultLanguage = #sv;
          storageNotice = null;
          // Off until switched on in settings (D7).
          modules = { payroll = false; rotRut = false; inventory = false };
        };
        var lockDate = null;
        var seedVersion = "";
        var vetkdKey = null;
      };
      chart = { fiscalYears = Map.empty(); accounts = Map.empty(); vatCodes = Map.empty(); series = Map.empty() };
      ledger = { vouchers = Map.empty(); drafts = Map.empty(); numbering = Map.empty(); correctionsOf = Map.empty(); balances = Map.empty() };
      files = { attachments = Map.empty(); tickets = Map.empty(); links = Map.empty(); voucherLinks = Map.empty() };
      counters = { var nextFiscalYear = 1; var nextVoucher = 1; var nextDraft = 1; var nextAttachment = 1; var nextTicket = 1 };
      audit = List.empty();
      keyUse = Map.empty();
    };
  };
};
