// Bank accounts, CSV import (rows parsed in the browser), matching to invoices,
// supplier invoices, rules or existing vouchers, and the tax account (skattekonto).
// Every match is a posted voucher (series B) or a link to one; nothing is edited.
import Array "mo:core/Array";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import BankLib "../lib/Bank";
import Dates "../lib/Dates";
import Encode "../lib/Encode";
import Invoice "../lib/Invoice";
import Posting "../lib/Posting";
import Purchase "../lib/Purchase";
import Roles "../lib/Roles";
import SalesLib "../lib/Sales";
import B "../types/Bank";
import P "../types/Purchases";
import S "../types/Sales";
import Types "../types";

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
) {
  transient let BANK_PAGE = 500;
  transient let MAX_RULES = 500;

  func bankCtx() : Posting.Ctx = { chart; config; ledger; files; counters; audit };
  func bankToday() : Types.Date = Dates.fromTime(Time.now());

  func activeAccount(n : Nat) : Bool = switch (chart.accounts.get(n)) { case (?a) a.active; case null false };

  func nextBankId() : Nat { let i = bank.next; bank.next += 1; i };

  // ── Accounts ──

  public shared query ({ caller }) func listBankAccounts() : async Result.Result<[B.BankAccount], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(bank.accounts.values().toArray());
  };

  public shared ({ caller }) func saveBankAccount(id : ?Nat, a : B.BankAccountInput) : async Result.Result<B.BankAccount, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let name = a.name.trim(#char ' ');
    if (name == "" or name.size() > 100 or a.bank.size() > 100) return #err(#invalid("name"));
    // Bank and cash accounts are BAS class 19.
    if (a.ledgerAccount < 1900 or a.ledgerAccount > 1999 or not activeAccount(a.ledgerAccount)) return #err(#invalid("ledgerAccount"));
    switch (a.mapping) { case (?m) { if (m.delimiter.size() != 1 or m.skipRows > 50) return #err(#invalid("mapping")) }; case null {} };
    let aid = switch (id) {
      case (?i) { if (not bank.accounts.containsKey(i)) return #err(#notFound); i };
      case null { if (bank.accounts.size() >= 20) return #err(#invalid("tooMany")); nextBankId() };
    };
    let saved : B.BankAccount = { a with name; id = aid };
    bank.accounts.add(aid, saved);
    ignore Audit.append(audit, Time.now(), caller, "bank.account", "bankAccount", ?aid, #obj([("name", #text(name)), ("ledgerAccount", #int(a.ledgerAccount)), ("bank", #text(a.bank))]));
    #ok(saved);
  };

  // ── Import ──

  /// Adds rows to an account; a row already imported (same date, amount, text and
  /// reference, and the same ordinal among identical rows) is skipped.
  public shared ({ caller }) func importBankRows(accountId : Nat, rows : [B.Row]) : async Result.Result<B.ImportResult, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (not bank.accounts.containsKey(accountId)) return #err(#notFound);
    if (rows.size() == 0 or rows.size() > BankLib.MAX_ROWS) return #err(#invalid("rows"));
    for (r in rows.values()) if (not BankLib.checkRow(r)) return #err(#invalid("rows"));
    bank.batch += 1;
    let batch = bank.batch;
    let seen = Map.empty<Text, Nat>();
    var added = 0;
    var dup = 0;
    for (r in rows.values()) {
      let base = BankLib.key(accountId, r, 0);
      let ord = seen.get(base) ?? 0;
      seen.add(base, ord + 1);
      let k = BankLib.key(accountId, r, ord);
      if (bank.txKeys.containsKey(k)) { dup += 1 } else {
        let id = nextBankId();
        bank.txs.add(id, { r with id; accountId; batch; match = null });
        bank.txKeys.add(k, id);
        added += 1;
      };
    };
    ignore Audit.append(audit, Time.now(), caller, "bank.import", "bankAccount", ?accountId, #obj([("batch", #int(batch)), ("added", #int(added)), ("duplicates", #int(dup))]));
    #ok({ batch; added; duplicates = dup });
  };

  public shared query ({ caller }) func listBankTxs(accountId : ?Nat, unmatchedOnly : Bool, offset : Nat, limit : Nat) : async Result.Result<Types.Page<B.BankTx>, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let all = bank.txs.reverseEntries()
      .filter(func((_, t) : (Nat, B.BankTx)) : Bool = (accountId == null or accountId == ?t.accountId) and (not unmatchedOnly or t.match == null))
      .map(func((_, t) : (Nat, B.BankTx)) : B.BankTx = t).toArray();
    #ok({ items = all.sliceToArray(offset, offset + Nat.min(limit, BANK_PAGE)); total = all.size() });
  };

  // ── Matching ──

  func openInvoices(today : Types.Date) : [BankLib.OpenItem] =
    sales.docs.values().filterMap(func(d : S.SalesDoc) : ?BankLib.OpenItem {
      if (d.kind != #invoice) return null;
      let v = SalesLib.view(sales, d, today);
      if (v.balance <= 0) return null;
      ?{ id = d.id; title = "Faktura " # d.number.toText() # ", " # d.snapshot.buyer.name; ocr = d.snapshot.ocr; balanceSek = Invoice.toSek(v.balance, d.snapshot.fxRate); dueDate = d.snapshot.dueDate };
    }).toArray();

  func openPurchases(today : Types.Date) : [BankLib.OpenItem] =
    purchases.docs.values().filterMap(func(d : P.Purchase) : ?BankLib.OpenItem {
      if (not Purchase.payable(d.kind)) return null;
      let v = Purchase.view(purchases, d, today);
      if (v.balance <= 0) return null;
      ?{ id = d.id; title = v.supplierName # (switch (d.docNumber) { case (?n) ", " # n; case null "" }); ocr = d.paymentRef; balanceSek = Invoice.toSek(v.balance, d.fxRate); dueDate = d.dueDate };
    }).toArray();

  public shared query ({ caller }) func suggestBankMatches(txId : Nat) : async Result.Result<[B.Suggestion], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let t = bank.txs.get(txId) ?? (return #err(#notFound));
    let today = bankToday();
    #ok(BankLib.suggest(t, openInvoices(today), openPurchases(today), bank.rules.values().toArray()));
  };

  func unmatched(txId : Nat) : Result.Result<(B.BankTx, B.BankAccount), Types.Error> {
    let t = bank.txs.get(txId) ?? (return #err(#notFound));
    if (t.match != null) return #err(#conflict("matched"));
    let a = bank.accounts.get(t.accountId) ?? (return #err(#notFound));
    #ok((t, a));
  };

  func setMatch(t : B.BankTx, kind : B.Match, kindName : Text, voucherId : Nat, caller : Principal) {
    let now = Time.now();
    bank.txs.add(t.id, { t with match = ?{ kind; voucherId; at = now; by = caller } });
    bank.voucherTx.add(voucherId, t.id);
    ignore Audit.append(audit, now, caller, "bank.match", "bankTx", ?t.id, Encode.bankMatch(t.id, kindName, voucherId));
  };

  /// A deposit pays an invoice. `amount` is in the invoice currency (only needed for
  /// foreign-currency invoices; SEK invoices take the whole deposit).
  public shared ({ caller }) func matchBankToInvoice(txId : Nat, salesDocId : Nat, amount : ?Types.Money) : async Result.Result<B.BankTx, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let (t, a) = switch (unmatched(txId)) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    if (t.amount <= 0) return #err(#invalid("amount"));
    let d = sales.docs.get(salesDocId) ?? (return #err(#notFound));
    let sek = d.snapshot.currency == "SEK";
    let p : S.PaymentInput = {
      salesDocId; date = t.date; amount = if (sek) t.amount else (amount ?? (return #err(#invalid("amount"))));
      amountSek = if (sek) null else ?t.amount; interest = 0; fees = 0; method = #transfer; reference = t.reference;
    };
    let pay = switch (SalesLib.pay(bankCtx(), sales, p, a.ledgerAccount, caller, Time.now(), bankToday(), config.settings.accountingMethod == #cash)) {
      case (#ok(x)) x;
      case (#err(e)) return #err(e);
    };
    setMatch(t, #salesPayment(pay.id), "salesPayment", pay.voucherId, caller);
    #ok(bank.txs.get(txId) ?? t);
  };

  /// A withdrawal pays a supplier invoice or an expense claim.
  public shared ({ caller }) func matchBankToPurchase(txId : Nat, purchaseId : Nat, amount : ?Types.Money) : async Result.Result<B.BankTx, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let (t, a) = switch (unmatched(txId)) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    if (t.amount >= 0) return #err(#invalid("amount"));
    let d = purchases.docs.get(purchaseId) ?? (return #err(#notFound));
    let sek = d.currency == "SEK";
    let p : P.PayInput = {
      purchaseId; date = t.date; amount = if (sek) -t.amount else (amount ?? (return #err(#invalid("amount"))));
      amountSek = if (sek) null else ?(-t.amount); reference = t.reference;
    };
    let pay = switch (Purchase.pay(bankCtx(), purchases, p, a.ledgerAccount, caller, Time.now(), bankToday())) {
      case (#ok(x)) x;
      case (#err(e)) return #err(e);
    };
    setMatch(t, #supplierPayment(pay.id), "supplierPayment", pay.voucherId, caller);
    #ok(bank.txs.get(txId) ?? t);
  };

  /// Books a transaction with a rule or with counter lines that balance the bank line.
  public shared ({ caller }) func bookBankTx(txId : Nat, ruleId : ?Nat, counter : [Types.VoucherLine], description : Text) : async Result.Result<B.BankTx, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let (t, a) = switch (unmatched(txId)) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let lines = switch (ruleId) {
      case (?r) { let rule = bank.rules.get(r) ?? (return #err(#invalid("ruleId"))); BankLib.ruleLines(rule, t.amount, a.ledgerAccount) };
      case null {
        if (counter.size() == 0 or counter.size() > 20) return #err(#invalid("lines"));
        [{ account = a.ledgerAccount; amount = t.amount; vatCode = null; costCenter = null; project = null; quantity = null; text = null }].concat(counter);
      };
    };
    let text = description.trim(#char ' ');
    let vin : Types.VoucherInput = {
      series = BankLib.SERIES; eventDate = t.date; description = if (text == "") t.text else text;
      lines; attachmentIds = []; counterparty = t.counterparty;
    };
    let fy = switch (Posting.check(bankCtx(), vin)) { case (#ok(fy)) fy; case (#err(e)) return #err(e) };
    let voucher = Posting.post(bankCtx(), fy, vin, #bankTx(t.id), caller, Time.now());
    setMatch(t, #booked, "booked", voucher.id, caller);
    #ok(bank.txs.get(txId) ?? t);
  };

  /// Links a transaction to a voucher that already has the same amount on the bank account.
  public shared ({ caller }) func linkBankTx(txId : Nat, voucherId : Nat) : async Result.Result<B.BankTx, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let (t, a) = switch (unmatched(txId)) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let v = ledger.vouchers.get(voucherId) ?? (return #err(#notFound));
    if (bank.voucherTx.containsKey(voucherId)) return #err(#conflict("voucher"));
    if (v.lines.find(func(l : Types.VoucherLine) : Bool = l.account == a.ledgerAccount and l.amount == t.amount) == null) return #err(#invalid("voucherId"));
    setMatch(t, #existing, "existing", voucherId, caller);
    #ok(bank.txs.get(txId) ?? t);
  };

  // ── Rules ──

  public shared query ({ caller }) func listBankRules() : async Result.Result<[B.Rule], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(bank.rules.values().toArray());
  };

  public shared ({ caller }) func saveBankRule(id : ?Nat, r : B.RuleInput) : async Result.Result<B.Rule, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let contains = r.contains.trim(#char ' ');
    let description = r.description.trim(#char ' ');
    if (contains == "" or contains.size() > 100) return #err(#invalid("contains"));
    if (description == "" or description.size() > 200) return #err(#invalid("description"));
    if (not activeAccount(r.account)) return #err(#invalid("account"));
    if (r.vatRateBp != 0 and r.vatRateBp != 600 and r.vatRateBp != 1200 and r.vatRateBp != 2500) return #err(#invalid("vatRateBp"));
    let rid = switch (id) {
      case (?i) { if (not bank.rules.containsKey(i)) return #err(#notFound); i };
      case null { if (bank.rules.size() >= MAX_RULES) return #err(#invalid("tooMany")); nextBankId() };
    };
    let clean = { r with contains; description };
    let saved : B.Rule = { clean with id = rid };
    bank.rules.add(rid, saved);
    ignore Audit.append(audit, Time.now(), caller, "bank.rule", "bankRule", ?rid, Encode.bankRule(clean));
    #ok(saved);
  };

  /// Rules are settings, not accounting records, so they may be removed (audited).
  public shared ({ caller }) func deleteBankRule(id : Nat) : async Result.Result<(), Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (not bank.rules.containsKey(id)) return #err(#notFound);
    bank.rules.remove(id);
    ignore Audit.append(audit, Time.now(), caller, "bank.rule.delete", "bankRule", ?id, #null_);
    #ok(());
  };

  // ── Tax account ──

  public shared ({ caller }) func importTaxRows(rows : [B.TaxRow]) : async Result.Result<B.ImportResult, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (rows.size() == 0 or rows.size() > BankLib.MAX_ROWS) return #err(#invalid("rows"));
    for (r in rows.values()) if (not Dates.isValid(r.date) or r.amount == 0 or r.text.size() > 300) return #err(#invalid("rows"));
    bank.batch += 1;
    let batch = bank.batch;
    let seen = Map.empty<Text, Nat>();
    var added = 0;
    var dup = 0;
    for (r in rows.values()) {
      let base = BankLib.taxKey(r, 0);
      let ord = seen.get(base) ?? 0;
      seen.add(base, ord + 1);
      let k = BankLib.taxKey(r, ord);
      if (bank.taxKeys.containsKey(k)) { dup += 1 } else {
        let id = nextBankId();
        bank.tax.add(id, { r with id; batch; voucherId = null });
        bank.taxKeys.add(k, id);
        added += 1;
      };
    };
    ignore Audit.append(audit, Time.now(), caller, "tax.import", "taxAccount", null, #obj([("batch", #int(batch)), ("added", #int(added)), ("duplicates", #int(dup))]));
    #ok({ batch; added; duplicates = dup });
  };

  public shared query ({ caller }) func listTaxEntries(offset : Nat, limit : Nat) : async Result.Result<Types.Page<B.TaxEntry>, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let all = bank.tax.reverseEntries().map(func((_, e) : (Nat, B.TaxEntry)) : B.TaxEntry = e).toArray();
    #ok({ items = all.sliceToArray(offset, offset + Nat.min(limit, BANK_PAGE)); total = all.size() });
  };

  func unbookedTax(id : Nat) : Result.Result<B.TaxEntry, Types.Error> {
    let e = bank.tax.get(id) ?? (return #err(#notFound));
    if (e.voucherId != null) return #err(#conflict("booked"));
    #ok(e);
  };

  /// Corrects the kind of an entry that is not booked yet.
  public shared ({ caller }) func setTaxKind(id : Nat, kind : B.TaxKind) : async Result.Result<B.TaxEntry, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let e = switch (unbookedTax(id)) { case (#ok(x)) x; case (#err(err)) return #err(err) };
    let saved = { e with kind };
    bank.tax.add(id, saved);
    #ok(saved);
  };

  /// Books an entry against 1630. `account` is required for #other and ignored otherwise.
  public shared ({ caller }) func bookTaxEntry(id : Nat, account : ?Nat) : async Result.Result<B.TaxEntry, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let e = switch (unbookedTax(id)) { case (#ok(x)) x; case (#err(err)) return #err(err) };
    let counter = switch (BankLib.taxCounter(e.kind), e.kind, account) {
      case (?c, _, _) c;
      case (null, #other, ?a) { if (not activeAccount(a) or a == BankLib.TAX_ACCOUNT) return #err(#invalid("account")); a };
      case (null, #other, null) { return #err(#invalid("account")) };
      case (null, _, _) { return #err(#invalid("kind")) }; // payments are linked to the bank voucher
    };
    let vin : Types.VoucherInput = {
      series = BankLib.SERIES; eventDate = e.date; description = "Skattekonto: " # BankLib.kindText(e.kind) # " – " # e.text;
      lines = BankLib.taxLines(e.amount, counter); attachmentIds = []; counterparty = ?"Skatteverket";
    };
    let fy = switch (Posting.check(bankCtx(), vin)) { case (#ok(fy)) fy; case (#err(err)) return #err(err) };
    let voucher = Posting.post(bankCtx(), fy, vin, #taxAccount(id), caller, Time.now());
    let saved = { e with voucherId = ?voucher.id };
    bank.tax.add(id, saved);
    #ok(saved);
  };

  /// Links a payment or refund to the voucher that has the same amount on 1630.
  public shared ({ caller }) func linkTaxEntry(id : Nat, voucherId : Nat) : async Result.Result<B.TaxEntry, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let e = switch (unbookedTax(id)) { case (#ok(x)) x; case (#err(err)) return #err(err) };
    let v = ledger.vouchers.get(voucherId) ?? (return #err(#notFound));
    if (v.lines.find(func(l : Types.VoucherLine) : Bool = l.account == BankLib.TAX_ACCOUNT and l.amount == e.amount) == null) return #err(#invalid("voucherId"));
    for (x in bank.tax.values()) if (x.voucherId == ?voucherId) return #err(#conflict("voucher"));
    let saved = { e with voucherId = ?voucherId };
    bank.tax.add(id, saved);
    ignore Audit.append(audit, Time.now(), caller, "tax.link", "taxAccount", ?id, #obj([("voucherId", #int(voucherId))]));
    #ok(saved);
  };

  /// Imported balance against the 1630 ledger balance (all fiscal years).
  public shared query ({ caller }) func taxAccountSummary() : async Result.Result<B.TaxSummary, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    var balance : Int = 0;
    var unbooked = 0;
    var lastDate : ?Types.Date = null;
    for (e in bank.tax.values()) {
      balance += e.amount;
      if (e.voucherId == null) unbooked += 1;
      switch (lastDate) { case (?d) { if (e.date > d) lastDate := ?e.date }; case null { lastDate := ?e.date } };
    };
    var led : Int = 0;
    for ((k, v) in ledger.balances.entries()) if ((k / 100) % 10_000 == BankLib.TAX_ACCOUNT) led += v;
    #ok({ balance; ledger = led; unbooked; lastDate });
  };
};
