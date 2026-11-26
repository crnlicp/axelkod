// Suppliers, the inbox of received files, booking of supplier invoices, credit notes,
// receipts and expense claims (series L), and supplier payments (series B).
// Booked documents are never changed; corrections go through the voucher's correction.
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Set "mo:core/Set";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import Chart "../lib/Chart";
import Dates "../lib/Dates";
import Encode "../lib/Encode";
import Invoice "../lib/Invoice";
import Posting "../lib/Posting";
import Purchase "../lib/Purchase";
import Roles "../lib/Roles";
import P "../types/Purchases";
import Types "../types";

mixin (
  roles : Types.Roles,
  config : Types.Config,
  chart : Types.Chart,
  ledger : Types.Ledger,
  files : Types.Files,
  counters : Types.Counters,
  audit : Types.Audit,
  purchases : P.Purchases,
) {
  transient let PURCHASE_PAGE = 200;
  transient let MAX_SUPPLIERS = 50_000;

  func purchaseCtx() : Posting.Ctx = { chart; config; ledger; files; counters; audit };
  func purchaseToday() : Types.Date = Dates.fromTime(Time.now());

  func purchaseRetain(date : Types.Date) : Types.Date = switch (Chart.yearOf(chart, date)) {
    case (?fy) { Dates.retainUntil(fy.end) };
    case null { Dates.retainUntil(Text.fromIter(date.chars().take(4)) # "-12-31") };
  };

  /// Attachments already on a voucher, linked to one, or used by a purchase.
  func usedAttachments() : Set.Set<Nat> {
    let s = Set.empty<Nat>();
    for (v in ledger.vouchers.values()) for (a in v.attachmentIds.values()) s.add(a);
    for (a in files.links.keys()) s.add(a);
    for (a in purchases.used.keys()) s.add(a);
    s;
  };

  // ── Suppliers ──

  public shared query ({ caller }) func listSuppliers() : async Result.Result<[P.Supplier], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(purchases.suppliers.values().toArray());
  };

  public shared ({ caller }) func saveSupplier(id : ?Nat, s : P.SupplierInput) : async Result.Result<P.Supplier, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let clean = switch (Purchase.supplier(s, chart)) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let sid = switch (id) {
      case (?i) { if (not purchases.suppliers.containsKey(i)) return #err(#notFound); i };
      case null {
        if (purchases.suppliers.size() >= MAX_SUPPLIERS) return #err(#invalid("tooMany"));
        let i = purchases.next;
        purchases.next += 1;
        i;
      };
    };
    let saved : P.Supplier = { clean with id = sid };
    purchases.suppliers.add(sid, saved);
    ignore Audit.append(audit, Time.now(), caller, "supplier.save", "supplier", ?sid, Encode.supplier(clean));
    #ok(saved);
  };

  // ── Inbox ──

  /// Received files not yet used as evidence ("Att bokföra"), newest first.
  public shared query ({ caller }) func listInbox() : async Result.Result<[Types.Attachment], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let used = usedAttachments();
    #ok(files.attachments.reverseEntries().filter(func((id, _) : (Nat, Types.Attachment)) : Bool = not used.contains(id)).map(func((_, a) : (Nat, Types.Attachment)) : Types.Attachment = a).take(PURCHASE_PAGE).toArray());
  };

  // ── Documents ──

  /// Books a received document in one update: checks, takes the L number, posts the
  /// voucher with the original file attached. Under the cash method supplier invoices
  /// and credit notes are registered now and booked at payment.
  public shared ({ caller }) func bookPurchase(x : P.PurchaseInput) : async Result.Result<P.PurchaseView, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let today = purchaseToday();
    let used = usedAttachments();
    let clean = switch (Purchase.check(x, chart, func s = purchases.suppliers.containsKey(s), func a = files.attachments.containsKey(a) and not used.contains(a), today)) {
      case (#ok(c)) c;
      case (#err(e)) return #err(e);
    };
    switch (clean.creditOf) {
      case (?o) {
        let orig = purchases.docs.get(o) ?? (return #err(#invalid("creditOf")));
        if (orig.kind != #supplierInvoice or orig.supplierId != clean.supplierId or orig.currency != clean.currency) return #err(#invalid("creditOf"));
        if (clean.total > Purchase.view(purchases, orig, today).balance) return #err(#invalid("total"));
      };
      case null {};
    };
    let deferred = config.settings.accountingMethod == #cash and clean.treatment != #importVat and (clean.kind == #supplierInvoice or clean.kind == #creditNote);
    let name = switch (clean.supplierId) { case (?s) { switch (purchases.suppliers.get(s)) { case (?x) x.name; case null "" } }; case null { clean.payee ?? "" } };
    let vin : Types.VoucherInput = {
      series = Purchase.SERIES; eventDate = clean.docDate; description = clean.description;
      lines = Purchase.bookLines(clean, chart); attachmentIds = clean.attachmentIds; counterparty = if (name == "") null else ?name;
    };
    let fy = if (deferred) null else switch (Posting.check(purchaseCtx(), vin)) { case (#ok(fy)) ?fy; case (#err(e)) return #err(e) };
    let now = Time.now();
    let pid = purchases.next;
    purchases.next += 1;
    let voucherId = switch (fy) { case (?f) ?Posting.post(purchaseCtx(), f, vin, #purchase(pid), caller, now).id; case null null };
    let doc : P.Purchase = { clean with id = pid; voucherId; bookedAt = now; bookedBy = caller; retainUntil = purchaseRetain(clean.docDate) };
    purchases.docs.add(pid, doc);
    for (a in clean.attachmentIds.values()) purchases.used.add(a, pid);
    switch (clean.creditOf) { case (?o) purchases.creditsOf.add(o, (purchases.creditsOf.get(o) ?? []).concat([pid])); case null {} };
    ignore Audit.append(audit, now, caller, "purchase.book", "purchase", ?pid, Encode.purchase(clean));
    #ok(Purchase.view(purchases, doc, today));
  };

  public shared query ({ caller }) func listPurchases(kinds : [P.PurchaseKind], offset : Nat, limit : Nat) : async Result.Result<Types.Page<P.PurchaseView>, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let today = purchaseToday();
    let all = purchases.docs.reverseEntries()
      .filter(func((_, d) : (Nat, P.Purchase)) : Bool = kinds.size() == 0 or kinds.find(func k = k == d.kind) != null)
      .map(func((_, d) : (Nat, P.Purchase)) : P.Purchase = d).toArray();
    let page = all.sliceToArray(offset, offset + Nat.min(limit, PURCHASE_PAGE));
    #ok({ items = page.map(func(d : P.Purchase) : P.PurchaseView = Purchase.view(purchases, d, today)); total = all.size() });
  };

  public shared query ({ caller }) func getPurchase(id : Nat) : async Result.Result<P.PurchaseView, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    switch (purchases.docs.get(id)) { case (?d) #ok(Purchase.view(purchases, d, purchaseToday())); case null #err(#notFound) };
  };

  /// Pays a supplier invoice or an expense claim from the bank (1930). Bank matching
  /// uses the same posting with the matched bank account.
  public shared ({ caller }) func paySupplier(p : P.PayInput) : async Result.Result<P.SupplierPayment, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    Purchase.pay(purchaseCtx(), purchases, p, Purchase.BANK, caller, Time.now(), purchaseToday());
  };
};
