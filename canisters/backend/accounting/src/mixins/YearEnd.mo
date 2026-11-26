// Bokslut (A9b): opening balances, the year-end checklist, unpaid invoices under the cash
// method, the tax calculation and closing voucher (series X), locking the year and the
// transfer of balances to the next year.
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import AssetsLib "../lib/Assets";
import Audit "../lib/Audit";
import Chart "../lib/Chart";
import Dates "../lib/Dates";
import Posting "../lib/Posting";
import Purchase "../lib/Purchase";
import Roles "../lib/Roles";
import SalesLib "../lib/Sales";
import YE "../lib/YearEnd";
import A "../types/Assets";
import P "../types/Purchases";
import Pr "../types/Payroll";
import S "../types/Sales";
import V "../types/Vat";
import Y "../types/YearEnd";
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
  vat : V.Vat,
  payroll : Pr.Payroll,
  assets : A.Assets,
  yearEnd : Y.YearEnd,
) {
  func yeCtx() : Posting.Ctx = { chart; config; ledger; files; counters; audit };

  func openingOf(id : Nat) : [Y.OpeningLine] = yearEnd.opening.get(id) ?? [];
  func closingOf(id : Nat) : Y.Closing = yearEnd.closings.get(id) ?? YE.emptyClosing(id);
  func transferredInto(id : Nat) : Bool = yearEnd.closings.values().any(func(c : Y.Closing) : Bool = c.transferredTo == ?id);
  func nextYear(fy : Types.FiscalYear) : ?Types.FiscalYear = Chart.yearOf(chart, Dates.addDays(fy.end, 1));

  /// Movements of the year per account (no opening balances).
  func movements(fy : Types.FiscalYear) : Map.Map<Nat, Int> = YE.closingBalances(ledger, fy, []);

  // ── Opening balances ──

  public shared query ({ caller }) func openingBalances(fiscalYearId : Nat) : async Result.Result<[Y.OpeningLine], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    if (not chart.fiscalYears.containsKey(fiscalYearId)) return #err(#notFound);
    #ok(openingOf(fiscalYearId));
  };

  /// By hand (setup step 5) for a year no earlier year was transferred into.
  public shared ({ caller }) func setOpeningBalances(fiscalYearId : Nat, lines : [Y.OpeningLine]) : async Result.Result<[Y.OpeningLine], Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let fy = chart.fiscalYears.get(fiscalYearId) ?? (return #err(#notFound));
    if (fy.status == #locked) return #err(#locked("fiscalYear"));
    if (transferredInto(fiscalYearId)) return #err(#conflict("transferred"));
    let clean = switch (YE.checkOpening(chart, lines)) { case (#ok(l)) l; case (#err(e)) return #err(e) };
    yearEnd.opening.add(fiscalYearId, clean);
    ignore Audit.append(audit, Time.now(), caller, "opening.set", "fiscalYear", ?fiscalYearId, #obj([("lines", #int(clean.size()))]));
    #ok(clean);
  };

  // ── Checklist ──

  func cashLines(fy : Types.FiscalYear) : [Types.VoucherLine] {
    let m = Map.empty<Nat, Int>();
    let add = func(ls : [Types.VoucherLine]) { for (l in ls.values()) m.add(l.account, (m.get(l.account) ?? 0) + l.amount) };
    for (d in sales.docs.values()) if (d.kind == #invoice and d.snapshot.issueDate <= fy.end) {
      var open = SalesLib.total(d);
      for (pid in (sales.paymentsOf.get(d.id) ?? []).values()) switch (sales.payments.get(pid)) { case (?p) { if (p.date <= fy.end) open -= p.amount }; case null {} };
      for (cid in (sales.creditsOf.get(d.id) ?? []).values()) switch (sales.docs.get(cid)) { case (?c) { if (c.snapshot.issueDate <= fy.end) open -= SalesLib.total(c) }; case null {} };
      if (open > 0) {
        let p : S.PaymentInput = { salesDocId = d.id; date = fy.end; amount = open; amountSek = null; interest = 0; fees = 0; method = #transfer; reference = null };
        add(SalesLib.paymentLines(p, d.snapshot, chart, true).map(func(l : Types.VoucherLine) : Types.VoucherLine = if (l.account == SalesLib.BANK) { { l with account = SalesLib.RECEIVABLES } } else l));
      };
    };
    for (d in purchases.docs.values()) if (d.kind == #supplierInvoice and d.voucherId == null and d.docDate <= fy.end) {
      var open = d.total;
      for (pid in (purchases.paymentsOf.get(d.id) ?? []).values()) switch (purchases.payments.get(pid)) { case (?p) { if (p.date <= fy.end) open -= p.amount }; case null {} };
      for (cid in (purchases.creditsOf.get(d.id) ?? []).values()) switch (purchases.docs.get(cid)) { case (?c) { if (c.docDate <= fy.end) open -= c.total }; case null {} };
      if (open > 0) add(Purchase.payLines({ purchaseId = d.id; date = fy.end; amount = open; amountSek = null; reference = null }, d, chart, true, Purchase.PAYABLES));
    };
    m.entries().filter(func((_, a) : (Nat, Int)) : Bool = a != 0).map(func((account, amount) : (Nat, Int)) : Types.VoucherLine = {
      account; amount; vatCode = switch (chart.accounts.get(account)) { case (?x) x.vatCode; case null null };
      text = null; costCenter = null; project = null; quantity = null;
    }).toArray();
  };

  func steps(fy : Types.FiscalYear) : [Y.Step] {
    let c = closingOf(fy.id);
    let s = config.settings;
    let bal = YE.closingBalances(ledger, fy, openingOf(fy.id));
    func step(id : Text, state : Y.StepState, amount : ?Int, count : ?Nat) : Y.Step = { id; state; amount; count };
    let done = func(b : Bool) : Y.StepState = if (b) #done else #todo;
    let inventory = if (not s.modules.inventory) step("inventory", #notApplicable, null, null) else step("inventory", done(assets.counts.values().any(func(x : A.Count) : Bool = x.date == fy.end)), null, null);
    let period = AssetsLib.periodOf(fy.end);
    var dueCount = 0;
    for (a in assets.assets.values()) if (AssetsLib.due(a, period) > 0) dueCount += 1;
    let cashOpen = if (s.accountingMethod == #cash and c.cashVoucherId == null) cashLines(fy).size() else 0;
    let vatMissing = YE.missingVatMonths(fy, vat.returns.values().map(func r = (r.from, r.to)).toArray());
    var agiMissing = 0;
    for (r in payroll.runs.values()) if (r.paymentDate >= fy.start and r.paymentDate <= fy.end and r.status != #draft) {
      let filed = switch (payroll.agiOf.get(r.period)) { case (?id) (switch (payroll.agi.get(id)) { case (?x) x.filedAt != null; case null false }); case null false };
      if (not filed) agiMissing += 1;
    };
    let has = func(id : Text) : Bool = c.confirmed.any(func(x : Text) : Bool = x == id);
    [
      inventory,
      step("depreciation", done(dueCount == 0), null, ?dueCount),
      step("accruals", done(has("accruals")), null, null),
      if (s.accountingMethod != #cash) step("cash", #notApplicable, null, null) else step("cash", done(c.cashVoucherId != null or cashOpen == 0), null, ?cashOpen),
      step("bank", done(c.bankStatement != null and c.bankStatement == ?(bal.get(SalesLib.BANK) ?? 0)), ?(bal.get(SalesLib.BANK) ?? 0), null),
      step("taxAccount", done(c.taxStatement != null and c.taxStatement == ?(bal.get(1630) ?? 0)), ?(bal.get(1630) ?? 0), null),
      step("vat", done(vatMissing == 0), null, ?vatMissing),
      if (not s.modules.payroll) step("payroll", #notApplicable, null, null) else step("payroll", done(has("payroll") and agiMissing == 0), null, ?agiMissing),
      step("tax", done(c.closingVoucherId != null), null, null),
      step("lock", done(fy.status == #locked), null, null),
      step("transfer", done(c.transferredTo != null), null, null),
    ];
  };

  func canLock(st : [Y.Step]) : Bool = st.all(func(x : Y.Step) : Bool = x.id == "lock" or x.id == "transfer" or x.state != #todo);

  public shared query ({ caller }) func yearEndStatus(fiscalYearId : Nat) : async Result.Result<Y.Status, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let fy = chart.fiscalYears.get(fiscalYearId) ?? (return #err(#notFound));
    let st = steps(fy);
    #ok({ fiscalYear = fy; steps = st; closing = closingOf(fy.id); canLock = canLock(st) });
  };

  func save(c : Y.Closing) { yearEnd.closings.add(c.fiscalYearId, c) };

  /// Manual steps: "accruals" (periodiseringar booked), "payroll" (liabilities reconciled).
  public shared ({ caller }) func confirmYearEndStep(fiscalYearId : Nat, step : Text, confirmed : Bool) : async Result.Result<Y.Closing, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let fy = chart.fiscalYears.get(fiscalYearId) ?? (return #err(#notFound));
    if (fy.status == #locked) return #err(#locked("fiscalYear"));
    if (step != "accruals" and step != "payroll") return #err(#invalid("step"));
    let c = closingOf(fy.id);
    let rest = c.confirmed.filter(func(x : Text) : Bool = x != step);
    let next = { c with confirmed = if (confirmed) rest.concat([step]) else rest };
    save(next);
    ignore Audit.append(audit, Time.now(), caller, "yearEnd.confirm", "fiscalYear", ?fy.id, #obj([("step", #text(step)), ("confirmed", #bool(confirmed))]));
    #ok(next);
  };

  /// The balance on the bank or tax account statement at the last day of the year.
  public shared ({ caller }) func setStatementBalance(fiscalYearId : Nat, which : { #bank; #taxAccount }, amount : ?Int) : async Result.Result<Y.Closing, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let fy = chart.fiscalYears.get(fiscalYearId) ?? (return #err(#notFound));
    if (fy.status == #locked) return #err(#locked("fiscalYear"));
    let c = closingOf(fy.id);
    let next = switch (which) { case (#bank) { { c with bankStatement = amount } }; case (#taxAccount) { { c with taxStatement = amount } } };
    save(next);
    ignore Audit.append(audit, Time.now(), caller, "yearEnd.statement", "fiscalYear", ?fy.id, #obj([("which", #text(switch (which) { case (#bank) "bank"; case (#taxAccount) "taxAccount" })), ("amount", switch (amount) { case (?a) #int(a); case null #null_ })]));
    #ok(next);
  };

  // ── Cash method ──

  public shared query ({ caller }) func previewCashYearEnd(fiscalYearId : Nat) : async Result.Result<[Types.VoucherLine], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let fy = chart.fiscalYears.get(fiscalYearId) ?? (return #err(#notFound));
    #ok(cashLines(fy));
  };

  /// Books unpaid invoices at the last day of the year and reverses them the day after.
  public shared ({ caller }) func bookCashYearEnd(fiscalYearId : Nat) : async Result.Result<Y.Closing, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (config.settings.accountingMethod != #cash) return #err(#invalid("accountingMethod"));
    let fy = chart.fiscalYears.get(fiscalYearId) ?? (return #err(#notFound));
    let c = closingOf(fy.id);
    if (c.cashVoucherId != null) return #err(#conflict("cashBooked"));
    let lines = cashLines(fy);
    if (lines.size() == 0) return #err(#invalid("nothingOpen"));
    let next = nextYear(fy) ?? (return #err(#invalid("nextYear")));
    let vin : Types.VoucherInput = { series = YE.SERIES; eventDate = fy.end; description = "Obetalda fakturor vid bokslut (kontantmetoden)"; lines; attachmentIds = []; counterparty = null };
    let rin : Types.VoucherInput = { vin with eventDate = next.start; description = "Återföring av obetalda fakturor vid bokslut"; lines = YE.reverse(lines) };
    let f1 = switch (Posting.check(yeCtx(), vin)) { case (#ok(f)) f; case (#err(e)) return #err(e) };
    let f2 = switch (Posting.check(yeCtx(), rin)) { case (#ok(f)) f; case (#err(e)) return #err(e) };
    let now = Time.now();
    let v = Posting.post(yeCtx(), f1, vin, #yearEnd(fy.id), caller, now);
    let r = Posting.post(yeCtx(), f2, rin, #yearEnd(fy.id), caller, now);
    let out = { c with cashVoucherId = ?v.id; cashReversalId = ?r.id };
    save(out);
    ignore Audit.append(audit, now, caller, "yearEnd.cash", "fiscalYear", ?fy.id, #obj([("voucherId", #int(v.id)), ("reversalId", #int(r.id))]));
    #ok(out);
  };

  // ── Tax and closing voucher ──

  public shared query ({ caller }) func previewYearEndTax(fiscalYearId : Nat, input : Y.TaxInput) : async Result.Result<Y.TaxCalc, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let fy = chart.fiscalYears.get(fiscalYearId) ?? (return #err(#notFound));
    YE.calc(chart, fy, movements(fy), openingOf(fy.id), input);
  };

  /// Posts the closing voucher and marks the year "Bokslut pågår".
  public shared ({ caller }) func bookYearEnd(fiscalYearId : Nat, input : Y.TaxInput) : async Result.Result<Y.Closing, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let fy = chart.fiscalYears.get(fiscalYearId) ?? (return #err(#notFound));
    let c = closingOf(fy.id);
    if (c.closingVoucherId != null) return #err(#conflict("yearEndBooked"));
    let calc = switch (YE.calc(chart, fy, movements(fy), openingOf(fy.id), input)) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let lines = YE.closingLines(calc);
    if (lines.size() < 2) return #err(#invalid("nothingToBook"));
    let vin : Types.VoucherInput = { series = YE.SERIES; eventDate = fy.end; description = "Bokslut " # fy.start # " – " # fy.end; lines; attachmentIds = []; counterparty = null };
    let f = switch (Posting.check(yeCtx(), vin)) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let now = Time.now();
    let v = Posting.post(yeCtx(), f, vin, #yearEnd(fy.id), caller, now);
    if (fy.status == #open) chart.fiscalYears.add(fy.id, { fy with status = #closing });
    let out = { c with tax = ?calc; taxInput = ?input; closingVoucherId = ?v.id };
    save(out);
    ignore Audit.append(audit, now, caller, "yearEnd.book", "fiscalYear", ?fy.id, #obj([("voucherId", #int(v.id)), ("tax", #int(calc.tax)), ("fund", #int(calc.fund))]));
    #ok(out);
  };

  // ── Lock and transfer ──

  /// Locks the year and moves the lock date to its last day. Every step must pass first.
  public shared ({ caller }) func lockFiscalYear(fiscalYearId : Nat) : async Result.Result<Types.FiscalYear, Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    let fy = chart.fiscalYears.get(fiscalYearId) ?? (return #err(#notFound));
    let now = Time.now();
    if (fy.end >= Dates.fromTime(now)) return #err(#invalid("notEnded"));
    if (not canLock(steps(fy))) return #err(#conflict("steps"));
    let closing = if (fy.status == #open) { { fy with status = #closing } } else fy;
    switch (Chart.checkStatus(chart, closing, #locked)) { case (#err(e)) return #err(e); case (#ok) {} };
    let locked = { closing with status = #locked; lockedAt = ?now };
    chart.fiscalYears.add(fy.id, locked);
    switch (config.lockDate) { case (?d) { if (d < fy.end) config.lockDate := ?fy.end }; case null { config.lockDate := ?fy.end } };
    ignore Audit.append(audit, now, caller, "fiscalYear.lock", "fiscalYear", ?fy.id, #obj([("lockDate", #text(fy.end))]));
    #ok(locked);
  };

  /// Writes next year's opening balances from this locked year (creating the next year if needed).
  public shared ({ caller }) func transferBalances(fiscalYearId : Nat) : async Result.Result<[Y.OpeningLine], Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    let fy = chart.fiscalYears.get(fiscalYearId) ?? (return #err(#notFound));
    if (fy.status != #locked) return #err(#invalid("notLocked"));
    let c = closingOf(fy.id);
    if (c.transferredTo != null) return #err(#conflict("transferred"));
    let now = Time.now();
    let next = switch (nextYear(fy)) {
      case (?n) n;
      case null {
        let start = Dates.addDays(fy.end, 1);
        let end = switch (Dates.parse(fy.end)) { case (?d) Dates.format({ d with y = d.y + 1; d = Dates.daysInMonth(d.y + 1, d.m) }); case null return #err(#invalid("end")) };
        switch (Chart.checkNewYear(chart, start, end, false)) { case (#err(e)) return #err(e); case (#ok) {} };
        let n : Types.FiscalYear = { id = counters.nextFiscalYear; start; end; status = #open; lockedAt = null };
        counters.nextFiscalYear += 1;
        chart.fiscalYears.add(n.id, n);
        ignore Audit.append(audit, now, caller, "fiscalYear.create", "fiscalYear", ?n.id, #obj([("start", #text(start)), ("end", #text(end)), ("changeover", #bool(false))]));
        n;
      };
    };
    if (next.status == #locked) return #err(#locked("fiscalYear"));
    let lines = YE.transferLines(YE.closingBalances(ledger, fy, openingOf(fy.id)));
    yearEnd.opening.add(next.id, lines);
    save({ c with transferredTo = ?next.id });
    ignore Audit.append(audit, now, caller, "opening.transfer", "fiscalYear", ?next.id, #obj([("from", #int(fy.id)), ("lines", #int(lines.size()))]));
    #ok(lines);
  };

  public shared query ({ caller }) func yearEndTaxParams() : async Result.Result<[Y.TaxParams], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(YE.PARAMS);
  };
};
