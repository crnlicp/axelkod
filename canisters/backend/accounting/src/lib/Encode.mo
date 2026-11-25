// acj-1 values for records that are hashed (audit details now, snapshots later).
import Array "mo:core/Array";
import Canonical "Canonical";
import S "../types/Sales";
import Types "../types";

module {
  let C = Canonical;

  func optText(t : ?Text) : C.Value = C.opt(t, C.text);

  public func source(s : Types.SourceRef) : C.Value {
    switch (s) {
      case (#manual) { #tag("manual", #null_) };
      case (#salesInvoice(n)) { #tag("salesInvoice", #int(n)) };
      case (#creditNote(n)) { #tag("creditNote", #int(n)) };
      case (#purchase(n)) { #tag("purchase", #int(n)) };
      case (#payment(n)) { #tag("payment", #int(n)) };
      case (#bankTx(n)) { #tag("bankTx", #int(n)) };
      case (#taxAccount(n)) { #tag("taxAccount", #int(n)) };
      case (#payRun(n)) { #tag("payRun", #int(n)) };
      case (#vatReturn(n)) { #tag("vatReturn", #int(n)) };
      case (#rotRut(n)) { #tag("rotRut", #int(n)) };
      case (#asset(n)) { #tag("asset", #int(n)) };
      case (#inventory(n)) { #tag("inventory", #int(n)) };
      case (#yearEnd(n)) { #tag("yearEnd", #int(n)) };
    };
  };

  public func line(l : Types.VoucherLine) : C.Value {
    #obj([
      ("account", #int(l.account)),
      ("amount", #int(l.amount)),
      ("vatCode", optText(l.vatCode)),
      ("costCenter", optText(l.costCenter)),
      ("project", optText(l.project)),
      ("quantity", C.opt(l.quantity, C.int)),
      ("text", optText(l.text)),
    ]);
  };

  public func voucher(v : Types.Voucher) : C.Value {
    #obj([
      ("id", #int(v.id)),
      ("fiscalYearId", #int(v.fiscalYearId)),
      ("series", #text(v.series)),
      ("number", #int(v.number)),
      ("eventDate", #text(v.eventDate)),
      ("registeredAt", #int(v.registeredAt)),
      ("description", #text(v.description)),
      ("lines", #arr(v.lines.map(line))),
      ("source", source(v.source)),
      ("attachmentIds", #arr(v.attachmentIds.map(C.nat))),
      ("counterparty", optText(v.counterparty)),
      ("corrects", C.opt(v.corrects, C.nat)),
      ("createdBy", C.principal(v.createdBy)),
      ("retainUntil", #text(v.retainUntil)),
    ]);
  };

  public func input(v : Types.VoucherInput) : C.Value {
    #obj([
      ("series", #text(v.series)),
      ("eventDate", #text(v.eventDate)),
      ("description", #text(v.description)),
      ("lines", #arr(v.lines.map(line))),
      ("attachmentIds", #arr(v.attachmentIds.map(C.nat))),
      ("counterparty", optText(v.counterparty)),
    ]);
  };

  public func role(r : Types.Role) : C.Value {
    #tag(switch (r) { case (#owner) "owner"; case (#bookkeeper) "bookkeeper"; case (#payroll) "payroll"; case (#auditor) "auditor" }, #null_);
  };

  public func company(c : Types.CompanyProfile) : C.Value {
    #obj([
      ("legalName", #text(c.legalName)), ("orgNr", #text(c.orgNr)), ("vatNr", #text(c.vatNr)),
      ("registeredOffice", #text(c.registeredOffice)), ("street", #text(c.street)),
      ("postalCode", #text(c.postalCode)), ("city", #text(c.city)), ("country", #text(c.country)),
      ("email", #text(c.email)), ("phone", optText(c.phone)), ("web", optText(c.web)),
      ("bankgiro", optText(c.bankgiro)), ("plusgiro", optText(c.plusgiro)), ("iban", optText(c.iban)),
      ("bic", optText(c.bic)), ("fSkatt", #bool(c.fSkatt)), ("peppolId", optText(c.peppolId)),
    ]);
  };
  // ── Sales (mirrored in app/admin/accounting/encode.ts) ──

  func tag(t : Text) : C.Value = #tag(t, #null_);

  public func lang(l : S.Lang) : C.Value = tag(switch (l) { case (#sv) "sv"; case (#en) "en" });

  public func docKind(k : S.DocKind) : C.Value = tag(switch (k) { case (#quote) "quote"; case (#invoice) "invoice"; case (#creditNote) "creditNote" });

  func partyKind(k : { #company; #person }) : C.Value = tag(switch (k) { case (#company) "company"; case (#person) "person" });

  public func address(a : S.Address) : C.Value = #obj([("street", #text(a.street)), ("postalCode", #text(a.postalCode)), ("city", #text(a.city)), ("country", #text(a.country))]);

  public func party(p : S.PartySnapshot) : C.Value {
    #obj([
      ("name", #text(p.name)), ("orgNr", optText(p.orgNr)), ("vatNr", optText(p.vatNr)), ("address", address(p.address)),
      ("email", optText(p.email)), ("peppolId", optText(p.peppolId)), ("kind", partyKind(p.kind)),
    ]);
  };

  public func snapshot(x : S.Snapshot) : C.Value {
    #obj([
      ("kind", docKind(x.kind)),
      ("number", #int(x.number)),
      ("seller", company(x.seller)),
      ("buyer", party(x.buyer)),
      ("language", lang(x.language)),
      ("issueDate", #text(x.issueDate)),
      ("deliveryDate", optText(x.deliveryDate)),
      ("dueDate", optText(x.dueDate)),
      ("validUntil", optText(x.validUntil)),
      ("currency", #text(x.currency)),
      ("fxRate", C.opt(x.fxRate, func(f : S.FxRate) : C.Value = #obj([("rate", #int(f.rate)), ("date", #text(f.date))]))),
      ("lines", #arr(x.lines.map(func(l : S.SnapLine) : C.Value = #obj([
        ("description", #text(l.description)), ("quantity", #int(l.quantity)), ("unit", #text(l.unit)), ("unitPrice", #int(l.unitPrice)),
        ("discountBp", #int(l.discountBp)), ("vatCode", #text(l.vatCode)), ("rateBp", #int(l.rateBp)), ("account", #int(l.account)), ("net", #int(l.net)),
      ])))),
      ("vat", #arr(x.vat.map(func(r : S.VatRow) : C.Value = #obj([
        ("vatCode", #text(r.vatCode)), ("rateBp", #int(r.rateBp)), ("category", #text(r.category)), ("base", #int(r.base)), ("vat", #int(r.vat)),
      ])))),
      ("totalNet", #int(x.totalNet)),
      ("totalVat", #int(x.totalVat)),
      ("total", #int(x.total)),
      ("totalVatSek", C.opt(x.totalVatSek, C.int)),
      ("legalNotes", #arr(x.legalNotes.map(C.text))),
      ("ocr", optText(x.ocr)),
      ("ourRef", optText(x.ourRef)),
      ("yourRef", optText(x.yourRef)),
      ("notes", optText(x.notes)),
      ("termsDays", #int(x.termsDays)),
      ("lateInterestText", optText(x.lateInterestText)),
      ("creditOf", C.opt(x.creditOf, func(c : { number : Nat; issueDate : Text }) : C.Value = #obj([("number", #int(c.number)), ("issueDate", #text(c.issueDate))]))),
      ("templateVersion", #text(x.templateVersion)),
    ]);
  };

  /// The printed part of a reminder (hashed).
  public func reminder(r : { number : Nat; date : Text; invoiceNumber : Nat; dueDate : Text; balance : Int; interest : Int; interestRateBp : Int; fee : Int; feeKind : Text; language : S.Lang; seller : Types.CompanyProfile; buyer : S.PartySnapshot }) : C.Value {
    #obj([
      ("number", #int(r.number)), ("date", #text(r.date)), ("invoiceNumber", #int(r.invoiceNumber)), ("dueDate", #text(r.dueDate)),
      ("balance", #int(r.balance)), ("interest", #int(r.interest)), ("interestRateBp", #int(r.interestRateBp)), ("fee", #int(r.fee)),
      ("feeKind", #text(r.feeKind)), ("language", lang(r.language)), ("seller", company(r.seller)), ("buyer", party(r.buyer)),
    ]);
  };

  public func customer(c : S.CustomerInput) : C.Value {
    #obj([
      ("kind", partyKind(c.kind)), ("name", #text(c.name)), ("orgNr", optText(c.orgNr)), ("vatNr", optText(c.vatNr)),
      ("address", address(c.address)), ("email", optText(c.email)), ("peppolId", optText(c.peppolId)), ("termsDays", #int(c.termsDays)),
      ("language", lang(c.language)), ("reminderFeeAgreed", #bool(c.reminderFeeAgreed)), ("active", #bool(c.active)),
    ]);
  };

  public func payment(p : S.PaymentInput) : C.Value {
    #obj([
      ("salesDocId", #int(p.salesDocId)), ("date", #text(p.date)), ("amount", #int(p.amount)), ("amountSek", C.opt(p.amountSek, C.int)),
      ("interest", #int(p.interest)), ("fees", #int(p.fees)), ("reference", optText(p.reference)),
      ("method", tag(switch (p.method) { case (#bankgiro) "bankgiro"; case (#swish) "swish"; case (#card) "card"; case (#transfer) "transfer"; case (#cash) "cash" })),
    ]);
  };

};
