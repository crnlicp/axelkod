// acj-1 values for records that are hashed (audit details now, snapshots later).
import Array "mo:core/Array";
import Canonical "Canonical";
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
};
