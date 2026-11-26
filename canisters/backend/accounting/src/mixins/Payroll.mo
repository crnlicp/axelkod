// Lön: employees, pay items, tax tables, pay runs (draft → approve → paid), AGI per
// period and växa-stöd applications. Calculation happens here (C24); the AGI XML and
// anything showing personnummer is built in the browser after decrypting with pii-v1.
import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import Canonical "../lib/Canonical";
import Dates "../lib/Dates";
import PayLib "../lib/Payroll";
import Posting "../lib/Posting";
import Roles "../lib/Roles";
import Pr "../types/Payroll";
import Types "../types";

mixin (
  roles : Types.Roles,
  config : Types.Config,
  chart : Types.Chart,
  ledger : Types.Ledger,
  files : Types.Files,
  counters : Types.Counters,
  audit : Types.Audit,
  payroll : Pr.Payroll,
) {
  func payCtx() : Posting.Ctx = { chart; config; ledger; files; counters; audit };
  func payToday() : Types.Date = Dates.fromTime(Time.now());
  func payYear() : Nat = PayLib.periodYear(PayLib.periodOf(payToday()));

  // ── Parameters ──

  public shared query ({ caller }) func getPayrollParams() : async Result.Result<Pr.Params, Types.Error> {
    if (not Roles.canReadPayroll(roles, caller)) return #err(#notAuthorized);
    #ok(payroll.params);
  };

  /// Owner only, audited with its source (rates are legal data, V8–V11).
  public shared ({ caller }) func setPayrollParams(p : Pr.Params) : async Result.Result<(), Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    if (p.source.trim(#char ' ') == "" or p.source.size() > 500) return #err(#invalid("source"));
    if (p.feeFullBp > 10_000 or p.feePensionBp > p.feeFullBp or p.vaxaRefundBp > p.feeFullBp or p.flatTaxBp > 10_000) return #err(#invalid("rates"));
    switch (p.youth) {
      case (?y) { if (not PayLib.validPeriod(y.fromPeriod) or not PayLib.validPeriod(y.toPeriod) or y.fromPeriod > y.toPeriod or y.bp > p.feeFullBp or y.minAge > y.maxAge) return #err(#invalid("youth")) };
      case null {};
    };
    payroll.params := p;
    ignore Audit.append(audit, Time.now(), caller, "payroll.params", "payrollParams", ?p.year, #obj([
      ("year", #int(p.year)), ("feeFullBp", #int(p.feeFullBp)), ("feePensionBp", #int(p.feePensionBp)), ("source", #text(p.source)),
    ]));
    #ok(());
  };

  // ── Pay items ──

  public shared query ({ caller }) func listPayItems() : async Result.Result<[Pr.PayItem], Types.Error> {
    if (not Roles.canReadPayroll(roles, caller)) return #err(#notAuthorized);
    #ok(payroll.items.values().toArray());
  };

  public shared ({ caller }) func savePayItem(i : Pr.PayItem) : async Result.Result<Pr.PayItem, Types.Error> {
    if (not Roles.canPayroll(roles, caller)) return #err(#notAuthorized);
    let clean = switch (PayLib.item(i, chart)) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    payroll.items.add(clean.code, clean);
    ignore Audit.append(audit, Time.now(), caller, "payroll.item", "payItem", null, #obj([("code", #text(clean.code)), ("name", #text(clean.name))]));
    #ok(clean);
  };

  // ── Employees ──

  public shared query ({ caller }) func listEmployees() : async Result.Result<[Pr.Employee], Types.Error> {
    if (not Roles.canReadPayroll(roles, caller)) return #err(#notAuthorized);
    #ok(payroll.employees.values().toArray());
  };

  public shared ({ caller }) func saveEmployee(id : ?Nat, e : Pr.EmployeeInput) : async Result.Result<Pr.Employee, Types.Error> {
    if (not Roles.canPayroll(roles, caller)) return #err(#notAuthorized);
    let clean = switch (PayLib.employee(e, payYear())) { case (#ok(x)) x; case (#err(x)) return #err(x) };
    let eid = switch (id) {
      case (?x) { if (not payroll.employees.containsKey(x)) return #err(#notFound); x };
      case null { let x = payroll.next; payroll.next += 1; x };
    };
    let saved : Pr.Employee = { clean with id = eid };
    payroll.employees.add(eid, saved);
    // Personal data is logged only as "changed" (its hash would still identify it).
    ignore Audit.append(audit, Time.now(), caller, "payroll.employee", "employee", ?eid, #obj([("name", #text(saved.name)), ("birthYear", #int(saved.birthYear))]));
    #ok(saved);
  };

  // ── Tax tables (V10) ──

  public shared query ({ caller }) func listTaxTables() : async Result.Result<[Pr.TaxTableInfo], Types.Error> {
    if (not Roles.canReadPayroll(roles, caller)) return #err(#notAuthorized);
    #ok(payroll.tables.values().map(func(t : Pr.TaxTable) : Pr.TaxTableInfo = { year = t.year; table = t.table; rows = t.rows.size(); sha256 = t.sha256; importedAt = t.importedAt }).toArray());
  };

  /// One table of one year, parsed in the browser from Skatteverket's file; `sha256` is the file's.
  public shared ({ caller }) func importTaxTable(year : Nat, table : Nat, rows : [Pr.TaxTableRow], sha256 : Blob) : async Result.Result<Pr.TaxTableInfo, Types.Error> {
    if (not Roles.canPayroll(roles, caller)) return #err(#notAuthorized);
    if (year < 2018 or year > payYear() + 1 or table < 29 or table > 42 or sha256.size() != 32) return #err(#invalid("table"));
    switch (PayLib.checkRows(rows)) { case (#err(e)) return #err(e); case (#ok) {} };
    let now = Time.now();
    let t : Pr.TaxTable = { year; table; rows; sha256; importedAt = now; importedBy = caller };
    payroll.tables.add(PayLib.tableKey(year, table), t);
    ignore Audit.append(audit, now, caller, "payroll.taxTable", "taxTable", ?PayLib.tableKey(year, table), #obj([("year", #int(year)), ("table", #int(table)), ("rows", #int(rows.size())), ("sha256", #blob(sha256))]));
    #ok({ year; table; rows = rows.size(); sha256; importedAt = now });
  };

  // ── Pay runs ──

  func summary(r : Pr.PayRun) : Pr.RunSummary {
    var gross : Int = 0; var tax : Int = 0; var net : Int = 0; var fees : Int = 0;
    for (s in r.slips.values()) { gross += s.cash; tax += s.tax; net += s.net; fees += s.fees };
    { id = r.id; period = r.period; paymentDate = r.paymentDate; status = r.status; employees = r.slips.size(); gross; tax; net; fees };
  };

  public shared query ({ caller }) func listPayRuns() : async Result.Result<[Pr.RunSummary], Types.Error> {
    if (not Roles.canReadPayroll(roles, caller)) return #err(#notAuthorized);
    #ok(payroll.runs.reverseEntries().map(func((_, r) : (Nat, Pr.PayRun)) : Pr.RunSummary = summary(r)).toArray());
  };

  public shared query ({ caller }) func getPayRun(id : Nat) : async Result.Result<Pr.PayRun, Types.Error> {
    if (not Roles.canReadPayroll(roles, caller)) return #err(#notAuthorized);
    switch (payroll.runs.get(id)) { case (?r) #ok(r); case null #err(#notFound) };
  };

  func calcAll(paymentDate : Types.Date, inputs : [Pr.SlipInput]) : Result.Result<[Pr.Payslip], Types.Error> {
    let period = PayLib.periodOf(paymentDate);
    let year = PayLib.periodYear(period);
    let out = List.empty<Pr.Payslip>();
    for ((i, x) in inputs.enumerate()) {
      let e = payroll.employees.get(x.employeeId) ?? (return #err(#invalid("inputs[" # i.toText() # "].employeeId")));
      for (j in Nat.range(0, i)) if (inputs[j].employeeId == x.employeeId) return #err(#invalid("inputs[" # i.toText() # "].employeeId"));
      let table = switch (e.tax) { case (#table(t)) payroll.tables.get(PayLib.tableKey(year, t.table)); case (_) null };
      switch (PayLib.calc(payroll.params, payroll.items, e, x, period, table)) {
        case (#ok(s)) out.add(s);
        case (#err(#invalid(f))) return #err(#invalid(e.name # ": " # f));
        case (#err(err)) return #err(err);
      };
    };
    #ok(out.toArray());
  };

  /// Saves a draft and calculates every payslip. The period is the payment month (AGI).
  public shared ({ caller }) func savePayRun(id : ?Nat, paymentDate : Types.Date, inputs : [Pr.SlipInput]) : async Result.Result<Pr.PayRun, Types.Error> {
    if (not Roles.canPayroll(roles, caller)) return #err(#notAuthorized);
    if (not Dates.isValid(paymentDate)) return #err(#invalid("paymentDate"));
    if (inputs.size() == 0 or inputs.size() > PayLib.MAX_SLIPS) return #err(#invalid("inputs"));
    let slips = switch (calcAll(paymentDate, inputs)) { case (#ok(s)) s; case (#err(e)) return #err(e) };
    let rid = switch (id) {
      case (?x) {
        let r = payroll.runs.get(x) ?? (return #err(#notFound));
        if (r.status != #draft) return #err(#conflict("approved"));
        x;
      };
      case null { let x = payroll.next; payroll.next += 1; x };
    };
    let run : Pr.PayRun = {
      id = rid; period = PayLib.periodOf(paymentDate); paymentDate; inputs; slips; status = #draft;
      voucherId = null; paidVoucherId = null; approvedAt = null; approvedBy = null; updatedAt = Time.now();
    };
    payroll.runs.add(rid, run);
    #ok(run);
  };

  public shared ({ caller }) func deletePayRun(id : Nat) : async Result.Result<(), Types.Error> {
    if (not Roles.canPayroll(roles, caller)) return #err(#notAuthorized);
    let r = payroll.runs.get(id) ?? (return #err(#notFound));
    if (r.status != #draft) return #err(#conflict("approved"));
    payroll.runs.remove(id);
    #ok(());
  };

  /// Recalculates with today's parameters and tables, posts series P and freezes the run.
  public shared ({ caller }) func approvePayRun(id : Nat) : async Result.Result<Pr.PayRun, Types.Error> {
    if (not Roles.canPayroll(roles, caller)) return #err(#notAuthorized);
    let r = payroll.runs.get(id) ?? (return #err(#notFound));
    if (r.status != #draft) return #err(#conflict("approved"));
    if (payroll.agiOf.containsKey(r.period)) return #err(#conflict("agiFiled"));
    let slips = switch (calcAll(r.paymentDate, r.inputs)) { case (#ok(s)) s; case (#err(e)) return #err(e) };
    let vin : Types.VoucherInput = {
      series = PayLib.SERIES; eventDate = r.paymentDate; description = "Lön " # r.period # " (" # slips.size().toText() # " anställda)";
      lines = PayLib.approveLines(payroll.items, slips); attachmentIds = []; counterparty = null;
    };
    let fy = switch (Posting.check(payCtx(), vin)) { case (#ok(fy)) fy; case (#err(e)) return #err(e) };
    let now = Time.now();
    let voucher = Posting.post(payCtx(), fy, vin, #payRun(id), caller, now);
    let saved = { r with slips; status = #approved; voucherId = ?voucher.id; approvedAt = ?now; approvedBy = ?caller; updatedAt = now };
    payroll.runs.add(id, saved);
    ignore Audit.append(audit, now, caller, "payroll.approve", "payRun", ?id, #obj([
      ("period", #text(r.period)), ("slips", #arr(slips.map(func(s : Pr.Payslip) : Canonical.Value = #arr([#int(s.employeeId), #int(s.cash), #int(s.tax), #int(s.net), #int(s.fees)])))),
    ]));
    #ok(saved);
  };

  /// Net pay leaves the bank account (series B, 2820 → 1930).
  public shared ({ caller }) func markPayRunPaid(id : Nat, date : Types.Date) : async Result.Result<Pr.PayRun, Types.Error> {
    if (not Roles.canPayroll(roles, caller)) return #err(#notAuthorized);
    let r = payroll.runs.get(id) ?? (return #err(#notFound));
    if (r.status != #approved) return #err(#conflict("status"));
    if (not Dates.isValid(date) or date > payToday()) return #err(#invalid("date"));
    let net = PayLib.totalNet(r.slips);
    let now = Time.now();
    let paidVoucherId = if (net == 0) null else {
      let vin : Types.VoucherInput = {
        series = PayLib.SERIES_BANK; eventDate = date; description = "Löneutbetalning " # r.period;
        lines = [
          { account = PayLib.NET_PAY; amount = net; vatCode = null; costCenter = null; project = null; quantity = null; text = null },
          { account = PayLib.BANK; amount = -net; vatCode = null; costCenter = null; project = null; quantity = null; text = null },
        ];
        attachmentIds = []; counterparty = null;
      };
      let fy = switch (Posting.check(payCtx(), vin)) { case (#ok(fy)) fy; case (#err(e)) return #err(e) };
      ?Posting.post(payCtx(), fy, vin, #payRun(id), caller, now).id;
    };
    let saved = { r with status = #paid; paidVoucherId; updatedAt = now };
    payroll.runs.add(id, saved);
    #ok(saved);
  };

  // ── AGI (V7) ──

  public shared query ({ caller }) func listAgiReturns() : async Result.Result<[Pr.AgiReturn], Types.Error> {
    if (not Roles.canReadPayroll(roles, caller)) return #err(#notAuthorized);
    #ok(payroll.agi.reverseEntries().map(func((_, a) : (Nat, Pr.AgiReturn)) : Pr.AgiReturn = a).toArray());
  };

  /// Builds the return for a period from its approved runs (none: a zero return).
  public shared ({ caller }) func createAgiReturn(period : Text) : async Result.Result<Pr.AgiReturn, Types.Error> {
    if (not Roles.canPayroll(roles, caller)) return #err(#notAuthorized);
    if (not PayLib.validPeriod(period)) return #err(#invalid("period"));
    if (payroll.agiOf.containsKey(period)) return #err(#conflict("period"));
    let runs = payroll.runs.values().filter(func(r : Pr.PayRun) : Bool = r.period == period).toArray();
    if (runs.any(func(r : Pr.PayRun) : Bool = r.status == #draft)) return #err(#invalid("draftRun"));
    let (individuals, sumFees, sumTax) = PayLib.agi(payroll.params, payroll.employees, runs, period);
    let now = Time.now();
    let id = payroll.next;
    payroll.next += 1;
    let a : Pr.AgiReturn = {
      id; period; runIds = runs.map(func(r : Pr.PayRun) : Nat = r.id); individuals; sumFees; sumTax;
      createdAt = now; createdBy = caller; filedAt = null; receiptRef = null;
    };
    payroll.agi.add(id, a);
    payroll.agiOf.add(period, id);
    ignore Audit.append(audit, now, caller, "agi.create", "agiReturn", ?id, #obj([("period", #text(period)), ("487", #int(sumFees)), ("497", #int(sumTax))]));
    #ok(a);
  };

  public shared ({ caller }) func markAgiFiled(id : Nat, receiptRef : ?Text) : async Result.Result<Pr.AgiReturn, Types.Error> {
    if (not Roles.canPayroll(roles, caller)) return #err(#notAuthorized);
    let a = payroll.agi.get(id) ?? (return #err(#notFound));
    if (a.filedAt != null) return #err(#conflict("filed"));
    let ref = switch (receiptRef) { case (?r) { let t = r.trim(#char ' '); if (t.size() > 100) return #err(#invalid("receiptRef")); if (t == "") null else ?t }; case null null };
    let now = Time.now();
    let saved = { a with filedAt = ?now; receiptRef = ref };
    payroll.agi.add(id, saved);
    ignore Audit.append(audit, now, caller, "agi.filed", "agiReturn", ?id, #obj([("receiptRef", Canonical.opt(ref, Canonical.text))]));
    #ok(saved);
  };

  // ── Växa-stöd (V9) ──

  public shared query ({ caller }) func listVaxa() : async Result.Result<[Pr.VaxaApplication], Types.Error> {
    if (not Roles.canReadPayroll(roles, caller)) return #err(#notAuthorized);
    #ok(payroll.vaxa.values().toArray());
  };

  /// One month for one employee, after the AGI for the period is filed (V9).
  public shared ({ caller }) func createVaxa(period : Text, employeeId : Nat) : async Result.Result<Pr.VaxaApplication, Types.Error> {
    if (not Roles.canPayroll(roles, caller)) return #err(#notAuthorized);
    let e = payroll.employees.get(employeeId) ?? (return #err(#notFound));
    if (e.ownerOrRelated) return #err(#invalid("ownerOrRelated"));
    let from = e.vaxaFrom ?? (return #err(#invalid("vaxaFrom")));
    let index = PayLib.monthsBetween(from, period);
    if (index < 0 or index >= payroll.params.vaxaMonths) return #err(#invalid("vaxaMonths"));
    let a = switch (payroll.agiOf.get(period)) { case (?id) { payroll.agi.get(id) ?? (return #err(#notFound)) }; case null { return #err(#invalid("agiNotFiled")) } };
    if (a.filedAt == null) return #err(#invalid("agiNotFiled"));
    if (PayLib.category(payroll.params, e.birthYear, period) != #full) return #err(#invalid("feeCategory"));
    for (v in payroll.vaxa.values()) if (v.period == period and v.employeeId == employeeId) return #err(#conflict("vaxa"));
    let ind = a.individuals.find(func(i : Pr.AgiIndividual) : Bool = i.employeeId == employeeId) ?? (return #err(#invalid("noPay")));
    let field = func(code : Nat) : Int = switch (ind.fields.find(func(f : Pr.AgiField) : Bool = f.code == code)) { case (?f) f.amount; case null 0 };
    let base = field(11) + field(12) + field(13) - field(19) + field(PayLib.FUEL_FIELD) * 10 / 12;
    let (cap, refund) = PayLib.vaxaRefund(payroll.params, e, base);
    let now = Time.now();
    let id = payroll.next;
    payroll.next += 1;
    let v : Pr.VaxaApplication = { id; period; employeeId; base; cap; refund; monthIndex = Int.abs(index) + 1; status = #draft; createdAt = now; updatedAt = now };
    payroll.vaxa.add(id, v);
    ignore Audit.append(audit, now, caller, "vaxa.create", "vaxa", ?id, #obj([("period", #text(period)), ("employeeId", #int(employeeId)), ("refund", #int(refund))]));
    #ok(v);
  };

  public shared ({ caller }) func setVaxaStatus(id : Nat, status : Pr.VaxaStatus) : async Result.Result<Pr.VaxaApplication, Types.Error> {
    if (not Roles.canPayroll(roles, caller)) return #err(#notAuthorized);
    let v = payroll.vaxa.get(id) ?? (return #err(#notFound));
    let saved = { v with status; updatedAt = Time.now() };
    payroll.vaxa.add(id, saved);
    ignore Audit.append(audit, saved.updatedAt, caller, "vaxa.status", "vaxa", ?id, #obj([("status", #text(switch (status) { case (#draft) "draft"; case (#submitted) "submitted"; case (#approved) "approved"; case (#rejected) "rejected" }))]));
    #ok(saved);
  };
};
