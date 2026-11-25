// Pure invoice rules: line and VAT arithmetic, the mandatory content of ML 17 kap.
// 24–29 §§ and ABL 28:5, legal notes per VAT treatment, OCR and late interest.
// Sources: docs/accounting/sources.md (V1, V2, V13, V14).
import Array "mo:core/Array";
import Char "mo:core/Char";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Result "mo:core/Result";
import Text "mo:core/Text";
import VarArray "mo:core/VarArray";
import Dates "Dates";
import Validate "Validate";
import S "../types/Sales";
import Types "../types";

module {
  type R<T> = Result.Result<T, Types.Error>;

  public let MAX_LINES = 200;
  public let TEMPLATE = { invoice = "invoice@1"; creditNote = "credit-note@1"; quote = "quote@1" };

  /// Rounds a / b half away from zero (b > 0).
  public func divRound(a : Int, b : Int) : Int {
    let q = a / b;
    let r = a % b;
    if (Int.abs(r) * 2 >= Int.abs(b)) { if (a >= 0) q + 1 else q - 1 } else q;
  };

  /// quantity (thousandths) × unit price, less the discount, rounded to the minor unit.
  public func lineNet(l : S.DocLine) : Int = divRound(l.quantity * l.unitPrice * (10_000 - l.discountBp), 1_000 * 10_000);

  /// Converts an amount in the document currency to öre with the stored rate (× 1 000 000).
  public func toSek(amount : Int, fx : ?S.FxRate) : Int = switch (fx) {
    case (?f) { divRound(amount * f.rate, 1_000_000) };
    case null { amount };
  };

  func isSale(k : Types.VatKind) : Bool = switch (k) {
    case (#outputDomestic or #euGoodsSale or #euServiceSale or #exportGoods or #exportServices or #exempt or #buyerLiableSE) { true };
    case (_) { false };
  };

  /// The buyer must give a VAT number when liable for the VAT, or for an intra-EU
  /// goods sale (ML 17:24 4).
  func needsBuyerVatNr(k : Types.VatKind) : Bool = switch (k) {
    case (#euGoodsSale or #euServiceSale or #buyerLiableSE) { true };
    case (_) { false };
  };

  /// EN 16931 tax category (Peppol BIS 3.0, UNCL5305 subset).
  public func category(k : Types.VatKind) : Text = switch (k) {
    case (#outputDomestic) { "S" };
    case (#euGoodsSale) { "K" };
    case (#euServiceSale or #buyerLiableSE) { "AE" };
    case (#exportGoods) { "G" };
    case (#exportServices) { "O" };
    case (#exempt) { "E" };
    case (_) { "S" };
  };

  /// Texts the invoice must carry for the VAT treatment (ML 17:24 13–14), in Skatteverket's wording.
  func notesFor(k : Types.VatKind, lang : S.Lang) : ?Text = switch (k, lang) {
    case ((#euServiceSale or #buyerLiableSE), #sv) { ?"Omvänd betalningsskyldighet" };
    case ((#euServiceSale or #buyerLiableSE), #en) { ?"Reverse charge" };
    case (#euGoodsSale, #sv) { ?"Undantagen från skatteplikt, 10 kap. 42 § ML" };
    case (#euGoodsSale, #en) { ?"Exempt, Article 138 of the VAT directive" };
    case (#exportGoods, #sv) { ?"Undantagen från skatteplikt" };
    case (#exportGoods, #en) { ?"Exempt" };
    case (#exempt, #sv) { ?"Undantag från momsplikt" };
    case (#exempt, #en) { ?"Exempt from VAT" };
    case (_) { null };
  };

  func trimmed(t : Text) : Text = t.trim(#char ' ');

  func optClean(t : ?Text, max : Nat, field : Text) : R<?Text> = switch (t) {
    case (?x) {
      let v = trimmed(x);
      if (v.size() == 0) #ok(null) else if (v.size() > max) #err(#invalid(field)) else #ok(?v);
    };
    case null { #ok(null) };
  };

  public func validCurrency(c : Text) : Bool = c.size() == 3 and c.chars().all(func ch = ch >= 'A' and ch <= 'Z');

  /// Checks a customer and returns it cleaned.
  public func customer(c : S.CustomerInput) : R<S.CustomerInput> {
    let name = trimmed(c.name);
    if (name.size() == 0 or name.size() > 200) return #err(#invalid("name"));
    let a = c.address;
    let street = trimmed(a.street);
    let postalCode = trimmed(a.postalCode);
    let city = trimmed(a.city);
    let country = trimmed(a.country).toUpper();
    if (street.size() == 0 or street.size() > 200) return #err(#invalid("address.street"));
    if (postalCode.size() == 0 or postalCode.size() > 20) return #err(#invalid("address.postalCode"));
    if (city.size() == 0 or city.size() > 100) return #err(#invalid("address.city"));
    if (country.size() != 2) return #err(#invalid("address.country"));
    let orgNr = switch (optClean(c.orgNr, 20, "orgNr")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    switch (orgNr) { case (?o) { if (country == "SE" and c.kind == #company and not Validate.orgNr(o)) return #err(#invalid("orgNr")) }; case null {} };
    let vatNr = switch (optClean(c.vatNr, 20, "vatNr")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let vatUp = switch (vatNr) { case (?v) ?v.toUpper().replace(#char ' ', ""); case null null };
    let email = switch (optClean(c.email, 200, "email")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    switch (email) { case (?e) { if (not Validate.email(e)) return #err(#invalid("email")) }; case null {} };
    let peppolId = switch (optClean(c.peppolId, 60, "peppolId")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    if (c.termsDays > 365) return #err(#invalid("termsDays"));
    #ok({ c with name; orgNr; vatNr = vatUp; email; peppolId; address = { street; postalCode; city; country } });
  };

  public func item(i : S.ItemInput, chart : Types.Chart) : R<S.ItemInput> {
    let name = trimmed(i.name);
    if (name.size() == 0 or name.size() > 200) return #err(#invalid("name"));
    let sku = trimmed(i.sku);
    if (sku.size() > 50) return #err(#invalid("sku"));
    let unit = trimmed(i.unit);
    if (unit.size() == 0 or unit.size() > 20) return #err(#invalid("unit"));
    if (i.priceExVat < 0) return #err(#invalid("priceExVat"));
    switch (chart.vatCodes.get(i.vatCode)) { case (?v) { if (not isSale(v.kind)) return #err(#invalid("vatCode")) }; case null { return #err(#invalid("vatCode")) } };
    switch (chart.accounts.get(i.account)) { case (?a) { if (a.kind != #revenue or not a.active) return #err(#invalid("account")) }; case null { return #err(#invalid("account")) } };
    #ok({ i with name; sku; unit });
  };

  /// Builds the frozen document. Every mandatory field is checked here, so a
  /// document that passes can be issued as is.
  public func build(
    kind : S.DocKind,
    number : Nat,
    input : S.DocInput,
    seller : ?Types.CompanyProfile,
    buyer : S.Customer,
    chart : Types.Chart,
    params : S.Parameters,
    issueDate : Types.Date,
    creditOf : ?{ number : Nat; issueDate : Types.Date },
  ) : R<S.Snapshot> {
    // ABL 28:5 and ML 17:24 3, 5: the seller's name, address, säte, org nr and VAT nr.
    let company = switch (seller) { case (?c) c; case null { return #err(#invalid("company")) } };
    if (input.lines.size() == 0 or input.lines.size() > MAX_LINES) return #err(#invalid("lines"));
    if (not validCurrency(input.currency)) return #err(#invalid("currency"));
    switch (input.currency == "SEK", input.fxRate) {
      case (false, null) { return #err(#invalid("fxRate")) };
      case (false, ?f) { if (f.rate == 0 or not Dates.isValid(f.date)) return #err(#invalid("fxRate")) };
      case (true, _) {};
    };
    switch (input.deliveryDate) { case (?d) { if (not Dates.isValid(d)) return #err(#invalid("deliveryDate")) }; case null {} };
    if (input.termsDays > 365) return #err(#invalid("termsDays"));
    let ourRef = switch (optClean(input.ourRef, 100, "ourRef")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let yourRef = switch (optClean(input.yourRef, 100, "yourRef")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let notes = switch (optClean(input.notes, 2_000, "notes")) { case (#ok(x)) x; case (#err(e)) return #err(e) };

    let lines = Array.repeat<S.SnapLine>({ description = ""; quantity = 0; unit = ""; unitPrice = 0; discountBp = 0; vatCode = ""; rateBp = 0; account = 0; net = 0 }, input.lines.size()).toVarArray<S.SnapLine>();
    let groups = Map.empty<Text, (Nat, Text, Int)>(); // vatCode -> (rate, category, base)
    let notes1 = Map.empty<Text, ()>();
    var needVat = false;
    for ((i, l) in input.lines.enumerate()) {
      let f = "lines[" # i.toText() # "]";
      let description = trimmed(l.description);
      if (description.size() == 0 or description.size() > 500) return #err(#invalid(f # ".description"));
      let unit = trimmed(l.unit);
      if (unit.size() == 0 or unit.size() > 20) return #err(#invalid(f # ".unit"));
      if (l.quantity <= 0) return #err(#invalid(f # ".quantity"));
      if (l.unitPrice < 0) return #err(#invalid(f # ".unitPrice"));
      if (l.discountBp > 10_000) return #err(#invalid(f # ".discountBp"));
      let vc = switch (chart.vatCodes.get(l.vatCode)) { case (?v) v; case null { return #err(#invalid(f # ".vatCode")) } };
      if (not vc.active or not isSale(vc.kind)) return #err(#invalid(f # ".vatCode"));
      switch (chart.accounts.get(l.account)) {
        case (?a) { if (a.kind != #revenue or not a.active) return #err(#invalid(f # ".account")) };
        case null { return #err(#invalid(f # ".account")) };
      };
      if (needsBuyerVatNr(vc.kind)) needVat := true;
      switch (notesFor(vc.kind, input.language)) { case (?n) { notes1.add(n, ()) }; case null {} };
      let net = lineNet(l);
      lines[i] := { description; quantity = l.quantity; unit; unitPrice = l.unitPrice; discountBp = l.discountBp; vatCode = vc.code; rateBp = vc.rateBp; account = l.account; net };
      let (_, _, base) = groups.get(vc.code) ?? (vc.rateBp, category(vc.kind), 0);
      groups.add(vc.code, (vc.rateBp, category(vc.kind), base + net));
    };
    // ML 17:24 6 and 4: the buyer's full name and address; VAT nr when the buyer is liable.
    if (needVat and buyer.vatNr == null) return #err(#invalid("buyer.vatNr"));
    // VAT per rate on the summed base (ML 17:24 9–11).
    let vat = groups.entries().map(func((code, (rateBp, cat, base))) : S.VatRow = { vatCode = code; rateBp; category = cat; base; vat = divRound(base * rateBp, 10_000) }).toArray();
    var totalNet : Int = 0;
    var totalVat : Int = 0;
    for (r in vat.values()) { totalNet += r.base; totalVat += r.vat };
    let legal = notes1.keys().toArray();
    let isQuote = kind == #quote;
    let dueDate = if (isQuote) null else ?Dates.addDays(issueDate, input.termsDays);
    let validUntil = if (isQuote) (switch (input.validUntil) { case (?d) { if (not Dates.isValid(d) or d < issueDate) return #err(#invalid("validUntil")); ?d }; case null { ?Dates.addDays(issueDate, 30) } }) else null;
    let ocr = if (kind == #invoice) ?ocrFor(number, params.ocrLengthDigit) else null;
    let interestText : ?Text = if (kind == #invoice) ?(switch (input.language) {
      case (#sv) "Dröjsmålsränta enligt räntelagen";
      case (#en) "Late payment interest according to the Swedish Interest Act";
    }) else null;
    #ok({
      kind;
      number;
      seller = company;
      buyer = { name = buyer.name; orgNr = buyer.orgNr; vatNr = buyer.vatNr; address = buyer.address; email = buyer.email; peppolId = buyer.peppolId; kind = buyer.kind };
      language = input.language;
      issueDate;
      // ML 17:24 8: only when it differs from the issue date.
      deliveryDate = switch (input.deliveryDate) { case (?d) { if (d == issueDate) null else ?d }; case null { null } };
      dueDate;
      validUntil;
      currency = input.currency;
      fxRate = if (input.currency == "SEK") null else input.fxRate;
      lines = lines.toArray();
      vat;
      totalNet;
      totalVat;
      total = totalNet + totalVat;
      totalVatSek = if (input.currency == "SEK") null else ?toSek(totalVat, input.fxRate);
      legalNotes = legal;
      ocr;
      ourRef;
      yourRef;
      notes;
      termsDays = input.termsDays;
      lateInterestText = interestText;
      creditOf;
      templateVersion = switch (kind) { case (#invoice) TEMPLATE.invoice; case (#creditNote) TEMPLATE.creditNote; case (#quote) TEMPLATE.quote };
    });
  };

  // ── OCR (Luhn mod 10, optional length digit) ──

  func digitsOf(n : Nat) : Text = n.toText();

  public func luhnDigit(ds : Text) : Nat {
    var sum = 0;
    var double = true; // the check digit will be appended to the right
    for (c in ds.reverse().chars()) {
      let d = (c.toNat32() - 48).toNat();
      // Digit sum of the doubled digit (12 -> 1 + 2).
      let v = if (double) { let x = d * 2; x / 10 + x % 10 } else d;
      sum += v;
      double := not double;
    };
    (10 - sum % 10) % 10;
  };

  /// The invoice number, then (optionally) the length digit (total length mod 10), then the Luhn check digit.
  public func ocrFor(number : Nat, lengthDigit : Bool) : Text {
    let base = digitsOf(number);
    let withLen = if (lengthDigit) base # ((base.size() + 2) % 10).toText() else base;
    withLen # luhnDigit(withLen).toText();
  };

  // ── Late interest (Räntelagen 3, 6 §§) ──

  /// The reference rate in force on `date` (the latest rate whose `from` is on or before it).
  public func refRateOn(rates : [S.RefRate], date : Types.Date) : ?Int {
    var best : ?S.RefRate = null;
    for (r in rates.values()) if (r.from <= date) switch (best) { case (?b) { if (r.from > b.from) best := ?r }; case null { best := ?r } };
    switch (best) { case (?b) ?b.rateBp; case null null };
  };

  /// Interest on `balance` from the day after `due` to `until`, at the reference rate
  /// in force in each half-year plus the margin, actual/365. Returns (interest, rate at `until`).
  public func interest(balance : Int, due : Types.Date, until : Types.Date, rates : [S.RefRate], marginBp : Nat) : (Int, Int) {
    if (balance <= 0 or until <= due) return (0, (refRateOn(rates, until) ?? 0) + marginBp);
    var total : Int = 0; // in öre × 10 000 × 365 to round once
    var d = Dates.addDays(due, 1);
    while (d <= until) {
      let rate = (refRateOn(rates, d) ?? 0) + marginBp;
      total += balance * rate;
      d := Dates.addDays(d, 1);
    };
    (divRound(total, 10_000 * 365), (refRateOn(rates, until) ?? 0) + marginBp);
  };
  /// The fee on a reminder (1981:739). B2B: förseningsersättning once per invoice (4 a §), and
  /// then no reminder fee, since fees count only above it (5 §). Otherwise the reminder fee,
  /// only if agreed in advance (2 §).
  public func reminderFee(buyer : { #company; #person }, agreed : Bool, p : S.Parameters, alreadyClaimedCompensation : Bool) : (Int, Text) {
    if (buyer == #company and p.forseningsersattning > 0) {
      if (alreadyClaimedCompensation) (0, "none") else (p.forseningsersattning, "forseningsersattning");
    } else if (agreed and p.reminderFee > 0) (p.reminderFee, "reminderFee") else (0, "none");
  };
};
