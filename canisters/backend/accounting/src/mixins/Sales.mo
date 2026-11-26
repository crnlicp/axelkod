// Quotes, invoices, credit notes, payments and reminders. Issuing is one
// synchronous update (no await): validate, take the number, freeze and hash the
// snapshot, post the voucher. Issued documents are never changed (C8).
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import C "../lib/Canonical";
import Chart "../lib/Chart";
import Dates "../lib/Dates";
import Encode "../lib/Encode";
import Invoice "../lib/Invoice";
import Posting "../lib/Posting";
import Roles "../lib/Roles";
import RotRutLib "../lib/RotRut";
import SalesLib "../lib/Sales";
import R "../types/RotRut";
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
  rotRut : R.RotRut,
) {
  transient let SALES_PAGE = 200;
  transient let SALES_DRAFTS = 1_000;

  func ctx() : Posting.Ctx = { chart; config; ledger; files; counters; audit };
  func today() : Types.Date = Dates.fromTime(Time.now());
  func cashMethod() : Bool = config.settings.accountingMethod == #cash;

  func kindText(k : S.DocKind) : Text = switch (k) { case (#quote) "quote"; case (#invoice) "invoice"; case (#creditNote) "creditNote" };

  /// The retention date of a document: 7 years after the end of its fiscal year (BFL 7:2).
  func retainFor(date : Types.Date) : Types.Date = switch (Chart.yearOf(chart, date)) {
    case (?fy) { Dates.retainUntil(fy.end) };
    case null { Dates.retainUntil(Text.fromIter(date.chars().take(4)) # "-12-31") };
  };

  // ── Drafts ──

  public shared query ({ caller }) func listSalesDrafts() : async Result.Result<[S.SalesDraft], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(sales.drafts.values().toArray());
  };

  public shared ({ caller }) func saveSalesDraft(id : ?Nat, kind : S.DocKind, input : S.DocInput, creditOf : ?Nat, quoteOf : ?Nat) : async Result.Result<S.SalesDraft, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (input.lines.size() > Invoice.MAX_LINES) return #err(#invalid("lines"));
    if (not sales.customers.containsKey(input.customerId)) return #err(#invalid("customerId"));
    switch (kind, creditOf) {
      case (#creditNote, ?o) { switch (sales.docs.get(o)) { case (?d) { if (d.kind != #invoice) return #err(#invalid("creditOf")) }; case null { return #err(#invalid("creditOf")) } } };
      case (#creditNote, null) { return #err(#invalid("creditOf")) };
      case (_, _) {};
    };
    let did = switch (id) {
      case (?i) { switch (sales.drafts.get(i)) { case (?d) { if (d.kind != kind) return #err(#invalid("kind")) }; case null { return #err(#notFound) } }; i };
      case null {
        if (sales.drafts.size() >= SALES_DRAFTS) return #err(#invalid("tooManyDrafts"));
        let i = sales.next;
        sales.next += 1;
        i;
      };
    };
    let d : S.SalesDraft = { id = did; kind; input; creditOf = if (kind == #creditNote) creditOf else null; quoteOf = if (kind == #invoice) quoteOf else null; updatedAt = Time.now(); updatedBy = caller };
    sales.drafts.add(did, d);
    #ok(d);
  };

  public shared ({ caller }) func deleteSalesDraft(id : Nat) : async Result.Result<(), Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (not sales.drafts.containsKey(id)) return #err(#notFound);
    sales.drafts.remove(id);
    #ok(());
  };

  type Prepared = { snapshot : S.Snapshot; key : Text; voucher : ?(Types.FiscalYear, Types.VoucherInput); original : ?S.SalesDoc };

  /// Everything except storing: run by both preview and issue, so a preview that passes will issue.
  func prepare(d : S.SalesDraft, date : Types.Date) : Result.Result<Prepared, Types.Error> {
    let customer = switch (sales.customers.get(d.input.customerId)) { case (?c) c; case null { return #err(#invalid("customerId")) } };
    let key = if (d.kind == #quote) "quote" else "invoice";
    let number = SalesLib.nextNumber(sales, key);
    let original = switch (d.creditOf) { case (?o) sales.docs.get(o); case null null };
    let creditInfo = switch (original) { case (?o) ?{ number = o.number; issueDate = o.snapshot.issueDate }; case null null };
    if (d.kind == #creditNote) {
      let o = switch (original) { case (?o) o; case null { return #err(#invalid("creditOf")) } };
      if (o.customerId != d.input.customerId) return #err(#invalid("customerId"));
      if (o.snapshot.currency != d.input.currency) return #err(#invalid("currency"));
    };
    let built = switch (Invoice.build(d.kind, number, d.input, config.company, customer, chart, sales.params, date, creditInfo)) {
      case (#ok(x)) x;
      case (#err(e)) return #err(e);
    };
    // ROT/RUT (A8): computed for quotes and invoices; a credit note takes the invoice's part
    // and must credit all of it before anything is claimed.
    let hus : ?R.HusPart = switch (d.kind, original) {
      case (#creditNote, ?o) {
        switch (o.snapshot.hus) {
          case (?h) {
            let cases = (rotRut.casesOf.get(o.id) ?? []).filterMap(func(i : Nat) : ?R.HusCase = rotRut.cases.get(i));
            if (cases.any(func(c : R.HusCase) : Bool = c.status != #cancelled)) return #err(#conflict("husClaimed"));
            if (SalesLib.credited(sales, o.id) != 0 or built.lines.size() != o.snapshot.lines.size() or built.totalNet != o.snapshot.totalNet or built.totalVat != o.snapshot.totalVat) return #err(#invalid("husFullCredit"));
            ?h;
          };
          case null { null };
        };
      };
      case (_, _) {
        switch (d.input.hus) {
          case (?h) {
            if (not config.settings.modules.rotRut) return #err(#invalid("hus.module"));
            switch (RotRutLib.part(h, built, rotRut.params)) { case (#ok(p)) ?p; case (#err(e)) return #err(e) };
          };
          case null { null };
        };
      };
    };
    let snapshot = { built with hus };
    if (d.kind != #quote and snapshot.total <= 0) return #err(#invalid("total"));
    switch (original) {
      case (?o) { if (RotRutLib.customerPart(snapshot) > SalesLib.total(o) - SalesLib.credited(sales, o.id)) return #err(#invalid("creditExceedsInvoice")) };
      case null {};
    };
    let voucher = if (d.kind == #quote or cashMethod()) null else {
      let what = switch (d.kind) { case (#creditNote) "Kreditfaktura "; case (_) "Faktura " };
      let v : Types.VoucherInput = {
        series = SalesLib.SERIES_SALES; eventDate = date; description = what # number.toText() # ", " # customer.name;
        lines = SalesLib.issueLines(snapshot, chart); attachmentIds = []; counterparty = ?customer.name;
      };
      switch (Posting.check(ctx(), v)) { case (#ok(fy)) ?(fy, v); case (#err(e)) return #err(e) };
    };
    #ok({ snapshot; key; voucher; original });
  };

  /// The document as it would be issued today (totals, notes, OCR), without taking a number.
  public shared query ({ caller }) func previewSalesDraft(id : Nat) : async Result.Result<S.Snapshot, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let d = switch (sales.drafts.get(id)) { case (?d) d; case null { return #err(#notFound) } };
    switch (prepare(d, today())) { case (#ok(p)) #ok(p.snapshot); case (#err(e)) #err(e) };
  };

  public shared ({ caller }) func issueSalesDraft(id : Nat) : async Result.Result<S.DocView, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let d = switch (sales.drafts.get(id)) { case (?d) d; case null { return #err(#notFound) } };
    let date = today();
    let p = switch (prepare(d, date)) { case (#ok(p)) p; case (#err(e)) return #err(e) };
    let now = Time.now();
    let docId = sales.next;
    sales.next += 1;
    sales.numbering.add(p.key, p.snapshot.number);
    let voucherId = switch (p.voucher) {
      case (?(fy, v)) {
        let source = if (d.kind == #creditNote) #creditNote(docId) else #salesInvoice(docId);
        ?Posting.post(ctx(), fy, v, source, caller, now).id;
      };
      case null { null };
    };
    let value = Encode.snapshot(p.snapshot);
    let doc : S.SalesDoc = {
      id = docId; kind = d.kind; number = p.snapshot.number; snapshot = p.snapshot; contentHash = C.sha256(value);
      customerId = d.input.customerId; creditOf = d.creditOf; quoteOf = d.quoteOf; voucherId; issuedAt = now; issuedBy = caller;
      retainUntil = retainFor(date);
    };
    sales.docs.add(docId, doc);
    switch (d.creditOf) { case (?o) { sales.creditsOf.add(o, (sales.creditsOf.get(o) ?? []).concat([docId])) }; case null {} };
    switch (d.quoteOf) { case (?q) { sales.invoicesOf.add(q, (sales.invoicesOf.get(q) ?? []).concat([docId])) }; case null {} };
    if (d.kind == #quote) sales.quoteStatus.add(docId, #sent);
    sales.drafts.remove(id);
    // The audit entry's detail hash is the document's content hash.
    ignore Audit.append(audit, now, caller, "sales." # kindText(d.kind) # ".issue", "salesDoc", ?docId, value);
    #ok(SalesLib.view(sales, doc, date));
  };

  // ── Reading ──

  public shared query ({ caller }) func listSalesDocs(kind : ?S.DocKind, offset : Nat, limit : Nat) : async Result.Result<Types.Page<S.DocSummary>, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let t = today();
    // Newest first.
    let all = sales.docs.reverseEntries().map(func((_, d) : (Nat, S.SalesDoc)) : S.SalesDoc = d).filter(func(d : S.SalesDoc) : Bool = switch (kind) { case (?k) { d.kind == k }; case null { true } }).toArray();
    let items = all.sliceToArray(offset, offset + Nat.min(limit, SALES_PAGE)).map(func(d : S.SalesDoc) : S.DocSummary = SalesLib.summary(SalesLib.view(sales, d, t)));
    #ok({ items; total = all.size() });
  };

  public shared query ({ caller }) func getSalesDoc(id : Nat) : async Result.Result<S.DocView, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    switch (sales.docs.get(id)) { case (?d) #ok(SalesLib.view(sales, d, today())); case null #err(#notFound) };
  };

  // ── Quotes and credit notes ──

  public shared ({ caller }) func setQuoteStatus(id : Nat, status : { #accepted; #declined }) : async Result.Result<(), Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    switch (sales.docs.get(id)) { case (?d) { if (d.kind != #quote) return #err(#invalid("kind")) }; case null { return #err(#notFound) } };
    if (sales.quoteStatus.get(id) != ?#sent) return #err(#conflict("status"));
    let s : S.QuoteStatus = switch (status) { case (#accepted) #accepted; case (#declined) #declined };
    sales.quoteStatus.add(id, s);
    ignore Audit.append(audit, Time.now(), caller, "sales.quote.status", "salesDoc", ?id, #tag(switch (status) { case (#accepted) "accepted"; case (#declined) "declined" }, #null_));
    #ok(());
  };

  func draftFrom(caller : Principal, src : S.SalesDoc, kind : S.DocKind, termsDays : Nat) : S.SalesDraft {
    let x = src.snapshot;
    let input : S.DocInput = {
      customerId = src.customerId; language = x.language; deliveryDate = null; validUntil = null; termsDays; currency = x.currency;
      fxRate = x.fxRate; lines = x.lines.map(SalesLib.docLine); ourRef = x.ourRef; yourRef = x.yourRef; notes = null;
      // A credit note takes the invoice's part when it is issued; a quote's carries over to the invoice.
      hus = if (kind == #invoice) (switch (x.hus) { case (?h) ?RotRutLib.input(h); case null null }) else null;
    };
    let id = sales.next;
    sales.next += 1;
    let d : S.SalesDraft = {
      id; kind; input; creditOf = if (kind == #creditNote) ?src.id else null; quoteOf = if (kind == #invoice) ?src.id else null;
      updatedAt = Time.now(); updatedBy = caller;
    };
    sales.drafts.add(id, d);
    d;
  };

  /// A credit note draft with the invoice's lines; edit it for a partial credit.
  public shared ({ caller }) func creditDraftFrom(invoiceId : Nat) : async Result.Result<S.SalesDraft, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let d = switch (sales.docs.get(invoiceId)) { case (?d) d; case null { return #err(#notFound) } };
    if (d.kind != #invoice) return #err(#invalid("kind"));
    if (SalesLib.credited(sales, invoiceId) >= SalesLib.total(d)) return #err(#conflict("credited"));
    #ok(draftFrom(caller, d, #creditNote, 0));
  };

  public shared ({ caller }) func invoiceDraftFromQuote(quoteId : Nat) : async Result.Result<S.SalesDraft, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let q = switch (sales.docs.get(quoteId)) { case (?d) d; case null { return #err(#notFound) } };
    if (q.kind != #quote) return #err(#invalid("kind"));
    let terms = switch (sales.customers.get(q.customerId)) { case (?c) c.termsDays; case null { config.settings.invoiceTermsDays } };
    #ok(draftFrom(caller, q, #invoice, terms));
  };

  // ── Payments ──

  public shared ({ caller }) func registerPayment(p : S.PaymentInput) : async Result.Result<S.Payment, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    SalesLib.pay(ctx(), sales, p, SalesLib.BANK, caller, Time.now(), today(), cashMethod());
  };

  public shared query ({ caller }) func listPayments(offset : Nat, limit : Nat) : async Result.Result<Types.Page<S.Payment>, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let all = sales.payments.reverseEntries().map(func((_, x) : (Nat, S.Payment)) : S.Payment = x).toArray();
    #ok({ items = all.sliceToArray(offset, offset + Nat.min(limit, SALES_PAGE)); total = all.size() });
  };

  // ── Reminders ──

  /// A payment reminder for an overdue invoice. B2B: förseningsersättning once (1981:739 4 a §),
  /// and then no reminder fee (5 §). Otherwise the agreed reminder fee (2 §). Interest from the
  /// due date at the reference rate + 8 pp (Räntelagen 3, 6 §§); it is claimed, not booked.
  public shared ({ caller }) func createReminder(invoiceId : Nat, date : Types.Date) : async Result.Result<S.Reminder, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let d = switch (sales.docs.get(invoiceId)) { case (?d) d; case null { return #err(#notFound) } };
    if (d.kind != #invoice) return #err(#invalid("kind"));
    if (not Dates.isValid(date) or date > today()) return #err(#invalid("date"));
    let v = SalesLib.view(sales, d, date);
    let due = d.snapshot.dueDate ?? (return #err(#invalid("dueDate")));
    if (v.balance <= 0 or due >= date) return #err(#conflict("notOverdue"));
    let customer = sales.customers.get(d.customerId);
    let earlier = (sales.remindersOf.get(invoiceId) ?? []).filterMap(func(i : Nat) : ?S.Reminder = sales.reminders.get(i));
    let params = sales.params;
    let agreed = switch (customer) { case (?c) c.reminderFeeAgreed; case null false };
    let (fee, feeKind) = Invoice.reminderFee(d.snapshot.buyer.kind, agreed, params, earlier.any(func(r : S.Reminder) : Bool = r.feeKind == "forseningsersattning"));
    let (interest, rateBp) = Invoice.interest(v.balance, due, date, params.referenceRates, params.lateInterestMarginBp);
    let number = SalesLib.nextNumber(sales, "reminder");
    let printed = {
      number; date; invoiceNumber = d.number; dueDate = due; balance = v.balance; interest; interestRateBp = rateBp; fee; feeKind;
      language = d.snapshot.language; seller = config.company ?? d.snapshot.seller; buyer = d.snapshot.buyer;
    };
    let value = Encode.reminder(printed);
    let now = Time.now();
    let rid = sales.next;
    sales.next += 1;
    sales.numbering.add("reminder", number);
    let r : S.Reminder = { printed with id = rid; salesDocId = invoiceId; contentHash = C.sha256(value); at = now; by = caller };
    sales.reminders.add(rid, r);
    sales.remindersOf.add(invoiceId, (sales.remindersOf.get(invoiceId) ?? []).concat([rid]));
    ignore Audit.append(audit, now, caller, "sales.reminder", "reminder", ?rid, value);
    #ok(r);
  };

  public shared query ({ caller }) func listReminders(offset : Nat, limit : Nat) : async Result.Result<Types.Page<S.Reminder>, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let all = sales.reminders.reverseEntries().map(func((_, x) : (Nat, S.Reminder)) : S.Reminder = x).toArray();
    #ok({ items = all.sliceToArray(offset, offset + Nat.min(limit, SALES_PAGE)); total = all.size() });
  };
};
