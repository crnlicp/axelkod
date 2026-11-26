// acj-1 values for records that are hashed (audit details now, snapshots later).
import Array "mo:core/Array";
import Canonical "Canonical";
import B "../types/Bank";
import P "../types/Purchases";
import R "../types/RotRut";
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

  func husKind(k : R.HusKind) : C.Value = #tag(switch (k) { case (#rot) "rot"; case (#rut) "rut" }, #null_);

  /// ROT/RUT part of a snapshot (A8). Encrypted fields are hashed as their ciphertext.
  public func hus(h : R.HusPart) : C.Value {
    #obj([
      ("kind", husKind(h.kind)),
      ("rateBp", #int(h.rateBp)),
      ("lineParts", #arr(h.lineParts.map(func(p : ?R.HusLinePart) : C.Value = C.opt(p, func(q : R.HusLinePart) : C.Value = switch (q) {
        case (#labour(t)) { #tag("labour", #text(t)) };
        case (#material(t)) { #tag("material", #text(t)) };
        case (#other) { #tag("other", #null_) };
      })))),
      ("labour", #int(h.labour)),
      ("material", #int(h.material)),
      ("other", #int(h.other)),
      ("work", #arr(h.work.map(func(w : R.HusWork) : C.Value = #obj([("workType", #text(w.workType)), ("labour", #int(w.labour)), ("material", #int(w.material))])))),
      ("deduction", #int(h.deduction)),
      ("buyers", #arr(h.buyers.map(func(b : R.HusBuyer) : C.Value = #obj([("identityEnc", #blob(b.identityEnc)), ("shareBp", #int(b.shareBp)), ("amount", #int(b.amount))])))),
      ("propertyEnc", C.opt(h.propertyEnc, func(b : Blob) : C.Value = #blob(b))),
    ]);
  };

  /// The `hus` field is present only on ROT/RUT documents, so earlier hashes are unchanged.
  public func snapshot(x : S.Snapshot) : C.Value {
    let base = snapshotBase(x);
    switch (x.hus, base) {
      case (?h, #obj(fields)) { #obj(fields.concat([("hus", hus(h))])) };
      case (_, _) { base };
    };
  };

  func snapshotBase(x : S.Snapshot) : C.Value {
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

  public func treatment(t : P.Treatment) : C.Value = tag(switch (t) {
    case (#domestic) "domestic"; case (#euGoods) "euGoods"; case (#euServices) "euServices"; case (#nonEuServices) "nonEuServices";
    case (#seGoodsRC) "seGoodsRC"; case (#seServicesRC) "seServicesRC"; case (#noVat) "noVat"; case (#importVat) "importVat";
  });

  public func supplier(s : P.SupplierInput) : C.Value {
    #obj([
      ("name", #text(s.name)), ("orgNr", optText(s.orgNr)), ("vatNr", optText(s.vatNr)), ("country", #text(s.country)),
      ("bankgiro", optText(s.bankgiro)), ("plusgiro", optText(s.plusgiro)), ("iban", optText(s.iban)), ("bic", optText(s.bic)),
      ("defaultAccount", C.opt(s.defaultAccount, C.int)), ("treatment", treatment(s.treatment)), ("active", #bool(s.active)),
    ]);
  };

  public func purchase(x : P.PurchaseInput) : C.Value {
    #obj([
      ("kind", tag(switch (x.kind) { case (#supplierInvoice) "supplierInvoice"; case (#creditNote) "creditNote"; case (#receipt) "receipt"; case (#expenseClaim) "expenseClaim" })),
      ("supplierId", C.opt(x.supplierId, C.int)), ("payee", optText(x.payee)), ("docDate", #text(x.docDate)), ("dueDate", optText(x.dueDate)),
      ("docNumber", optText(x.docNumber)), ("currency", #text(x.currency)),
      ("fxRate", switch (x.fxRate) { case (?f) #obj([("rate", #int(f.rate)), ("date", #text(f.date))]); case null #null_ }),
      ("treatment", treatment(x.treatment)),
      ("lines", #arr(x.lines.map(func(l : P.PurchaseLine) : C.Value = #obj([("account", #int(l.account)), ("net", #int(l.net)), ("rateBp", #int(l.rateBp)), ("vat", #int(l.vat)), ("text", optText(l.text))])))),
      ("total", #int(x.total)), ("paymentRef", optText(x.paymentRef)),
      ("paidFrom", switch (x.paidFrom) { case (?#bank) tag("bank"); case (?#cash) tag("cash"); case null #null_ }),
      ("creditOf", C.opt(x.creditOf, C.int)), ("description", #text(x.description)),
      ("attachmentIds", #arr(x.attachmentIds.map(func(a : Nat) : C.Value = #int(a)))),
    ]);
  };

  public func supplierPayment(p : P.PayInput) : C.Value {
    #obj([("purchaseId", #int(p.purchaseId)), ("date", #text(p.date)), ("amount", #int(p.amount)), ("amountSek", C.opt(p.amountSek, C.int)), ("reference", optText(p.reference))]);
  };

  public func bankRule(r : B.RuleInput) : C.Value {
    #obj([("contains", #text(r.contains)), ("account", #int(r.account)), ("vatRateBp", #int(r.vatRateBp)), ("description", #text(r.description))]);
  };

  public func bankMatch(txId : Nat, kind : Text, voucherId : Nat) : C.Value {
    #obj([("transaction", #int(txId)), ("kind", tag(kind)), ("voucherId", #int(voucherId))]);
  };
};
