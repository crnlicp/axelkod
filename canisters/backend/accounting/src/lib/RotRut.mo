// Pure ROT/RUT rules (V12): the deduction on an invoice, the split between buyers,
// the caps, the share claimed after (partial) payments, and the payout voucher.
// Amounts are öre; everything sent to Skatteverket is whole kronor, truncated so a
// claim never exceeds the maximum share.
import Array "mo:core/Array";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Dates "Dates";
import Invoice "Invoice";
import R "../types/RotRut";
import S "../types/Sales";
import Types "../types";

module {
  type Res<T> = Result.Result<T, Types.Error>;

  public let RECEIVABLES = 1510;
  /// BAS 2026: "Kundfordringar – delad faktura" (V12).
  public let SHARED_RECEIVABLE = 1513;
  public let MAX_BUYERS = 100;
  public let MAX_ENC = 2_048;
  public let MAX_HOURS = 999;

  public let ROT_TYPES = ["BYGG", "EL", "GLASARBETE", "MARKARBETE", "MALNING_TAPETSERING", "MURNING", "VVS"];
  public let RUT_TYPES = [
    "BARNPASSNING", "FLYTTJANSTER", "IT_TJANSTER", "KLAD_TEXTILVARD", "MOBLERING", "PERSONLIG_OMSORG", "REPARATION_VITVAROR",
    "SNOSKOTTNING", "STADNING", "TILLSYN_AV_BOSTAD", "TRADGARDSARBETE", "TRANSPORT_TILL_FORSALJNING", "TVATT_VID_TVATTINRATTNING",
  ];

  /// Whole kronor, truncated (öre in, öre out).
  public func kr(x : Int) : Int = (x / 100) * 100;

  public func validWorkType(kind : R.HusKind, t : Text) : Bool =
    (switch (kind) { case (#rot) ROT_TYPES; case (#rut) RUT_TYPES }).any(func x = x == t);

  /// The parameters in force on `date` (the latest `from` on or before it).
  public func paramsOn(ps : [R.HusParams], date : Types.Date) : ?R.HusParams {
    var best : ?R.HusParams = null;
    for (p in ps.values()) if (p.from <= date) switch (best) { case (?b) { if (p.from > b.from) best := ?p }; case null { best := ?p } };
    best;
  };

  public func checkParams(p : R.HusParams) : Res<R.HusParams> {
    if (not Dates.isValid(p.from) or not Dates.isValid(p.xml11From)) return #err(#invalid("from"));
    if (p.rotBp == 0 or p.rotBp > 10_000 or p.rutBp == 0 or p.rutBp > 10_000) return #err(#invalid("rateBp"));
    if (p.rotCap <= 0 or p.totalCap < p.rotCap or p.rotCap % 100 != 0 or p.totalCap % 100 != 0) return #err(#invalid("cap"));
    if (p.source.size() == 0 or p.source.size() > 500) return #err(#invalid("source"));
    #ok(p);
  };

  /// The line amount incl. VAT, in öre.
  func gross(l : S.SnapLine) : Int = l.net + Invoice.divRound(l.net * l.rateBp, 10_000);

  /// Splits `total` (öre, whole kronor) by shares in whole kronor; the first buyer takes the remainder.
  public func split(total : Int, shares : [Nat]) : [Int] {
    let kronor = total / 100;
    let parts = shares.map(func s = (kronor * s) / 10_000);
    var used : Int = 0;
    for (p in parts.values()) used += p;
    Array.tabulate(parts.size(), func i = (if (i == 0) parts[i] + kronor - used else parts[i]) * 100);
  };

  /// The ROT/RUT part of a quote or invoice: checks the input against the lines and the
  /// parameters on the issue date, and computes the deduction.
  public func part(h : R.HusInput, x : S.Snapshot, ps : [R.HusParams]) : Res<R.HusPart> {
    if (x.currency != "SEK" or x.fxRate != null) return #err(#invalid("hus.currency"));
    if (x.buyer.kind != #person) return #err(#invalid("hus.buyer"));
    let p = switch (paramsOn(ps, x.issueDate)) { case (?p) p; case null { return #err(#invalid("hus.params")) } };
    if (h.lineParts.size() != x.lines.size()) return #err(#invalid("hus.lineParts"));
    if (h.buyers.size() == 0 or h.buyers.size() > MAX_BUYERS) return #err(#invalid("hus.buyers"));
    var shares = 0;
    for ((i, b) in h.buyers.enumerate()) {
      if (b.shareBp == 0 or b.identityEnc.size() == 0 or b.identityEnc.size() > MAX_ENC) return #err(#invalid("hus.buyers[" # i.toText() # "]"));
      shares += b.shareBp;
    };
    if (shares != 10_000) return #err(#invalid("hus.shares"));
    switch (h.kind, h.propertyEnc) {
      case (#rot, ?e) { if (e.size() == 0 or e.size() > MAX_ENC) return #err(#invalid("hus.property")) };
      case (#rot, null) { return #err(#invalid("hus.property")) };
      case (#rut, ?_) { return #err(#invalid("hus.property")) };
      case (#rut, null) {};
    };
    let labourOf = Map.empty<Text, Int>();
    let materialOf = Map.empty<Text, Int>();
    var labour : Int = 0;
    var material : Int = 0;
    var other : Int = 0;
    for ((i, lp) in h.lineParts.enumerate()) {
      let g = gross(x.lines[i]);
      switch (lp) {
        case (?#labour(t)) {
          if (not validWorkType(h.kind, t)) return #err(#invalid("hus.lineParts[" # i.toText() # "]"));
          labourOf.add(t, (labourOf.get(t) ?? 0) + g);
          labour += g;
        };
        case (?#material(t)) {
          if (not validWorkType(h.kind, t)) return #err(#invalid("hus.lineParts[" # i.toText() # "]"));
          materialOf.add(t, (materialOf.get(t) ?? 0) + g);
          material += g;
        };
        case (?#other) { other += g };
        case null {};
      };
    };
    if (labour <= 0) return #err(#invalid("hus.labour"));
    // Material belongs to a work type the invoice also has labour for (hours and material per type).
    for (t in materialOf.keys()) if (not labourOf.containsKey(t)) return #err(#invalid("hus.material"));
    let rateBp = switch (h.kind) { case (#rot) p.rotBp; case (#rut) p.rutBp };
    let max = kr(labour * rateBp / 10_000);
    let deduction = switch (h.deductionLimit) {
      case (?l) { if (l <= 0 or l % 100 != 0 or l > max) return #err(#invalid("hus.deductionLimit")); l };
      case null { max };
    };
    let amounts = split(deduction, h.buyers.map(func b = b.shareBp));
    let cap = switch (h.kind) { case (#rot) p.rotCap; case (#rut) p.totalCap };
    for (a in amounts.values()) if (a > cap) return #err(#invalid("hus.cap"));
    #ok({
      kind = h.kind;
      rateBp;
      lineParts = h.lineParts;
      labour;
      material;
      other;
      work = labourOf.entries().map(func((t, l) : (Text, Int)) : R.HusWork = { workType = t; labour = l; material = materialOf.get(t) ?? 0 }).toArray();
      deduction;
      buyers = Array.tabulate(h.buyers.size(), func i = { h.buyers[i] with amount = amounts[i] });
      propertyEnc = h.propertyEnc;
    });
  };

  /// The input that reproduces a part (quote -> invoice).
  public func input(p : R.HusPart) : R.HusInput = {
    kind = p.kind;
    lineParts = p.lineParts;
    buyers = p.buyers.map(func(b : R.HusBuyer) : R.HusBuyerInput = { identityEnc = b.identityEnc; shareBp = b.shareBp });
    propertyEnc = p.propertyEnc;
    deductionLimit = ?p.deduction;
  };

  public func deduction(x : S.Snapshot) : Int = switch (x.hus) { case (?h) h.deduction; case null 0 };

  /// What the customer was invoiced for: the total less the deduction.
  public func customerPart(x : S.Snapshot) : Int = x.total - deduction(x);

  public func year(d : Types.Date) : Nat = switch (Dates.parse(d)) { case (?c) c.y; case null 0 };

  /// Skatteverket must have the claim by 31 January of the year after payment.
  public func deadline(paymentYear : Nat) : Types.Date = Nat.toText(paymentYear + 1) # "-01-31";

  /// x × paid / payable in whole kronor, truncated.
  func shareOf(x : Int, paid : Int, payable : Int) : Int = if (payable <= 0) 0 else kr(x * Int.min(paid, payable) / payable);

  public type CaseCalc = {
    labour : Int;
    paidLabour : Int;
    requested : Int;
    material : Int;
    other : Int;
    buyerAmounts : [Int];
  };

  /// The amounts of a case that adds `paidNow` to `paidBefore` (öre). Skatteverket's
  /// partial-payment rule: the share of the deduction claimed equals the share of the
  /// customer's part that is paid. Cumulative, so rounding never adds up.
  public func caseAmounts(x : S.Snapshot, paidBefore : Int, paidNow : Int) : Res<CaseCalc> {
    let h = switch (x.hus) { case (?h) h; case null { return #err(#invalid("hus")) } };
    let payable = customerPart(x);
    let after = paidBefore + paidNow;
    func step(v : Int) : Int = shareOf(v, after, payable) - shareOf(v, paidBefore, payable);
    let requested = step(h.deduction);
    let labour = step(h.labour);
    let paidLabour = labour - requested;
    if (requested <= 0) return #err(#invalid("requested"));
    // E-service rules: requested ≤ paid, requested + paid ≤ labour (V12).
    if (requested > paidLabour or requested + paidLabour > labour) return #err(#invalid("requested"));
    #ok({
      labour;
      paidLabour;
      requested;
      material = step(h.material);
      other = step(h.other);
      buyerAmounts = split(requested, h.buyers.map(func(b : R.HusBuyer) : Nat = b.shareBp));
    });
  };

  /// One entry per work type of the invoice; whole hours (SKV 4542: rounded up).
  public func checkHours(h : R.HusPart, hours : [R.HoursInput]) : Res<[R.HoursInput]> {
    if (hours.size() != h.work.size()) return #err(#invalid("hours"));
    var any = false;
    for (w in h.work.values()) {
      let e = switch (hours.find(func(x : R.HoursInput) : Bool = x.workType == w.workType)) { case (?e) e; case null { return #err(#invalid("hours")) } };
      if (e.hours > MAX_HOURS) return #err(#invalid("hours"));
      if (e.hours > 0) any := true;
    };
    if (not any) return #err(#invalid("hours"));
    #ok(h.work.map(func(w : R.HusWork) : R.HoursInput = hours.find(func(x : R.HoursInput) : Bool = x.workType == w.workType) ?? { workType = w.workType; hours = 0 }));
  };

  /// NamnPaBegaran: 1–16 characters (XSD).
  public func claimName(t : Text) : ?Text {
    let n = t.trim(#char ' ');
    if (n.size() == 0 or n.size() > 16) null else ?n;
  };

  /// Skatteverket's reference: 11 digits, optionally "-" and a payout number (decision JSON schema).
  public func validReference(t : Text) : Bool {
    let parts = t.split(#char '-').toArray();
    func digits(s : Text) : Bool = s.size() > 0 and s.chars().all(func c = c >= '0' and c <= '9');
    switch (parts.size()) {
      case 1 { parts[0].size() == 11 and digits(parts[0]) };
      case 2 { parts[0].size() == 11 and digits(parts[0]) and digits(parts[1]) };
      case (_) { false };
    };
  };

  func line(account : Nat, amount : Int) : Types.VoucherLine = {
    account; amount; vatCode = null; costCenter = null; project = null; quantity = null; text = null;
  };

  /// The decision voucher under the invoice method: the payout clears 1513 and a refused
  /// amount moves to the customer (1513 -> 1510). The cash method books the payout as
  /// income pro rata (Sales.husPayoutLines).
  public func decisionLines(approved : Int, requested : Int, bankAccount : Nat) : [Types.VoucherLine] {
    let refused = requested - approved;
    var ls : [Types.VoucherLine] = [];
    if (approved > 0) ls := ls.concat([line(bankAccount, approved)]);
    if (refused > 0) ls := ls.concat([line(RECEIVABLES, refused)]);
    if (requested > 0) ls := ls.concat([line(SHARED_RECEIVABLE, -requested)]);
    ls;
  };
};
