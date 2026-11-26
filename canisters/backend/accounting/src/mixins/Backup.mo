// Full backup and restore (A9c, spec §10). Owner only. The browser pages through every
// store, adds the decrypted vault files and SIE4, and encrypts the ZIP with a passphrase.
// A restore runs only on an empty canister: restoreBegin clears the stores, restorePut
// writes the records back verbatim, restoreAttachment re-links a re-uploaded file,
// restoreRekey maps old ciphertext to re-encrypted ciphertext, and restoreCommit checks
// the audit chain and makes the canister usable again.
import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Error "mo:core/Error";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import Roles "../lib/Roles";
import Vault "../lib/Vault";
import Types "../types";
import As "../types/Assets";
import B "../types/Bank";
import Bk "../types/Backup";
import P "../types/Purchases";
import Pr "../types/Payroll";
import R "../types/RotRut";
import S "../types/Sales";
import V "../types/Vat";
import YT "../types/YearEnd";

mixin (
  roles : Types.Roles,
  config : Types.Config,
  chart : Types.Chart,
  ledger : Types.Ledger,
  files : Types.Files,
  counters : Types.Counters,
  audit : Types.Audit,
  sales : S.Sales,
  purchases : P.Purchases,
  bank : B.Bank,
  vat : V.Vat,
  payroll : Pr.Payroll,
  rotRut : R.RotRut,
  assets : As.Assets,
  yearEnd : YT.YearEnd,
  restore : Bk.Restore,
) {
  transient let restoreVaultTimeoutSecs : Nat32 = 60;

  func bkNatNats(store : Text) : ?Map.Map<Nat, [Nat]> = switch (store) {
    case ("ledger.correctionsOf") ?ledger.correctionsOf;
    case ("files.voucherLinks") ?files.voucherLinks;
    case ("sales.creditsOf") ?sales.creditsOf;
    case ("sales.invoicesOf") ?sales.invoicesOf;
    case ("sales.paymentsOf") ?sales.paymentsOf;
    case ("sales.remindersOf") ?sales.remindersOf;
    case ("purchases.paymentsOf") ?purchases.paymentsOf;
    case ("purchases.creditsOf") ?purchases.creditsOf;
    case ("rotRut.casesOf") ?rotRut.casesOf;
    case _ null;
  };

  func bkTextNats(store : Text) : ?Map.Map<Text, Nat> = switch (store) {
    case ("ledger.numbering") ?ledger.numbering;
    case ("sales.numbering") ?sales.numbering;
    case ("bank.txKeys") ?bank.txKeys;
    case ("bank.taxKeys") ?bank.taxKeys;
    case ("vat.returnOf") ?vat.returnOf;
    case ("vat.eslOf") ?vat.eslOf;
    case ("payroll.agiOf") ?payroll.agiOf;
    case ("assets.runOf") ?assets.runOf;
    case _ null;
  };

  func bkNatInts(store : Text) : ?Map.Map<Nat, Int> = switch (store) {
    case ("ledger.balances") ?ledger.balances;
    case ("sales.husAdjust") ?sales.husAdjust;
    case _ null;
  };

  func bkNatNat(store : Text) : ?Map.Map<Nat, Nat> = switch (store) {
    case ("purchases.used") ?purchases.used;
    case ("bank.voucherTx") ?bank.voucherTx;
    case _ null;
  };

  transient let NAT_NATS = ["ledger.correctionsOf", "files.voucherLinks", "sales.creditsOf", "sales.invoicesOf", "sales.paymentsOf", "sales.remindersOf", "purchases.paymentsOf", "purchases.creditsOf", "rotRut.casesOf"];
  transient let TEXT_NATS = ["ledger.numbering", "sales.numbering", "bank.txKeys", "bank.taxKeys", "vat.returnOf", "vat.eslOf", "payroll.agiOf", "assets.runOf"];
  transient let NAT_INTS = ["ledger.balances", "sales.husAdjust"];
  transient let NAT_NAT = ["purchases.used", "bank.voucherTx"];

  func backupSizeOf<K, V>(m : ?Map.Map<K, V>) : Nat = switch (m) { case (?x) x.size(); case null 0 };

  /// Store name -> number of records, in restore order (the audit log last).
  func backupSizes() : [Bk.Summary] {
    let typed : [(Text, Nat)] = [
      ("roles", roles.size()), ("fiscalYears", chart.fiscalYears.size()), ("accounts", chart.accounts.size()),
      ("vatCodes", chart.vatCodes.size()), ("series", chart.series.size()), ("vouchers", ledger.vouchers.size()),
      ("voucherDrafts", ledger.drafts.size()), ("attachmentLinks", files.links.size()), ("attachments", files.attachments.size()),
      ("customers", sales.customers.size()), ("items", sales.items.size()), ("salesDrafts", sales.drafts.size()),
      ("salesDocs", sales.docs.size()), ("quoteStatus", sales.quoteStatus.size()), ("payments", sales.payments.size()),
      ("reminders", sales.reminders.size()), ("suppliers", purchases.suppliers.size()), ("purchases", purchases.docs.size()),
      ("supplierPayments", purchases.payments.size()), ("bankAccounts", bank.accounts.size()), ("bankTxs", bank.txs.size()),
      ("bankRules", bank.rules.size()), ("taxEntries", bank.tax.size()), ("vatReturns", vat.returns.size()),
      ("ecSalesLists", vat.esl.size()), ("vatChecks", vat.checks.size()), ("employees", payroll.employees.size()),
      ("payItems", payroll.items.size()), ("taxTables", payroll.tables.size()), ("payRuns", payroll.runs.size()),
      ("agiReturns", payroll.agi.size()), ("vaxa", payroll.vaxa.size()), ("husCases", rotRut.cases.size()),
      ("claims", rotRut.claims.size()), ("assets", assets.assets.size()), ("depRuns", assets.runs.size()),
      ("stockItems", assets.stockItems.size()), ("stockMoves", assets.moves.size()), ("counts", assets.counts.size()),
      ("opening", yearEnd.opening.size()), ("closings", yearEnd.closings.size()),
    ];
    let out = List.fromArray<Bk.Summary>(typed.map(func((store, count)) = { store; count }));
    for (s in NAT_NATS.values()) out.add({ store = "natNats:" # s; count = backupSizeOf(bkNatNats(s)) });
    for (s in TEXT_NATS.values()) out.add({ store = "textNat:" # s; count = backupSizeOf(bkTextNats(s)) });
    for (s in NAT_INTS.values()) out.add({ store = "natInt:" # s; count = backupSizeOf(bkNatInts(s)) });
    for (s in NAT_NAT.values()) out.add({ store = "natNat:" # s; count = backupSizeOf(bkNatNat(s)) });
    out.add({ store = "audit"; count = audit.size() });
    out.toArray();
  };

  func backupPageOf<K, V>(m : Map.Map<K, V>, offset : Nat, limit : Nat) : [(K, V)] = m.entries().drop(offset).take(limit).toArray();

  public shared query ({ caller }) func backupSections() : async Result.Result<[Bk.Summary], Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    #ok(backupSizes());
  };

  public shared query ({ caller }) func backupSingletons() : async Result.Result<Bk.Singletons, Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    #ok({
      company = config.company; settings = config.settings; lockDate = config.lockDate; seedVersion = config.seedVersion;
      nextFiscalYear = counters.nextFiscalYear; nextVoucher = counters.nextVoucher; nextDraft = counters.nextDraft;
      nextAttachment = counters.nextAttachment; nextTicket = counters.nextTicket;
      salesParams = sales.params; salesNext = sales.next; purchasesNext = purchases.next;
      bankNext = bank.next; bankBatch = bank.batch; vatNext = vat.next;
      payrollParams = payroll.params; payrollNext = payroll.next;
      husParams = rotRut.params; rotRutNext = rotRut.next; assetsNext = assets.next;
    });
  };

  public shared query ({ caller }) func backupPage(store : Text, offset : Nat, limit : Nat) : async Result.Result<Bk.Chunk, Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    let n = Nat.min(limit, 500);
    let parts = store.split(#char ':').toArray();
    if (parts.size() == 2) {
      let s = parts[1];
      return switch (parts[0], bkNatNats(s), bkTextNats(s), bkNatInts(s), bkNatNat(s)) {
        case ("natNats", ?m, _, _, _) #ok(#natNats({ store = s; entries = backupPageOf(m, offset, n) }));
        case ("textNat", _, ?m, _, _) #ok(#textNat({ store = s; entries = backupPageOf(m, offset, n) }));
        case ("natInt", _, _, ?m, _) #ok(#natInt({ store = s; entries = backupPageOf(m, offset, n) }));
        case ("natNat", _, _, _, ?m) #ok(#natNat({ store = s; entries = backupPageOf(m, offset, n) }));
        case _ #err(#invalid("store"));
      };
    };
    #ok(switch (store) {
      case "roles" #roles(backupPageOf(roles, offset, n));
      case "fiscalYears" #fiscalYears(backupPageOf(chart.fiscalYears, offset, n));
      case "accounts" #accounts(backupPageOf(chart.accounts, offset, n));
      case "vatCodes" #vatCodes(backupPageOf(chart.vatCodes, offset, n));
      case "series" #series(backupPageOf(chart.series, offset, n));
      case "vouchers" #vouchers(backupPageOf(ledger.vouchers, offset, n));
      case "voucherDrafts" #voucherDrafts(backupPageOf(ledger.drafts, offset, n));
      case "attachmentLinks" #attachmentLinks(backupPageOf(files.links, offset, n));
      case "attachments" #attachments(files.attachments.values().drop(offset).take(n).toArray());
      // Oldest first (auditLog pages newest first): a restore appends in sequence order.
      case "audit" #audit(if (offset >= audit.size()) [] else audit.sliceToArray(offset, Nat.min(offset + n, audit.size())));
      case "customers" #customers(backupPageOf(sales.customers, offset, n));
      case "items" #items(backupPageOf(sales.items, offset, n));
      case "salesDrafts" #salesDrafts(backupPageOf(sales.drafts, offset, n));
      case "salesDocs" #salesDocs(backupPageOf(sales.docs, offset, n));
      case "quoteStatus" #quoteStatus(backupPageOf(sales.quoteStatus, offset, n));
      case "payments" #payments(backupPageOf(sales.payments, offset, n));
      case "reminders" #reminders(backupPageOf(sales.reminders, offset, n));
      case "suppliers" #suppliers(backupPageOf(purchases.suppliers, offset, n));
      case "purchases" #purchases(backupPageOf(purchases.docs, offset, n));
      case "supplierPayments" #supplierPayments(backupPageOf(purchases.payments, offset, n));
      case "bankAccounts" #bankAccounts(backupPageOf(bank.accounts, offset, n));
      case "bankTxs" #bankTxs(backupPageOf(bank.txs, offset, n));
      case "bankRules" #bankRules(backupPageOf(bank.rules, offset, n));
      case "taxEntries" #taxEntries(backupPageOf(bank.tax, offset, n));
      case "vatReturns" #vatReturns(backupPageOf(vat.returns, offset, n));
      case "ecSalesLists" #ecSalesLists(backupPageOf(vat.esl, offset, n));
      case "vatChecks" #vatChecks(backupPageOf(vat.checks, offset, n));
      case "employees" #employees(backupPageOf(payroll.employees, offset, n));
      case "payItems" #payItems(backupPageOf(payroll.items, offset, n));
      case "taxTables" #taxTables(backupPageOf(payroll.tables, offset, n));
      case "payRuns" #payRuns(backupPageOf(payroll.runs, offset, n));
      case "agiReturns" #agiReturns(backupPageOf(payroll.agi, offset, n));
      case "vaxa" #vaxa(backupPageOf(payroll.vaxa, offset, n));
      case "husCases" #husCases(backupPageOf(rotRut.cases, offset, n));
      case "claims" #claims(backupPageOf(rotRut.claims, offset, n));
      case "assets" #assets(backupPageOf(assets.assets, offset, n));
      case "depRuns" #depRuns(backupPageOf(assets.runs, offset, n));
      case "stockItems" #stockItems(backupPageOf(assets.stockItems, offset, n));
      case "stockMoves" #stockMoves(backupPageOf(assets.moves, offset, n));
      case "counts" #counts(backupPageOf(assets.counts, offset, n));
      case "opening" #opening(backupPageOf(yearEnd.opening, offset, n));
      case "closings" #closings(backupPageOf(yearEnd.closings, offset, n));
      case _ return #err(#invalid("store"));
    });
  };

  /// Logged in the behandlingshistorik when a backup is taken (the export itself is queries).
  public shared ({ caller }) func backupTaken(manifestSha256 : Blob) : async Result.Result<(), Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    if (manifestSha256.size() != 32) return #err(#invalid("manifestSha256"));
    ignore Audit.append(audit, Time.now(), caller, "backup.export", "backup", null, #obj([("manifestSha256", #blob(manifestSha256))]));
    #ok(());
  };

  // ── Restore ──

  /// True while nothing has been booked or registered (a fresh install with its seed).
  func restoreEmpty() : Bool {
    chart.fiscalYears.isEmpty() and ledger.vouchers.isEmpty() and files.attachments.isEmpty()
    and sales.docs.isEmpty() and sales.customers.isEmpty() and purchases.docs.isEmpty()
    and payroll.employees.isEmpty() and bank.txs.isEmpty() and assets.assets.isEmpty();
  };

  func isRestoring(caller : Principal) : Bool = restore.by == ?caller;

  public shared query ({ caller }) func restoreState() : async Result.Result<{ empty : Bool; restoring : Bool }, Types.Error> {
    if (not Roles.isOwner(roles, caller) and not isRestoring(caller)) return #err(#notAuthorized);
    #ok({ empty = restoreEmpty(); restoring = restore.by != null });
  };

  /// Clears every store. Allowed on an empty canister, or again by the owner whose
  /// restore did not finish.
  public shared ({ caller }) func restoreBegin(s : Bk.Singletons) : async Result.Result<(), Types.Error> {
    switch (restore.by) {
      case (?p) { if (p != caller) return #err(#conflict("restoring")) };
      case null {
        if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
        if (not restoreEmpty()) return #err(#conflict("notEmpty"));
      };
    };
    restore.by := ?caller;
    roles.clear();
    chart.fiscalYears.clear(); chart.accounts.clear(); chart.vatCodes.clear(); chart.series.clear();
    ledger.vouchers.clear(); ledger.drafts.clear(); ledger.numbering.clear(); ledger.correctionsOf.clear(); ledger.balances.clear();
    files.attachments.clear(); files.tickets.clear(); files.links.clear(); files.voucherLinks.clear();
    audit.clear();
    sales.customers.clear(); sales.items.clear(); sales.drafts.clear(); sales.docs.clear(); sales.creditsOf.clear();
    sales.quoteStatus.clear(); sales.invoicesOf.clear(); sales.payments.clear(); sales.paymentsOf.clear();
    sales.reminders.clear(); sales.remindersOf.clear(); sales.numbering.clear(); sales.husAdjust.clear();
    purchases.suppliers.clear(); purchases.docs.clear(); purchases.payments.clear(); purchases.paymentsOf.clear();
    purchases.creditsOf.clear(); purchases.used.clear();
    bank.accounts.clear(); bank.txs.clear(); bank.txKeys.clear(); bank.voucherTx.clear(); bank.rules.clear();
    bank.tax.clear(); bank.taxKeys.clear();
    vat.returns.clear(); vat.returnOf.clear(); vat.esl.clear(); vat.eslOf.clear(); vat.checks.clear();
    payroll.employees.clear(); payroll.items.clear(); payroll.tables.clear(); payroll.runs.clear();
    payroll.agi.clear(); payroll.agiOf.clear(); payroll.vaxa.clear();
    rotRut.cases.clear(); rotRut.casesOf.clear(); rotRut.claims.clear();
    assets.assets.clear(); assets.runOf.clear(); assets.runs.clear(); assets.stockItems.clear();
    assets.moves.clear(); assets.counts.clear();
    yearEnd.opening.clear(); yearEnd.closings.clear();
    restore.rekey.clear();
    // The vetKD key name stays this canister's own: the old one belongs to another canister.
    config.company := s.company; config.settings := s.settings; config.lockDate := s.lockDate; config.seedVersion := s.seedVersion;
    counters.nextFiscalYear := s.nextFiscalYear; counters.nextVoucher := s.nextVoucher; counters.nextDraft := s.nextDraft;
    counters.nextAttachment := s.nextAttachment; counters.nextTicket := s.nextTicket;
    sales.params := s.salesParams; sales.next := s.salesNext; purchases.next := s.purchasesNext;
    bank.next := s.bankNext; bank.batch := s.bankBatch; vat.next := s.vatNext;
    payroll.params := s.payrollParams; payroll.next := s.payrollNext;
    rotRut.params := s.husParams; rotRut.next := s.rotRutNext; assets.next := s.assetsNext;
    #ok(());
  };

  public shared ({ caller }) func restorePut(c : Bk.Chunk) : async Result.Result<(), Types.Error> {
    if (not isRestoring(caller)) return #err(#notAuthorized);
    switch (c) {
      case (#roles(e)) for ((k, v) in e.values()) roles.add(k, v);
      case (#fiscalYears(e)) for ((k, v) in e.values()) chart.fiscalYears.add(k, v);
      case (#accounts(e)) for ((k, v) in e.values()) chart.accounts.add(k, v);
      case (#vatCodes(e)) for ((k, v) in e.values()) chart.vatCodes.add(k, v);
      case (#series(e)) for ((k, v) in e.values()) chart.series.add(k, v);
      case (#vouchers(e)) for ((k, v) in e.values()) ledger.vouchers.add(k, v);
      case (#voucherDrafts(e)) for ((k, v) in e.values()) ledger.drafts.add(k, v);
      case (#attachmentLinks(e)) for ((k, v) in e.values()) files.links.add(k, v);
      case (#attachments(_)) return #err(#invalid("attachments")); // restoreAttachment checks the vault
      case (#audit(e)) {
        // In order and unchanged, so the chain still verifies.
        for (a in e.values()) {
          if (a.seq != audit.size()) return #err(#invalid("audit.seq"));
          audit.add(a);
        };
      };
      case (#customers(e)) for ((k, v) in e.values()) sales.customers.add(k, v);
      case (#items(e)) for ((k, v) in e.values()) sales.items.add(k, v);
      case (#salesDrafts(e)) for ((k, v) in e.values()) sales.drafts.add(k, v);
      case (#salesDocs(e)) for ((k, v) in e.values()) sales.docs.add(k, v);
      case (#quoteStatus(e)) for ((k, v) in e.values()) sales.quoteStatus.add(k, v);
      case (#payments(e)) for ((k, v) in e.values()) sales.payments.add(k, v);
      case (#reminders(e)) for ((k, v) in e.values()) sales.reminders.add(k, v);
      case (#suppliers(e)) for ((k, v) in e.values()) purchases.suppliers.add(k, v);
      case (#purchases(e)) for ((k, v) in e.values()) purchases.docs.add(k, v);
      case (#supplierPayments(e)) for ((k, v) in e.values()) purchases.payments.add(k, v);
      case (#bankAccounts(e)) for ((k, v) in e.values()) bank.accounts.add(k, v);
      case (#bankTxs(e)) for ((k, v) in e.values()) bank.txs.add(k, v);
      case (#bankRules(e)) for ((k, v) in e.values()) bank.rules.add(k, v);
      case (#taxEntries(e)) for ((k, v) in e.values()) bank.tax.add(k, v);
      case (#vatReturns(e)) for ((k, v) in e.values()) vat.returns.add(k, v);
      case (#ecSalesLists(e)) for ((k, v) in e.values()) vat.esl.add(k, v);
      case (#vatChecks(e)) for ((k, v) in e.values()) vat.checks.add(k, v);
      case (#employees(e)) for ((k, v) in e.values()) payroll.employees.add(k, v);
      case (#payItems(e)) for ((k, v) in e.values()) payroll.items.add(k, v);
      case (#taxTables(e)) for ((k, v) in e.values()) payroll.tables.add(k, v);
      case (#payRuns(e)) for ((k, v) in e.values()) payroll.runs.add(k, v);
      case (#agiReturns(e)) for ((k, v) in e.values()) payroll.agi.add(k, v);
      case (#vaxa(e)) for ((k, v) in e.values()) payroll.vaxa.add(k, v);
      case (#husCases(e)) for ((k, v) in e.values()) rotRut.cases.add(k, v);
      case (#claims(e)) for ((k, v) in e.values()) rotRut.claims.add(k, v);
      case (#assets(e)) for ((k, v) in e.values()) assets.assets.add(k, v);
      case (#depRuns(e)) for ((k, v) in e.values()) assets.runs.add(k, v);
      case (#stockItems(e)) for ((k, v) in e.values()) assets.stockItems.add(k, v);
      case (#stockMoves(e)) for ((k, v) in e.values()) assets.moves.add(k, v);
      case (#counts(e)) for ((k, v) in e.values()) assets.counts.add(k, v);
      case (#opening(e)) for ((k, v) in e.values()) yearEnd.opening.add(k, v);
      case (#closings(e)) for ((k, v) in e.values()) yearEnd.closings.add(k, v);
      case (#natNats(x)) { let m = bkNatNats(x.store) ?? (return #err(#invalid("store"))); for ((k, v) in x.entries.values()) m.add(k, v) };
      case (#textNat(x)) { let m = bkTextNats(x.store) ?? (return #err(#invalid("store"))); for ((k, v) in x.entries.values()) m.add(k, v) };
      case (#natInt(x)) { let m = bkNatInts(x.store) ?? (return #err(#invalid("store"))); for ((k, v) in x.entries.values()) m.add(k, v) };
      case (#natNat(x)) { let m = bkNatNat(x.store) ?? (return #err(#invalid("store"))); for ((k, v) in x.entries.values()) m.add(k, v) };
    };
    #ok(());
  };

  /// The backed-up attachment with its file re-encrypted, uploaded to this vault and its
  /// key wrapped by this canister's docs-v1 key. Id, name and plaintext hash are kept.
  public shared ({ caller }) func restoreAttachment(a : Types.Attachment, vaultFileId : Nat, wrappedKey : Blob) : async Result.Result<(), Types.Error> {
    if (not isRestoring(caller)) return #err(#notAuthorized);
    if (wrappedKey.size() == 0 or wrappedKey.size() > 512) return #err(#invalid("wrappedKey"));
    if (files.attachments.containsKey(a.id)) return #err(#conflict("attachment"));
    if (files.attachments.values().any(func(x : Types.Attachment) : Bool = x.vaultFileId == vaultFileId)) return #err(#conflict("file already linked"));
    let v = Vault.canister<system>() ?? (return #err(#vault("vault canister id not set")));
    let info = try { await (with timeout = restoreVaultTimeoutSecs) v.fileInfo(vaultFileId) } catch e { return #err(#vault(e.message())) };
    let f = info ?? (return #err(#vault("file not found")));
    if (f.uploadedBy != caller or f.mime != a.mime or f.size < a.size) return #err(#vault("file does not match the upload"));
    if (files.attachments.containsKey(a.id)) return #err(#conflict("attachment"));
    files.attachments.add(a.id, { a with vaultFileId; wrappedKey; cipherSha256 = f.cipherSha256 });
    #ok(());
  };

  public shared ({ caller }) func restoreRekey(pairs : [(Blob, Blob)]) : async Result.Result<(), Types.Error> {
    if (not isRestoring(caller)) return #err(#notAuthorized);
    for ((old, now) in pairs.values()) {
      if (old.size() > 4_096 or now.size() > 4_096) return #err(#invalid("rekey"));
      restore.rekey.add(old, now);
    };
    #ok(());
  };

  /// Checks the restored audit chain, keeps the restoring owner as owner and logs the restore.
  public shared ({ caller }) func restoreCommit(manifestSha256 : Blob) : async Result.Result<[Bk.Summary], Types.Error> {
    if (not isRestoring(caller)) return #err(#notAuthorized);
    if (manifestSha256.size() != 32) return #err(#invalid("manifestSha256"));
    switch (Audit.verify(audit, 0, audit.size())) { case (?i) { return #err(#invalid("audit." # i.toText())) }; case null {} };
    let now = Time.now();
    if (not Roles.isOwner(roles, caller)) roles.add(caller, { role = #owner; addedAt = now; addedBy = caller });
    restore.by := null;
    ignore Audit.append(audit, now, caller, "backup.restore", "backup", null, #obj([("manifestSha256", #blob(manifestSha256))]));
    #ok(backupSizes());
  };

  /// Re-encrypted personal data after a restore (old ciphertext -> new), for decryption.
  public shared query ({ caller }) func piiRekeys(offset : Nat, limit : Nat) : async Result.Result<Types.Page<(Blob, Blob)>, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok({ items = backupPageOf(restore.rekey, offset, Nat.min(limit, 500)); total = restore.rekey.size() });
  };
};
