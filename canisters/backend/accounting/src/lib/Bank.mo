// Bank and tax-account logic: duplicate keys, rule matching, match suggestions and
// tax-account postings (V24). Pure functions; the mixin owns the state.
import Array "mo:core/Array";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Dates "Dates";
import Invoice "Invoice";
import B "../types/Bank";
import Types "../types";

module {
  public let TAX_ACCOUNT = 1630;
  public let INPUT_VAT = 2641;
  public let SERIES = "B";
  public let MAX_ROWS = 2_000;
  /// Days either side of the due date for an amount match.
  public let DATE_WINDOW = 10;

  func norm(t : Text) : Text = t.trim(#char ' ').toLower();

  /// Two rows are duplicates when date, amount, text and reference agree. A repeated
  /// identical row in the same file gets an ordinal so real repeats are kept.
  public func key(accountId : Nat, r : B.Row, ordinal : Nat) : Text =
    accountId.toText() # "|" # r.date # "|" # r.amount.toText() # "|" # norm(r.text) # "|" # norm(r.reference ?? "") # "|" # ordinal.toText();

  public func taxKey(r : B.TaxRow, ordinal : Nat) : Text =
    r.date # "|" # r.amount.toText() # "|" # norm(r.text) # "|" # ordinal.toText();

  public func checkRow(r : B.Row) : Bool =
    Dates.isValid(r.date) and r.amount != 0 and r.text.size() <= 300 and
    (r.reference ?? "").size() <= 100 and (r.counterparty ?? "").size() <= 200;

  public func ruleMatches(rule : B.Rule, r : B.Row) : Bool {
    let needle = norm(rule.contains);
    needle != "" and (norm(r.text).contains(#text needle) or norm(r.counterparty ?? "").contains(#text needle));
  };

  /// Digits only, for OCR comparison.
  func digits(t : Text) : Text = Text.fromIter(t.chars().filter(func c = c >= '0' and c <= '9'));

  /// An OCR number is found when it appears as its own digit run in the reference or text.
  public func hasOcr(r : B.Row, ocr : Text) : Bool {
    if (ocr.size() < 2) return false;
    for (part in [r.reference ?? "", r.text].values()) {
      for (run in part.split(#predicate(func c = c < '0' or c > '9'))) if (run == ocr) return true;
      if (digits(part) == ocr) return true;
    };
    false;
  };

  public type OpenItem = { id : Nat; title : Text; ocr : ?Text; balanceSek : Int; dueDate : ?Text };

  func near(r : B.Row, due : ?Text) : Bool = switch (due) {
    case (?d) { Int.abs(Dates.days(r.date) - Dates.days(d)) <= DATE_WINDOW };
    case null { true };
  };

  /// Suggestions in order: OCR, then amount (± DATE_WINDOW days of the due date), then rules.
  public func suggest(r : B.Row, invoices : [OpenItem], purchases : [OpenItem], rules : [B.Rule]) : [B.Suggestion] {
    var out : [B.Suggestion] = [];
    let push = func(s : B.Suggestion) { out := out.concat([s]) };
    if (r.amount > 0) {
      for (i in invoices.values()) switch (i.ocr) {
        case (?o) { if (hasOcr(r, o)) push({ reason = #ocr; target = #invoice(i.id); title = i.title; amount = Int.min(r.amount, i.balanceSek) }) };
        case null {};
      };
      if (out.size() == 0) for (i in invoices.values()) if (i.balanceSek == r.amount and near(r, i.dueDate)) push({ reason = #amount; target = #invoice(i.id); title = i.title; amount = r.amount });
    } else {
      for (p in purchases.values()) switch (p.ocr) {
        case (?o) { if (hasOcr(r, o)) push({ reason = #ocr; target = #purchase(p.id); title = p.title; amount = Int.min(-r.amount, p.balanceSek) }) };
        case null {};
      };
      if (out.size() == 0) for (p in purchases.values()) if (p.balanceSek == -r.amount and near(r, p.dueDate)) push({ reason = #amount; target = #purchase(p.id); title = p.title; amount = -r.amount });
    };
    for (rule in rules.values()) if (ruleMatches(rule, r)) push({ reason = #rule; target = #rule(rule.id); title = rule.description; amount = r.amount });
    out;
  };

  func line(account : Nat, amount : Int) : Types.VoucherLine = {
    account; amount; vatCode = null; costCenter = null; project = null; quantity = null; text = null;
  };

  /// Bank line plus the rule's account, with included input VAT split out.
  public func ruleLines(rule : B.Rule, amount : Int, bankAccount : Nat) : [Types.VoucherLine] {
    let vat = if (rule.vatRateBp == 0) 0 else Invoice.divRound(-amount * rule.vatRateBp, 10_000 + rule.vatRateBp);
    let lines = [line(bankAccount, amount), line(rule.account, -amount - vat)];
    if (vat == 0) lines else lines.concat([{ line(INPUT_VAT, vat) with vatCode = ?"I" }]);
  };

  /// The counter account for a tax-account entry, or null when it must be linked to the
  /// bank voucher (#payment, #refund) or chosen by the user (#other).
  public func taxCounter(k : B.TaxKind) : ?Nat = switch (k) {
    case (#vat) ?2650;
    case (#employerFee) ?2731;
    case (#withheldTax) ?2710;
    case (#prelimTax) ?2518;
    case (#interestIncome) ?8314;
    case (#interestCost) ?8423;
    case (#payment or #refund or #other) null;
  };

  /// `amount` is the change of the tax-account balance (+ = in the company's favour).
  public func taxLines(amount : Int, counter : Nat) : [Types.VoucherLine] = [line(TAX_ACCOUNT, amount), line(counter, -amount)];

  public func kindText(k : B.TaxKind) : Text = switch (k) {
    case (#vat) "Moms";
    case (#employerFee) "Arbetsgivaravgifter";
    case (#withheldTax) "Avdragen skatt";
    case (#prelimTax) "Preliminärskatt";
    case (#interestIncome) "Intäktsränta";
    case (#interestCost) "Kostnadsränta";
    case (#payment) "Inbetalning";
    case (#refund) "Utbetalning";
    case (#other) "Övrigt";
  };
};
