// Pay calculation (V7, V8, V10, V11): withholding from the imported tax table or a flat
// rate, employer fees by birth-year category (incl. the youth reduction from April 2026 on
// pay up to 25 000 kr), vacation accrual (procentregeln), voucher lines and the AGI fields.
// AGI fee base per Skatteverket's rule: AeIU = 011 + 012 + 013 + 018/1,2.
import Array "mo:core/Array";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Dates "Dates";
import Invoice "Invoice";
import Pr "../types/Payroll";
import Types "../types";

module {
  type R<T> = Result.Result<T, Types.Error>;

  public let SERIES = "P";
  public let SERIES_BANK = "B";
  public let TAX = 2710;
  public let FEES_PAYABLE = 2731;
  public let FEES = 7510;
  public let NET_PAY = 2820;
  public let VACATION = 2920;
  public let VACATION_CHANGE = 7290;
  public let VACATION_FEES = 7519;
  public let VACATION_FEES_PAYABLE = 2941;
  public let BANK = 1930;
  public let MAX_LINES = 50;
  public let MAX_SLIPS = 200;
  /// Drivmedel (018) is reported at market value × 1.2; fees are on the market value.
  public let FUEL_FIELD = 18;

  // ── Periods and ages ──

  public func validPeriod(p : Text) : Bool {
    if (p.size() != 6) return false;
    switch (Nat.fromText(p)) {
      case (?n) { let m = n % 100; n / 100 >= 2018 and m >= 1 and m <= 12 };
      case null false;
    };
  };

  public func periodYear(p : Text) : Nat = (Nat.fromText(p) ?? 0) / 100;

  public func periodOf(date : Text) : Text = Text.fromIter(date.chars().take(4)) # Text.fromIter(date.chars().drop(5).take(2));

  /// Months from `a` to `b` (YYYYMM), 0 when equal.
  public func monthsBetween(a : Text, b : Text) : Int {
    let x = Nat.fromText(a) ?? 0;
    let y = Nat.fromText(b) ?? 0;
    ((y / 100) * 12 + y % 100 : Int) - ((x / 100) * 12 + x % 100 : Int);
  };

  /// Age at the start of the year (turned during earlier years).
  func ageAtYearStart(year : Nat, birthYear : Nat) : Int = (year : Int) - 1 - (birthYear : Int);

  /// Fee category for a payee in a period (V8): born before `zeroBornBefore` → none;
  /// turned `pensionAge` before the year → pension; youth window and ages → youth.
  public func category(p : Pr.Params, birthYear : Nat, period : Text) : Pr.FeeCategory {
    let year = periodYear(period);
    if (birthYear < p.zeroBornBefore) return #none;
    let age = ageAtYearStart(year, birthYear);
    if (age >= p.pensionAge) return #pension;
    switch (p.youth) {
      case (?y) { if (period >= y.fromPeriod and period <= y.toPeriod and age >= y.minAge and age <= y.maxAge) return #youth };
      case null {};
    };
    #full;
  };

  /// Fees in öre on a monthly base (öre), with the youth split at the cap.
  public func fees(p : Pr.Params, cat : Pr.FeeCategory, base : Int) : Int {
    if (base <= 0) return 0;
    switch (cat) {
      case (#none) 0;
      case (#pension) Invoice.divRound(base * p.feePensionBp, 10_000);
      case (#full) Invoice.divRound(base * p.feeFullBp, 10_000);
      case (#youth) {
        switch (p.youth) {
          case (?y) {
            let low = Int.min(base, y.cap);
            Invoice.divRound(low * y.bp, 10_000) + Invoice.divRound((base - low) * p.feeFullBp, 10_000);
          };
          case null Invoice.divRound(base * p.feeFullBp, 10_000);
        };
      };
    };
  };

  /// The rate a whole amount carries in a category (vacation accrual fees).
  func rateBp(p : Pr.Params, cat : Pr.FeeCategory) : Nat = switch (cat) {
    case (#none) 0;
    case (#pension) p.feePensionBp;
    case (#youth) { switch (p.youth) { case (?y) y.bp; case null p.feeFullBp } };
    case (#full) p.feeFullBp;
  };

  // ── Tax tables (V10) ──

  public func tableKey(year : Nat, table : Nat) : Nat = year * 100 + table;

  public func checkRows(rows : [Pr.TaxTableRow]) : R<()> {
    if (rows.size() == 0 or rows.size() > 2_000) return #err(#invalid("rows"));
    var last = 0;
    for (r in rows.values()) {
      if (r.cols.size() < 6 or r.cols.size() > 7 or r.from > r.to or (r.from <= last and last > 0)) return #err(#invalid("rows"));
      last := r.to;
    };
    #ok(());
  };

  /// Withholding in whole kronor for a monthly taxable income (whole kronor). Amount rows
  /// give kronor; percent rows (above 80 000 kr) give a percentage of the income, öre
  /// dropped; above the last row the last percentage applies.
  public func tableTax(t : Pr.TaxTable, column : Nat, income : Nat) : ?Nat {
    if (column < 1 or column > 7) return null;
    if (income == 0) return ?0;
    var lastPercent : ?Nat = null;
    for (r in t.rows.values()) {
      if (r.cols.size() < column) return null;
      let v = r.cols[column - 1];
      if (income >= r.from and income <= r.to) return ?(if (r.percent) income * v / 100 else v);
      if (r.percent) lastPercent := ?v;
    };
    switch (lastPercent) { case (?v) ?(income * v / 100); case null null };
  };

  // ── Validation ──

  func optText(t : ?Text, max : Nat, field : Text) : R<?Text> = switch (t) {
    case (?x) { let s = x.trim(#char ' '); if (s.size() > max) #err(#invalid(field)) else #ok(if (s == "") null else ?s) };
    case null #ok(null);
  };

  public func employee(e : Pr.EmployeeInput, year : Nat) : R<Pr.EmployeeInput> {
    let name = e.name.trim(#char ' ');
    if (name == "" or name.size() > 100) return #err(#invalid("name"));
    if (e.birthYear < 1900 or e.birthYear > year) return #err(#invalid("birthYear"));
    if (not Dates.isValid(e.employedFrom)) return #err(#invalid("employedFrom"));
    switch (e.employedTo) { case (?d) { if (not Dates.isValid(d) or d < e.employedFrom) return #err(#invalid("employedTo")) }; case null {} };
    switch (e.pay) { case (#monthly(m) or #hourly(m)) { if (m < 0) return #err(#invalid("pay")) } };
    switch (e.tax) {
      case (#table(t)) { if (t.table < 29 or t.table > 42 or t.column < 1 or t.column > 7) return #err(#invalid("tax")) };
      case (#flat(bp)) { if (bp == 0 or bp > 10_000) return #err(#invalid("tax")) };
      case (#none) {};
    };
    if (e.vacationDays > 365) return #err(#invalid("vacationDays"));
    switch (e.vaxaFrom) { case (?v) { if (not validPeriod(v) or e.ownerOrRelated) return #err(#invalid("vaxaFrom")) }; case null {} };
    if (e.personnummerEnc.size() < 12 or e.personnummerEnc.size() > 512) return #err(#invalid("personnummer"));
    for (b in [e.addressEnc, e.bankAccountEnc].values()) switch (b) { case (?x) { if (x.size() > 4_096) return #err(#invalid("pii")) }; case null {} };
    let email = switch (optText(e.email, 254, "email")) { case (#ok(v)) v; case (#err(x)) return #err(x) };
    let jamkning = switch (optText(e.jamkning, 200, "jamkning")) { case (#ok(v)) v; case (#err(x)) return #err(x) };
    let costCenter = switch (optText(e.costCenter, 50, "costCenter")) { case (#ok(v)) v; case (#err(x)) return #err(x) };
    let workplaceStreet = switch (optText(e.workplaceStreet, 50, "workplaceStreet")) { case (#ok(v)) v; case (#err(x)) return #err(x) };
    let workplaceCity = switch (optText(e.workplaceCity, 50, "workplaceCity")) { case (#ok(v)) v; case (#err(x)) return #err(x) };
    #ok({ e with name; email; jamkning; costCenter; workplaceStreet; workplaceCity });
  };

  public func item(i : Pr.PayItem, chart : Types.Chart) : R<Pr.PayItem> {
    let code = i.code.trim(#char ' ').toUpper();
    if (code.size() == 0 or code.size() > 10) return #err(#invalid("code"));
    let name = i.name.trim(#char ' ');
    if (name == "" or name.size() > 80) return #err(#invalid("name"));
    switch (i.agiField) {
      case (?f) {
        let ok = switch (i.kind) {
          case (#cash) { f == 11 };
          case (#benefit) { f == 12 or f == 13 or f == FUEL_FIELD };
          case (#taxFree) { f == 20 or f == 50 or f == 51 };
          case (#netDeduction) { false };
        };
        if (not ok) return #err(#invalid("agiField"));
      };
      case null { if (i.kind == #cash or i.kind == #benefit) return #err(#invalid("agiField")) };
    };
    switch (i.kind, i.account) {
      case (#benefit, ?_) { return #err(#invalid("account")) };
      case (#benefit, null) {};
      case (_, null) { return #err(#invalid("account")) };
      case (_, ?a) { switch (chart.accounts.get(a)) { case (?acc) { if (not acc.active) return #err(#invalid("account")) }; case null { return #err(#invalid("account")) } } };
    };
    #ok({ i with code; name });
  };

  // ── Calculation ──

  func addField(m : Map.Map<Nat, Int>, code : Nat, v : Int) { m.add(code, (m.get(code) ?? 0) + v) };

  /// One payslip. `table` is the tax table for the payment year when the employee has one.
  public func calc(p : Pr.Params, items : Map.Map<Text, Pr.PayItem>, e : Pr.Employee, input : Pr.SlipInput, period : Text, table : ?Pr.TaxTable) : R<Pr.Payslip> {
    if (input.lines.size() > MAX_LINES) return #err(#invalid("lines"));
    var cash : Int = 0;
    var benefits : Int = 0;
    var fuel : Int = 0;
    var taxFree : Int = 0;
    var netDeductions : Int = 0;
    var vacationBase : Int = 0;
    let fields = Map.empty<Nat, Int>();
    for ((i, l) in input.lines.enumerate()) {
      let it = items.get(l.code) ?? (return #err(#invalid("lines[" # i.toText() # "].code")));
      if (l.amount == 0) return #err(#invalid("lines[" # i.toText() # "].amount"));
      switch (l.text) { case (?t) { if (t.size() > 100) return #err(#invalid("lines[" # i.toText() # "].text")) }; case null {} };
      switch (it.kind) {
        case (#cash) { cash += l.amount; if (it.vacationBearing) vacationBase += l.amount };
        case (#benefit) { if (it.agiField == ?FUEL_FIELD) fuel += l.amount else benefits += l.amount };
        case (#taxFree) { taxFree += l.amount };
        case (#netDeduction) { netDeductions += l.amount };
      };
      switch (it.agiField) {
        case (?f) { if (f == 50 or f == 51) fields.add(f, 1) else addField(fields, f, l.amount) };
        case null {};
      };
    };
    if (benefits < 0 or fuel < 0 or taxFree < 0) return #err(#invalid("lines"));
    let taxableKr = Int.max(0, (cash + benefits + fuel) / 100);
    let taxKr : Int = switch (input.taxOverride) {
      case (?o) { if (o < 0) return #err(#invalid("taxOverride")); o / 100 };
      case null {
        switch (e.tax) {
          case (#none) 0;
          case (#flat(bp)) taxableKr * bp / 10_000;
          case (#table(t)) {
            let tt = table ?? (return #err(#invalid("taxTable")));
            if (tt.table != t.table) return #err(#invalid("taxTable"));
            tableTax(tt, t.column, Int.abs(taxableKr)) ?? (return #err(#invalid("taxTable")));
          };
        };
      };
    };
    let tax = taxKr * 100;
    let net = cash + taxFree - tax - netDeductions;
    let feeBase = cash + benefits + Invoice.divRound(fuel * 10, 12);
    let cat = category(p, e.birthYear, period);
    let f = fees(p, cat, feeBase);
    let accrual = if (e.vacationRule == #procentregeln and vacationBase > 0) Invoice.divRound(vacationBase * p.vacationPercentBp, 10_000) else 0;
    let accrualFees = Invoice.divRound(accrual * rateBp(p, cat), 10_000);
    // AGI fields in whole kronor (öre dropped), tax in 001.
    let agi = List.empty<Pr.AgiField>();
    for ((code, v) in fields.entries()) {
      let kr = if (code == 50 or code == 51) v else v / 100;
      if (kr != 0) agi.add({ code; amount = kr });
    };
    if (taxKr != 0) agi.add({ code = 1; amount = taxKr });
    #ok({
      employeeId = e.id; name = e.name; lines = input.lines; cash; benefits = benefits + fuel; taxFree; netDeductions; tax; net;
      feeBase; feeCategory = cat; fees = f; vacationAccrual = accrual; vacationFees = accrualFees; agi = agi.toArray();
    });
  };

  // ── Postings ──

  func vline(account : Nat, amount : Int) : Types.VoucherLine = {
    account; amount; vatCode = null; costCenter = null; project = null; quantity = null; text = null;
  };

  func add(m : Map.Map<Nat, Int>, account : Nat, amount : Int) {
    if (amount != 0) m.add(account, (m.get(account) ?? 0) + amount);
  };

  /// Approval voucher (series P): pay items to their accounts, tax 2710, fees 7510 → 2731,
  /// net pay owed on 2820, vacation accrual 7290 → 2920 and its fees 7519 → 2941.
  public func approveLines(items : Map.Map<Text, Pr.PayItem>, slips : [Pr.Payslip]) : [Types.VoucherLine] {
    let m = Map.empty<Nat, Int>();
    for (s in slips.values()) {
      for (l in s.lines.values()) {
        switch (items.get(l.code)) {
          case (?it) {
            switch (it.kind, it.account) {
              case ((#cash or #taxFree), ?a) add(m, a, l.amount);
              case (#netDeduction, ?a) add(m, a, -l.amount);
              case (_, _) {};
            };
          };
          case null {};
        };
      };
      add(m, TAX, -s.tax);
      add(m, NET_PAY, -s.net);
      add(m, FEES, s.fees);
      add(m, FEES_PAYABLE, -s.fees);
      add(m, VACATION_CHANGE, s.vacationAccrual);
      add(m, VACATION, -s.vacationAccrual);
      add(m, VACATION_FEES, s.vacationFees);
      add(m, VACATION_FEES_PAYABLE, -s.vacationFees);
    };
    m.entries().filter(func((_, a) : (Nat, Int)) : Bool = a != 0).map(func((a, v) : (Nat, Int)) : Types.VoucherLine = vline(a, v)).toArray();
  };

  public func totalNet(slips : [Pr.Payslip]) : Int { var t : Int = 0; for (s in slips.values()) t += s.net; t };

  // ── AGI (V7) ──

  /// Individuppgifter per employee over the approved runs of a period, and the HU sums:
  /// 487 from Skatteverket's rule on the whole-kronor fields per age category, 497 the sum
  /// of 001. Öre in the summed fees are dropped (Exempelfil 15 gives 18 881).
  public func agi(p : Pr.Params, employees : Map.Map<Nat, Pr.Employee>, runs : [Pr.PayRun], period : Text) : ([Pr.AgiIndividual], Int, Int) {
    let per = Map.empty<Nat, Map.Map<Nat, Int>>();
    for (r in runs.values()) for (s in r.slips.values()) {
      let m = switch (per.get(s.employeeId)) { case (?x) x; case null { let x = Map.empty<Nat, Int>(); per.add(s.employeeId, x); x } };
      for (f in s.agi.values()) {
        if (f.code == 50 or f.code == 51) m.add(f.code, 1) else m.add(f.code, (m.get(f.code) ?? 0) + f.amount);
      };
    };
    let out = List.empty<Pr.AgiIndividual>();
    var feesExact : Int = 0; // öre × 100 (basis points of a krona)
    var tax : Int = 0;
    for ((id, m) in per.entries()) {
      let fields = m.entries().filter(func((_, v) : (Nat, Int)) : Bool = v != 0).map(func((code, amount) : (Nat, Int)) : Pr.AgiField = { code; amount }).toArray();
      out.add({ employeeId = id; specNr = id; fields });
      tax += m.get(1) ?? 0;
      let base = (m.get(11) ?? 0) + (m.get(12) ?? 0) + (m.get(13) ?? 0) - (m.get(19) ?? 0);
      let fuel = m.get(FUEL_FIELD) ?? 0;
      switch (employees.get(id)) {
        case (?e) {
          // In kronor × 12 so 018/1.2 stays exact: (12·base + 10·fuel) / 12.
          let base12 = Int.max(0, base * 12 + fuel * 10);
          feesExact += feeBp12(p, category(p, e.birthYear, period), base12);
        };
        case null {};
      };
    };
    (out.toArray(), feesExact / 120_000, tax);
  };

  /// Fees × 12 × 10 000 for a base given × 12 (kronor), so nothing is rounded until the sum.
  func feeBp12(p : Pr.Params, cat : Pr.FeeCategory, base12 : Int) : Int = switch (cat) {
    case (#none) 0;
    case (#pension) base12 * p.feePensionBp;
    case (#full) base12 * p.feeFullBp;
    case (#youth) {
      switch (p.youth) {
        case (?y) { let cap12 = (y.cap / 100) * 12; let low = Int.min(base12, cap12); low * y.bp + (base12 - low) * p.feeFullBp };
        case null base12 * p.feeFullBp;
      };
    };
  };

  // ── Växa-stöd (V9) ──

  /// Refund for one employee and month, in kronor: (full − pension rate) on the fee base up
  /// to the cap (35 000 kr, or 25 000 kr for employments that started before 1 May 2024).
  public func vaxaRefund(p : Pr.Params, e : Pr.Employee, baseKr : Int) : (Int, Int) {
    let cap = (if (e.employedFrom < "2024-05-01") p.vaxaCapBefore202405 else p.vaxaCap) / 100;
    (cap, Int.min(Int.max(baseKr, 0), cap) * p.vaxaRefundBp / 10_000);
  };
};
