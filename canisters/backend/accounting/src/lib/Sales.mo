// Sales bookkeeping: the voucher lines of invoices, credit notes and payments
// (invoice or cash method), and the computed state of a document (C9).
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
import RotRut "RotRut";
import S "../types/Sales";
import Types "../types";

module {
  public let RECEIVABLES = 1510;
  public let BANK = 1930;
  public let INTEREST = 8313;
  public let FEES = 3990;
  public let FX_GAIN = 3960;
  public let FX_LOSS = 7960;
  public let SERIES_SALES = "F";
  public let SERIES_BANK = "B";

  func line(account : Nat, amount : Int, vatCode : ?Text, text : ?Text) : Types.VoucherLine = {
    account; amount; vatCode; costCenter = null; project = null; quantity = null; text;
  };

  /// Adds `amount` to `account` in an ordered map, so lines come out sorted and merged.
  func add(m : Map.Map<Nat, Int>, account : Nat, amount : Int) {
    if (amount != 0) m.add(account, (m.get(account) ?? 0) + amount);
  };

  /// Revenue and VAT of a document in SEK, as credit amounts (negative) per account.
  public func creditParts(x : S.Snapshot, chart : Types.Chart) : Map.Map<Nat, Int> {
    let m = Map.empty<Nat, Int>();
    for (l in x.lines.values()) add(m, l.account, -Invoice.toSek(l.net, x.fxRate));
    for (r in x.vat.values()) {
      switch (chart.vatCodes.get(r.vatCode)) {
        case (?vc) { switch (vc.account) { case (?a) { add(m, a, -Invoice.toSek(r.vat, x.fxRate)) }; case null {} } };
        case null {};
      };
    };
    m;
  };

  func toLines(m : Map.Map<Nat, Int>, vatOf : Nat -> ?Text) : [Types.VoucherLine] =
    m.entries().filter(func((_, a) : (Nat, Int)) : Bool = a != 0).map(func((acc, a) : (Nat, Int)) : Types.VoucherLine = line(acc, a, vatOf(acc), null)).toArray();

  func vatCodeFor(chart : Types.Chart) : Nat -> ?Text = func(acc : Nat) : ?Text {
    for (vc in chart.vatCodes.values()) if (vc.account == ?acc) return ?vc.code;
    switch (chart.accounts.get(acc)) { case (?a) { a.vatCode }; case null { null } };
  };

  /// Invoice method: receivable against revenue and VAT. A credit note is the reverse.
  /// ROT/RUT: the deduction is a receivable on Skatteverket (1513), the rest on the customer.
  public func issueLines(x : S.Snapshot, chart : Types.Chart) : [Types.VoucherLine] {
    let m = creditParts(x, chart);
    var total : Int = 0;
    for (a in m.values()) total -= a;
    let ded = RotRut.deduction(x);
    add(m, RECEIVABLES, total - ded);
    add(m, RotRut.SHARED_RECEIVABLE, ded);
    let lines = toLines(m, vatCodeFor(chart));
    if (x.kind == #creditNote) lines.map(func(l : Types.VoucherLine) : Types.VoucherLine = { l with amount = -l.amount }) else lines;
  };

  /// Splits `paid` (document currency) over the document's revenue and VAT in SEK, pro rata;
  /// the last account takes the rounding remainder. Used by the cash method.
  public func proRata(x : S.Snapshot, chart : Types.Chart, paid : Int) : Map.Map<Nat, Int> {
    let parts = creditParts(x, chart);
    let totalSek = Invoice.toSek(x.total, x.fxRate);
    let paidSek = Invoice.toSek(paid, x.fxRate);
    let out = Map.empty<Nat, Int>();
    if (totalSek == 0) return out;
    var used : Int = 0;
    let entries = parts.entries().toArray();
    for ((i, (acc, a)) in entries.enumerate()) {
      let share = if (i + 1 == entries.size()) -paidSek - used else Invoice.divRound(a * paidSek, totalSek);
      add(out, acc, share);
      used += share;
    };
    out;
  };

  /// Payment voucher: bank in, receivable (or revenue/VAT under the cash method) out,
  /// interest and fees as income, an FX difference as gain or loss.
  public func paymentLines(p : S.PaymentInput, x : S.Snapshot, chart : Types.Chart, cashMethod : Bool) : [Types.VoucherLine] {
    let m = Map.empty<Nat, Int>();
    let atInvoiceRate = Invoice.toSek(p.amount, x.fxRate);
    let received = switch (p.amountSek) { case (?s) { s }; case null { atInvoiceRate } };
    add(m, BANK, received + p.interest + p.fees);
    if (cashMethod) { for ((acc, a) in proRata(x, chart, p.amount).entries()) add(m, acc, a) } else add(m, RECEIVABLES, -atInvoiceRate);
    add(m, INTEREST, -p.interest);
    add(m, FEES, -p.fees);
    let diff = received - atInvoiceRate;
    if (diff > 0) add(m, FX_GAIN, -diff) else add(m, FX_LOSS, -diff);
    toLines(m, vatCodeFor(chart));
  };

  /// Cash method, ROT/RUT payout: bank in, revenue and VAT out pro rata to the invoice.
  public func husPayoutLines(x : S.Snapshot, chart : Types.Chart, approved : Int, bankAccount : Nat) : [Types.VoucherLine] {
    let m = proRata(x, chart, approved);
    add(m, bankAccount, approved);
    toLines(m, vatCodeFor(chart));
  };

  /// What the customer is invoiced for (the total less a ROT/RUT deduction).
  public func total(d : S.SalesDoc) : Int = RotRut.customerPart(d.snapshot);

  public func credited(sales : S.Sales, id : Nat) : Int {
    var t : Int = 0;
    for (c in (sales.creditsOf.get(id) ?? []).values()) switch (sales.docs.get(c)) { case (?d) { t += total(d) }; case null {} };
    t;
  };

  public func paid(sales : S.Sales, id : Nat) : Int {
    var t : Int = 0;
    for (p in (sales.paymentsOf.get(id) ?? []).values()) switch (sales.payments.get(p)) { case (?x) { t += x.amount }; case null {} };
    t;
  };

  public func view(sales : S.Sales, d : S.SalesDoc, today : Types.Date) : S.DocView {
    let cr = if (d.kind == #invoice) credited(sales, d.id) else 0;
    let pd = paid(sales, d.id);
    let payable = total(d) + (sales.husAdjust.get(d.id) ?? 0);
    let balance = if (d.kind == #invoice) payable - cr - pd else 0;
    let overdue = d.kind == #invoice and balance > 0 and (switch (d.snapshot.dueDate) { case (?due) { due < today }; case null { false } });
    let status : S.DocStatus = switch (d.kind) {
      case (#quote) {
        let s = sales.quoteStatus.get(d.id) ?? #sent;
        let expired = s == #sent and (switch (d.snapshot.validUntil) { case (?v) { v < today }; case null { false } });
        #quote(if (expired) #expired else s);
      };
      case (#creditNote) { #issued };
      case (#invoice) {
        if (cr >= total(d) and cr > 0) #credited
        else if (balance <= 0) #paid
        else if (overdue) #overdue
        else if (pd > 0) #partiallyPaid
        else #issued;
      };
    };
    {
      doc = d; status; credited = cr; paid = pd; payable; balance; overdue;
      credits = sales.creditsOf.get(d.id) ?? [];
      payments = (sales.paymentsOf.get(d.id) ?? []).filterMap(func(i : Nat) : ?S.Payment = sales.payments.get(i));
      reminders = sales.remindersOf.get(d.id) ?? [];
      invoices = sales.invoicesOf.get(d.id) ?? [];
    };
  };

  public func summary(v : S.DocView) : S.DocSummary {
    let x = v.doc.snapshot;
    {
      id = v.doc.id; kind = v.doc.kind; number = v.doc.number; customerName = x.buyer.name; issueDate = x.issueDate;
      dueDate = switch (v.doc.kind) { case (#quote) x.validUntil; case (_) x.dueDate }; currency = x.currency;
      total = x.total; balance = v.balance; status = v.status;
    };
  };

  /// A credit note or invoice line from a snapshot line (to prefill a draft).
  public func docLine(l : S.SnapLine) : S.DocLine = {
    itemId = null; description = l.description; quantity = l.quantity; unit = l.unit; unitPrice = l.unitPrice;
    discountBp = l.discountBp; vatCode = l.vatCode; account = l.account;
  };

  public func nextNumber(sales : S.Sales, key : Text) : Nat = (sales.numbering.get(key) ?? 0) + 1;

  /// Registers a payment on an invoice and posts it in series B (shared by the payment
  /// dialog and bank matching). `bankAccount` is the ledger account the money came in on.
  public func pay(c : Posting.Ctx, sales : S.Sales, p : S.PaymentInput, bankAccount : Nat, caller : Principal, now : Int, today : Types.Date, cashMethod : Bool) : Result.Result<S.Payment, Types.Error> {
    let d = switch (sales.docs.get(p.salesDocId)) { case (?d) d; case null { return #err(#notFound) } };
    if (d.kind != #invoice) return #err(#invalid("salesDocId"));
    if (not Dates.isValid(p.date) or p.date > today) return #err(#invalid("date"));
    let v = view(sales, d, today);
    if (p.amount <= 0 or p.amount > v.balance) return #err(#invalid("amount"));
    if (p.interest < 0 or p.fees < 0) return #err(#invalid("amount"));
    switch (d.snapshot.currency == "SEK", p.amountSek) {
      case (false, null) { return #err(#invalid("amountSek")) };
      case (_, ?s) { if (s <= 0) return #err(#invalid("amountSek")) };
      case (true, null) {};
    };
    switch (p.reference) { case (?r) { if (r.size() > 100) return #err(#invalid("reference")) }; case null {} };
    let lines = paymentLines(p, d.snapshot, c.chart, cashMethod).map(func(l : Types.VoucherLine) : Types.VoucherLine = if (l.account == BANK) { { l with account = bankAccount } } else l);
    let vin : Types.VoucherInput = {
      series = SERIES_BANK; eventDate = p.date;
      description = "Inbetalning faktura " # d.number.toText() # ", " # d.snapshot.buyer.name;
      lines; attachmentIds = []; counterparty = ?d.snapshot.buyer.name;
    };
    let fy = switch (Posting.check(c, vin)) { case (#ok(fy)) fy; case (#err(e)) return #err(e) };
    let pid = sales.next;
    sales.next += 1;
    let voucher = Posting.post(c, fy, vin, #payment(pid), caller, now);
    let payment : S.Payment = { p with id = pid; voucherId = voucher.id; at = now; by = caller };
    sales.payments.add(pid, payment);
    sales.paymentsOf.add(d.id, (sales.paymentsOf.get(d.id) ?? []).concat([pid]));
    ignore Audit.append(c.audit, now, caller, "sales.payment", "payment", ?pid, Encode.payment(p));
    #ok(payment);
  };
};
