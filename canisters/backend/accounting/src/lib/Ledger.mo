// Vouchers: validation, gapless numbering, posting, corrections and balances.
// Posting is synchronous (no await), so a number is taken only by a voucher that
// is stored in the same message: the series never has gaps.
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Chart "Chart";
import Dates "Dates";
import Types "../types";

module {
  type R<T> = Result.Result<T, Types.Error>;

  public let MAX_LINES = 500;
  public let MAX_ATTACHMENTS = 50;

  public func numberKey(series : Text, fiscalYearId : Nat) : Text = series # "/" # fiscalYearId.toText();

  public func balanceKey(fiscalYearId : Nat, account : Nat, month : Nat) : Nat = (fiscalYearId * 10_000 + account) * 100 + month;

  func optText(t : ?Text, max : Nat, field : Text) : R<()> = switch (t) {
    case (?x) { if (x.size() == 0 or x.size() > max) #err(#invalid(field)) else #ok(()) };
    case null { #ok(()) };
  };

  /// Every rule a voucher must meet before it gets a number. Returns its fiscal year.
  public func check(chart : Types.Chart, lockDate : ?Text, v : Types.VoucherInput, attachmentExists : Nat -> Bool) : R<Types.FiscalYear> {
    if (not chart.series.containsKey(v.series)) return #err(#invalid("series"));
    if (not Dates.isValid(v.eventDate)) return #err(#invalid("eventDate"));
    let description = v.description.trim(#char ' ');
    if (description.size() == 0 or description.size() > 500) return #err(#invalid("description"));
    switch (optText(v.counterparty, 200, "counterparty")) { case (#err(e)) { return #err(e) }; case (#ok) {} };
    if (v.lines.size() < 2 or v.lines.size() > MAX_LINES) return #err(#invalid("lines"));
    if (v.attachmentIds.size() > MAX_ATTACHMENTS) return #err(#invalid("attachmentIds"));
    for (id in v.attachmentIds.values()) if (not attachmentExists(id)) return #err(#invalid("attachmentIds"));
    var sum : Int = 0;
    for ((i, l) in v.lines.enumerate()) {
      let field = "lines[" # i.toText() # "]";
      switch (chart.accounts.get(l.account)) {
        case (?a) { if (not a.active) return #err(#invalid(field # ".account")) };
        case null { return #err(#invalid(field # ".account")) };
      };
      if (l.amount == 0) return #err(#invalid(field # ".amount"));
      switch (l.vatCode) {
        case (?c) { if (not chart.vatCodes.containsKey(c)) return #err(#invalid(field # ".vatCode")) };
        case null {};
      };
      for ((t, max, name) in [(l.text, 200, ".text"), (l.costCenter, 50, ".costCenter"), (l.project, 50, ".project")].values()) {
        switch (optText(t, max, field # name)) { case (#err(e)) { return #err(e) }; case (#ok) {} };
      };
      sum += l.amount;
    };
    if (sum != 0) return #err(#invalid("unbalanced"));
    let fy = Chart.yearOf(chart, v.eventDate) ?? (return #err(#invalid("noFiscalYear")));
    if (fy.status == #locked) return #err(#locked("fiscalYear"));
    switch (lockDate) {
      case (?d) { if (v.eventDate <= d) return #err(#locked("lockDate")) };
      case null {};
    };
    #ok(fy);
  };

  /// Takes the next number and stores the voucher. Call only after `check`.
  public func post(
    ledger : Types.Ledger,
    fy : Types.FiscalYear,
    id : Nat,
    v : Types.VoucherInput,
    source : Types.SourceRef,
    corrects : ?Nat,
    by : Principal,
    now : Int,
  ) : Types.Voucher {
    let key = numberKey(v.series, fy.id);
    let number = (ledger.numbering.get(key) ?? 0) + 1;
    ledger.numbering.add(key, number);
    let voucher : Types.Voucher = {
      id;
      fiscalYearId = fy.id;
      series = v.series;
      number;
      eventDate = v.eventDate;
      registeredAt = now;
      description = v.description.trim(#char ' ');
      lines = v.lines;
      source;
      attachmentIds = v.attachmentIds;
      counterparty = v.counterparty;
      corrects;
      createdBy = by;
      retainUntil = Dates.retainUntil(fy.end);
    };
    ledger.vouchers.add(id, voucher);
    let month = Int.abs(Dates.monthIndex(fy.start, v.eventDate));
    for (l in v.lines.values()) {
      let k = balanceKey(fy.id, l.account, month);
      ledger.balances.add(k, (ledger.balances.get(k) ?? 0) + l.amount);
    };
    switch (corrects) {
      case (?orig) { ledger.correctionsOf.add(orig, (ledger.correctionsOf.get(orig) ?? []).concat([id])) };
      case null {};
    };
    voucher;
  };

  /// The lines that cancel a voucher: each amount negated.
  public func reversal(lines : [Types.VoucherLine]) : [Types.VoucherLine] = lines.map(func l = { l with amount = -l.amount });

  public func view(ledger : Types.Ledger, files : Types.Files, v : Types.Voucher) : Types.VoucherView {
    { v with correctedBy = ledger.correctionsOf.get(v.id) ?? []; linkedAttachments = files.voucherLinks.get(v.id) ?? [] };
  };

  /// Per-account net amounts per month of the fiscal year (trial balance input).
  public func balances(ledger : Types.Ledger, fy : Types.FiscalYear) : [Types.BalanceRow] {
    let n = Chart.months(fy);
    let rows = Map.empty<Nat, [var Int]>();
    for ((k, amount) in ledger.balances.entriesFrom(balanceKey(fy.id, 0, 0))) {
      if (k >= balanceKey(fy.id + 1, 0, 0)) return finish(rows);
      let account = (k / 100) % 10_000;
      let month = k % 100;
      let row = switch (rows.get(account)) {
        case (?r) { r };
        case null { let r = Array.repeat<Int>(0, n).toVarArray(); rows.add(account, r); r };
      };
      if (month < n) row[month] += amount;
    };
    finish(rows);
  };

  func finish(rows : Map.Map<Nat, [var Int]>) : [Types.BalanceRow] {
    rows.entries().map(func((account, months)) = { account; months = months.toArray() }).toArray();
  };

};
