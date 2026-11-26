// Purchase bookkeeping: validation and voucher lines per VAT treatment (V22, V23).
// Reverse charge: the buyer computes Swedish VAT on the SEK base, credits it as output
// VAT and debits the same amount as input VAT. Foreign VAT is never deducted.
import Array "mo:core/Array";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Audit "Audit";
import Dates "Dates";
import Encode "Encode";
import Invoice "Invoice";
import Posting "Posting";
import Validate "Validate";
import P "../types/Purchases";
import Types "../types";

module {
  type R<T> = Result.Result<T, Types.Error>;

  public let PAYABLES = 2440;
  public let EMPLOYEES = 2820;
  public let BANK = 1930;
  public let CASH = 1910;
  public let INPUT_VAT = 2641;
  public let INPUT_VAT_FOREIGN = 2645;
  public let INPUT_VAT_RC_SE = 2647;
  public let FX_GAIN = 3960;
  public let FX_LOSS = 7960;
  public let SERIES = "L";
  public let SERIES_BANK = "B";
  public let MAX_LINES = 100;

  /// Output VAT account for a reverse-charge rate (BAS 2026: 2614, 2624, 2634).
  public func rcOutput(rateBp : Nat) : ?Nat = switch (rateBp) {
    case (2500) ?2614;
    case (1200) ?2624;
    case (600) ?2634;
    case (_) null;
  };

  /// Output VAT account on imports (BAS 2026: 2615, 2625, 2635).
  public func importOutput(rateBp : Nat) : ?Nat = switch (rateBp) {
    case (2500) ?2615;
    case (1200) ?2625;
    case (600) ?2635;
    case (_) null;
  };

  public func isReverse(t : P.Treatment) : Bool = switch (t) {
    case (#euGoods or #euServices or #nonEuServices or #seGoodsRC or #seServicesRC) true;
    case (_) false;
  };

  func rcInput(t : P.Treatment) : Nat = switch (t) {
    case (#seGoodsRC or #seServicesRC) INPUT_VAT_RC_SE;
    case (_) INPUT_VAT_FOREIGN;
  };

  func optText(t : ?Text, max : Nat, field : Text) : R<?Text> = switch (t) {
    case (?x) {
      let s = x.trim(#char ' ');
      if (s.size() > max) #err(#invalid(field)) else #ok(if (s == "") null else ?s);
    };
    case null #ok(null);
  };

  public func supplier(s : P.SupplierInput, chart : Types.Chart) : R<P.SupplierInput> {
    let name = s.name.trim(#char ' ');
    if (name == "" or name.size() > 200) return #err(#invalid("name"));
    let country = s.country.trim(#char ' ').toUpper();
    if (country.size() != 2) return #err(#invalid("country"));
    let orgNr = switch (optText(s.orgNr, 20, "orgNr")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let vatNr = switch (optText(s.vatNr, 20, "vatNr")) { case (#ok(x)) { switch (x) { case (?v) ?v.toUpper().replace(#char ' ', ""); case null null } }; case (#err(e)) return #err(e) };
    switch (orgNr) { case (?o) { if (country == "SE" and not Validate.orgNr(o)) return #err(#invalid("orgNr")) }; case null {} };
    let bankgiro = switch (optText(s.bankgiro, 20, "bankgiro")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    switch (bankgiro) { case (?b) { if (not Validate.bankgiro(b)) return #err(#invalid("bankgiro")) }; case null {} };
    let plusgiro = switch (optText(s.plusgiro, 20, "plusgiro")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let iban = switch (optText(s.iban, 40, "iban")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    switch (iban) { case (?i) { if (not Validate.iban(i)) return #err(#invalid("iban")) }; case null {} };
    let bic = switch (optText(s.bic, 11, "bic")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    switch (bic) { case (?b) { if (not Validate.bic(b)) return #err(#invalid("bic")) }; case null {} };
    switch (s.defaultAccount) {
      case (?a) { switch (chart.accounts.get(a)) { case (?acc) { if (not acc.active) return #err(#invalid("defaultAccount")) }; case null { return #err(#invalid("defaultAccount")) } } };
      case null {};
    };
    #ok({ s with name; country; orgNr; vatNr; bankgiro; plusgiro; iban; bic });
  };

  /// Checks a document before it is booked. `attachmentFree` says whether a file may still be used.
  public func check(x : P.PurchaseInput, chart : Types.Chart, hasSupplier : Nat -> Bool, attachmentFree : Nat -> Bool, today : Types.Date) : R<P.PurchaseInput> {
    if (not Dates.isValid(x.docDate) or x.docDate > today) return #err(#invalid("docDate"));
    switch (x.dueDate) { case (?d) { if (not Dates.isValid(d)) return #err(#invalid("dueDate")) }; case null {} };
    let description = x.description.trim(#char ' ');
    if (description == "" or description.size() > 200) return #err(#invalid("description"));
    let docNumber = switch (optText(x.docNumber, 60, "docNumber")) { case (#ok(v)) v; case (#err(e)) return #err(e) };
    let paymentRef = switch (optText(x.paymentRef, 60, "paymentRef")) { case (#ok(v)) v; case (#err(e)) return #err(e) };
    let payee = switch (optText(x.payee, 200, "payee")) { case (#ok(v)) v; case (#err(e)) return #err(e) };
    switch (x.supplierId) { case (?s) { if (not hasSupplier(s)) return #err(#invalid("supplierId")) }; case null {} };
    switch (x.kind) {
      case (#supplierInvoice or #creditNote) { if (x.supplierId == null) return #err(#invalid("supplierId")) };
      case (#receipt) { if (x.paidFrom == null) return #err(#invalid("paidFrom")) };
      case (#expenseClaim) { if (payee == null) return #err(#invalid("payee")) };
    };
    if (x.kind != #creditNote and x.creditOf != null) return #err(#invalid("creditOf"));
    if (not Invoice.validCurrency(x.currency)) return #err(#invalid("currency"));
    if (x.currency != "SEK" and x.fxRate == null) return #err(#invalid("fxRate"));
    if (x.currency == "SEK" and x.fxRate != null) return #err(#invalid("fxRate"));
    switch (x.fxRate) { case (?f) { if (f.rate == 0 or not Dates.isValid(f.date)) return #err(#invalid("fxRate")) }; case null {} };
    // The original document is the evidence for the deduction (ML 13:31–32).
    if (x.attachmentIds.size() == 0 or x.attachmentIds.size() > 10) return #err(#invalid("attachmentIds"));
    for ((i, a) in x.attachmentIds.enumerate()) {
      if (not attachmentFree(a)) return #err(#conflict("attachment"));
      for (j in Nat.range(0, i)) if (x.attachmentIds[j] == a) return #err(#invalid("attachmentIds"));
    };
    if (x.lines.size() == 0 or x.lines.size() > MAX_LINES) return #err(#invalid("lines"));
    if (x.treatment == #importVat) {
      if (x.kind != #supplierInvoice) return #err(#invalid("kind"));
      if (x.currency != "SEK") return #err(#invalid("currency"));
      if (x.total != 0) return #err(#invalid("total"));
      for (l in x.lines.values()) {
        if (l.net <= 0 or l.vat != 0 or importOutput(l.rateBp) == null) return #err(#invalid("amount"));
        switch (optText(l.text, 200, "text")) { case (#ok(_)) {}; case (#err(e)) return #err(e) };
      };
      return #ok({ x with description; docNumber; paymentRef; payee; lines = x.lines.map(func(l : P.PurchaseLine) : P.PurchaseLine = { l with account = INPUT_VAT_FOREIGN }) });
    };
    let reverse = isReverse(x.treatment);
    var sum : Int = 0;
    for (l in x.lines.values()) {
      switch (chart.accounts.get(l.account)) { case (?a) { if (not a.active) return #err(#invalid("account")) }; case null { return #err(#invalid("account")) } };
      if (l.net <= 0 or l.vat < 0) return #err(#invalid("amount"));
      if (l.rateBp != 0 and l.rateBp != 600 and l.rateBp != 1200 and l.rateBp != 2500) return #err(#invalid("rateBp"));
      switch (optText(l.text, 200, "text")) { case (#ok(_)) {}; case (#err(e)) return #err(e) };
      if (reverse and l.rateBp == 0) return #err(#invalid("rateBp"));
      if (not reverse and x.treatment != #domestic and (l.vat != 0 or l.rateBp != 0)) return #err(#invalid("vat"));
      if (reverse and l.vat != 0) return #err(#invalid("vat"));
      if (x.treatment == #domestic and l.rateBp == 0 and l.vat != 0) return #err(#invalid("vat"));
      sum += l.net + l.vat;
    };
    if (sum != x.total) return #err(#invalid("total"));
    #ok({ x with description; docNumber; paymentRef; payee });
  };

  func add(m : Map.Map<Nat, Int>, account : Nat, amount : Int) {
    if (amount != 0) m.add(account, (m.get(account) ?? 0) + amount);
  };

  func line(account : Nat, amount : Int, vatCode : ?Text) : Types.VoucherLine = {
    account; amount; vatCode; costCenter = null; project = null; quantity = null; text = null;
  };

  func vatCodeOf(chart : Types.Chart, acc : Nat) : ?Text {
    for (vc in chart.vatCodes.values()) if (vc.account == ?acc) return ?vc.code;
    switch (chart.accounts.get(acc)) { case (?a) { a.vatCode }; case null { null } };
  };

  func toLines(m : Map.Map<Nat, Int>, chart : Types.Chart) : [Types.VoucherLine] =
    m.entries().filter(func((_, a) : (Nat, Int)) : Bool = a != 0).map(func((acc, a) : (Nat, Int)) : Types.VoucherLine = line(acc, a, vatCodeOf(chart, acc))).toArray();

  /// The debit side in SEK (cost, input VAT) and the reverse-charge pair, before the
  /// credit to payables/bank/employee. Signs are for an invoice; a credit note negates.
  public func debitParts(x : P.PurchaseInput) : (Map.Map<Nat, Int>, Map.Map<Nat, Int>) {
    let cost = Map.empty<Nat, Int>();
    let rc = Map.empty<Nat, Int>();
    let reverse = isReverse(x.treatment);
    for (l in x.lines.values()) {
      let netSek = Invoice.toSek(l.net, x.fxRate);
      if (x.treatment == #importVat) {
        let vat = Invoice.divRound(l.net * l.rateBp, 10_000);
        add(rc, INPUT_VAT_FOREIGN, vat);
        switch (importOutput(l.rateBp)) { case (?o) add(rc, o, -vat); case null {} };
      } else add(cost, l.account, netSek);
      if (x.treatment == #domestic) add(cost, INPUT_VAT, Invoice.toSek(l.vat, x.fxRate));
      if (reverse) {
        let vat = Invoice.divRound(netSek * l.rateBp, 10_000);
        add(rc, rcInput(x.treatment), vat);
        switch (rcOutput(l.rateBp)) { case (?o) add(rc, o, -vat); case null {} };
      };
    };
    (cost, rc);
  };

  func sumOf(m : Map.Map<Nat, Int>) : Int { var t : Int = 0; for (a in m.values()) t += a; t };

  /// The account credited when the document is booked.
  public func creditAccount(x : P.PurchaseInput) : Nat = switch (x.kind) {
    case (#supplierInvoice or #creditNote) PAYABLES;
    case (#expenseClaim) EMPLOYEES;
    case (#receipt) { if (x.paidFrom == ?#cash) CASH else BANK };
  };

  /// The SEK amount the document is booked at on its credit account.
  public func bookedSek(x : P.PurchaseInput) : Int = sumOf(debitParts(x).0);

  public func bookLines(x : P.PurchaseInput, chart : Types.Chart) : [Types.VoucherLine] {
    let (cost, rc) = debitParts(x);
    let m = Map.empty<Nat, Int>();
    for ((a, v) in cost.entries()) add(m, a, v);
    for ((a, v) in rc.entries()) add(m, a, v);
    add(m, creditAccount(x), -sumOf(cost));
    let ls = toLines(m, chart);
    if (x.kind == #creditNote) ls.map(func(l : Types.VoucherLine) : Types.VoucherLine = { l with amount = -l.amount }) else ls;
  };

  /// Payment of a supplier invoice or an expense claim. Under the cash method a supplier
  /// invoice is booked here, pro rata (with its reverse-charge pair).
  public func payLines(p : P.PayInput, x : P.PurchaseInput, chart : Types.Chart, cashMethod : Bool, bankAccount : Nat) : [Types.VoucherLine] {
    let m = Map.empty<Nat, Int>();
    let atDocRate = Invoice.toSek(p.amount, x.fxRate);
    let paidSek = p.amountSek ?? atDocRate;
    add(m, bankAccount, -paidSek);
    if (cashMethod and x.kind == #supplierInvoice) {
      let (cost, rc) = debitParts(x);
      let totalSek = sumOf(cost);
      let entries = cost.entries().toArray();
      var used : Int = 0;
      for ((i, (acc, a)) in entries.enumerate()) {
        let share = if (i + 1 == entries.size()) atDocRate - used else Invoice.divRound(a * atDocRate, totalSek);
        add(m, acc, share);
        used += share;
      };
      for ((acc, a) in rc.entries()) add(m, acc, Invoice.divRound(a * atDocRate, totalSek));
      // Keep the reverse-charge pair equal after rounding.
      var rcSum : Int = 0;
      for ((acc, _) in rc.entries()) rcSum += m.get(acc) ?? 0;
      if (rcSum != 0) add(m, rcInput(x.treatment), -rcSum);
    } else {
      add(m, creditAccount(x), atDocRate);
    };
    let diff = paidSek - atDocRate;
    if (diff > 0) add(m, FX_LOSS, diff) else add(m, FX_GAIN, diff);
    toLines(m, chart);
  };

  public func credited(ps : P.Purchases, id : Nat) : Int {
    var t : Int = 0;
    for (c in (ps.creditsOf.get(id) ?? []).values()) switch (ps.docs.get(c)) { case (?d) { t += d.total }; case null {} };
    t;
  };

  public func paid(ps : P.Purchases, id : Nat) : Int {
    var t : Int = 0;
    for (i in (ps.paymentsOf.get(id) ?? []).values()) switch (ps.payments.get(i)) { case (?x) { t += x.amount }; case null {} };
    t;
  };

  public func payable(k : P.PurchaseKind) : Bool = k == #supplierInvoice or k == #expenseClaim;

  public func view(ps : P.Purchases, d : P.Purchase, today : Types.Date) : P.PurchaseView {
    let cr = if (d.kind == #supplierInvoice) credited(ps, d.id) else 0;
    let pd = paid(ps, d.id);
    let balance = if (payable(d.kind)) d.total - cr - pd else 0;
    let overdue = balance > 0 and (switch (d.dueDate) { case (?due) { due < today }; case null { false } });
    let status : P.Status = if (d.treatment == #importVat) #booked else switch (d.kind) {
      case (#receipt) #paid;
      case (#creditNote) #booked;
      case (_) {
        if (cr >= d.total and cr > 0) #credited
        else if (balance <= 0) #paid
        else if (overdue) #overdue
        else if (pd > 0) #partiallyPaid
        else #booked;
      };
    };
    let supplierName = switch (d.supplierId) {
      case (?s) { switch (ps.suppliers.get(s)) { case (?x) x.name; case null "" } };
      case null { d.payee ?? "" };
    };
    {
      purchase = d; supplierName; status; credited = cr; paid = pd; balance;
      payments = (ps.paymentsOf.get(d.id) ?? []).filterMap(func(i : Nat) : ?P.SupplierPayment = ps.payments.get(i));
      credits = ps.creditsOf.get(d.id) ?? [];
    };
  };

  /// Pays a supplier invoice or expense claim in series B from `bankAccount`.
  public func pay(c : Posting.Ctx, purchases : P.Purchases, p : P.PayInput, bankAccount : Nat, caller : Principal, now : Int, today : Types.Date) : R<P.SupplierPayment> {
    let d = purchases.docs.get(p.purchaseId) ?? (return #err(#notFound));
    if (not payable(d.kind)) return #err(#invalid("purchaseId"));
    if (not Dates.isValid(p.date) or p.date > today) return #err(#invalid("date"));
    let v = view(purchases, d, today);
    if (p.amount <= 0 or p.amount > v.balance) return #err(#invalid("amount"));
    switch (d.currency == "SEK", p.amountSek) {
      case (false, null) { return #err(#invalid("amountSek")) };
      case (_, ?s) { if (s <= 0) return #err(#invalid("amountSek")) };
      case (true, null) {};
    };
    switch (p.reference) { case (?r) { if (r.size() > 100) return #err(#invalid("reference")) }; case null {} };
    let cash = c.config.settings.accountingMethod == #cash and d.kind == #supplierInvoice;
    let vin : Types.VoucherInput = {
      series = SERIES_BANK; eventDate = p.date;
      description = (if (d.kind == #expenseClaim) "Utbetalning utlägg, " else "Betalning leverantörsfaktura " # (d.docNumber ?? "") # ", ") # v.supplierName;
      lines = payLines(p, d, c.chart, cash, bankAccount);
      attachmentIds = if (cash) d.attachmentIds else []; counterparty = ?v.supplierName;
    };
    let fy = switch (Posting.check(c, vin)) { case (#ok(fy)) fy; case (#err(e)) return #err(e) };
    let id = purchases.next;
    purchases.next += 1;
    let voucher = Posting.post(c, fy, vin, #purchase(d.id), caller, now);
    let pay : P.SupplierPayment = { p with id; voucherId = voucher.id; at = now; by = caller };
    purchases.payments.add(id, pay);
    purchases.paymentsOf.add(d.id, (purchases.paymentsOf.get(d.id) ?? []).concat([id]));
    ignore Audit.append(c.audit, now, caller, "purchase.payment", "supplierPayment", ?id, Encode.supplierPayment(p));
    #ok(pay);
  };
};
