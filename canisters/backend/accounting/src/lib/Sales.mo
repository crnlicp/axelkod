// Sales bookkeeping: the voucher lines of invoices, credit notes and payments
// (invoice or cash method), and the computed state of a document (C9).
import Array "mo:core/Array";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Invoice "Invoice";
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
  public func issueLines(x : S.Snapshot, chart : Types.Chart) : [Types.VoucherLine] {
    let m = creditParts(x, chart);
    var total : Int = 0;
    for (a in m.values()) total -= a;
    add(m, RECEIVABLES, total);
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

  public func total(d : S.SalesDoc) : Int = d.snapshot.total;

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
    let balance = if (d.kind == #invoice) total(d) - cr - pd else 0;
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
      doc = d; status; credited = cr; paid = pd; balance; overdue;
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
};
