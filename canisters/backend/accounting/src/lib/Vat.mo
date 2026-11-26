// VAT return boxes from the ledger (V3): account → VAT code → box, so manual vouchers
// count too. Box 50 comes from the import documents' tax base (13:35). Filed values are
// whole kronor with öre dropped per box; 49 = 10+11+12+30+31+32+60+61+62 − 48.
// EU sales list rows come from issued invoices and credit notes (V4).
import Array "mo:core/Array";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Set "mo:core/Set";
import Text "mo:core/Text";
import Canonical "Canonical";
import Chart "Chart";
import Dates "Dates";
import Invoice "Invoice";
import Ledger "Ledger";
import P "../types/Purchases";
import S "../types/Sales";
import V "../types/Vat";
import Types "../types";

module {
  type R<T> = Result.Result<T, Types.Error>;

  public let SERIES = "M";
  public let SETTLEMENT = 2650;
  public let ROUNDING = 3740;
  public let MAX_NOTE = 300;
  /// Element order of the eSKDUpload 6.0 file (and of the e-service form).
  public let ORDER : [Nat] = [5, 6, 7, 8, 10, 11, 12, 20, 21, 22, 23, 24, 30, 31, 32, 35, 36, 37, 38, 39, 40, 41, 42, 50, 60, 61, 62, 48, 49];

  /// Purchases, the import base and input VAT count debits as positive; every other box credits.
  func debitSide(box : Nat) : Bool = (box >= 20 and box <= 24) or box == 48 or box == 50;

  func payable(box : Nat) : Bool = (box >= 10 and box <= 12) or (box >= 30 and box <= 32) or (box >= 60 and box <= 62);

  func civil(d : Text) : Dates.Civil = Dates.parse(d) ?? { y = 1970; m = 1; d = 1 };

  /// First day of each month from `from` to `to`.
  public func months(from : Text, to : Text) : [Text] {
    let out = List.empty<Text>();
    var c = civil(from);
    let end = civil(to);
    while (c.y * 12 + c.m <= end.y * 12 + end.m) {
      out.add(Dates.format({ y = c.y; m = c.m; d = 1 }));
      c := if (c.m == 12) { { y = c.y + 1; m = 1; d = 1 } } else { { y = c.y; m = c.m + 1; d = 1 } };
    };
    out.toArray();
  };

  func calendarPeriod(from : Text, to : Text) : Bool =
    Dates.isValid(from) and Dates.isValid(to) and Dates.isFirstOfMonth(from) and Dates.isLastOfMonth(to) and from <= to;

  /// A VAT period as decided by Skatteverket: a month, a calendar quarter or the fiscal year.
  public func checkPeriod(chart : Types.Chart, period : { #month; #quarter; #year }, from : Text, to : Text) : R<()> {
    if (not calendarPeriod(from, to)) return #err(#invalid("period"));
    let n = months(from, to).size();
    let ok = switch (period) {
      case (#month) { n == 1 };
      case (#quarter) { n == 3 and civil(from).m % 3 == 1 };
      case (#year) { switch (Chart.yearOf(chart, from)) { case (?fy) { fy.start == from and fy.end == to }; case null { false } } };
    };
    if (ok) #ok(()) else #err(#invalid("period"));
  };

  /// EU sales list period: a month or a calendar quarter (V4). Returns the file's period code.
  public func eslPeriod(from : Text, to : Text) : R<Text> {
    if (not calendarPeriod(from, to)) return #err(#invalid("period"));
    let c = civil(from);
    let yy = Nat.toText(c.y % 100);
    let y2 = if (yy.size() == 1) "0" # yy else yy;
    switch (months(from, to).size()) {
      case (1) { #ok(y2 # (if (c.m < 10) "0" else "") # c.m.toText()) };
      case (3) { if (c.m % 3 == 1) #ok(y2 # "-" # Nat.toText(c.m / 3 + 1)) else #err(#invalid("period")) };
      case (_) { #err(#invalid("period")) };
    };
  };

  /// Net amount per account over the period's months (from the per-month balances).
  public func sums(chart : Types.Chart, ledger : Types.Ledger, from : Text, to : Text) : Map.Map<Nat, Int> {
    let m = Map.empty<Nat, Int>();
    for (first in months(from, to).values()) {
      switch (Chart.yearOf(chart, first)) {
        case (?fy) {
          let idx = Int.abs(Dates.monthIndex(fy.start, first));
          for (a in chart.accounts.keys()) {
            switch (ledger.balances.get(Ledger.balanceKey(fy.id, a, idx))) {
              case (?x) { if (x != 0) m.add(a, (m.get(a) ?? 0) + x) };
              case null {};
            };
          };
        };
        case null {};
      };
    };
    m;
  };

  func addTo(m : Map.Map<Nat, Int>, key : Nat, amount : Int) {
    if (amount != 0) m.add(key, (m.get(key) ?? 0) + amount);
  };

  /// VAT account -> its code (codes with a VAT box).
  func vatAccounts(chart : Types.Chart) : Map.Map<Nat, Types.VatCode> {
    let m = Map.empty<Nat, Types.VatCode>();
    for (vc in chart.vatCodes.values()) switch (vc.account, vc.boxVat) {
      case (?a, ?_) { if (not m.containsKey(a)) m.add(a, vc) };
      case (_, _) {};
    };
    m;
  };

  func baseBox(chart : Types.Chart, a : Types.Account) : ?Nat = switch (a.vatCode) {
    case (?c) { switch (chart.vatCodes.get(c)) { case (?vc) { vc.boxBase }; case null { null } } };
    case null { null };
  };

  /// Box values in öre from account sums, plus box 50 from the import documents.
  public func exactBoxes(chart : Types.Chart, s : Map.Map<Nat, Int>, purchases : P.Purchases, from : Text, to : Text) : Map.Map<Nat, Int> {
    let boxes = Map.empty<Nat, Int>();
    let vatOf = vatAccounts(chart);
    for ((acc, amount) in s.entries()) {
      switch (chart.accounts.get(acc)) {
        case (?a) { switch (baseBox(chart, a)) { case (?b) { addTo(boxes, b, if (debitSide(b)) amount else -amount) }; case null {} } };
        case null {};
      };
      switch (vatOf.get(acc)) {
        case (?vc) { switch (vc.boxVat) { case (?b) { addTo(boxes, b, if (debitSide(b)) amount else -amount) }; case null {} } };
        case null {};
      };
    };
    // Box 50 is the base on the tullräkning; import VAT booked without one (a manual
    // voucher) adds its base back from the rate.
    let docVat = Map.empty<Nat, Int>();
    for (d in purchases.docs.values()) {
      if (d.treatment == #importVat and d.voucherId != null and d.docDate >= from and d.docDate <= to) {
        for (l in d.lines.values()) {
          addTo(boxes, 50, l.net);
          addTo(docVat, l.rateBp, Invoice.divRound(l.net * l.rateBp, 10_000));
        };
      };
    };
    for ((box, rate) in [(60, 2500), (61, 1200), (62, 600)].values()) {
      let rest = (boxes.get(box) ?? 0) - (docVat.get(rate) ?? 0);
      if (rest != 0) addTo(boxes, 50, Invoice.divRound(rest * 10_000, rate));
    };
    boxes;
  };

  /// (whole kronor, öre) in file order. Öre are dropped per box; 49 is computed from
  /// the boxes it sums in each list.
  public func finish(exact : Map.Map<Nat, Int>) : ([V.Box], [V.Box]) {
    let w = List.empty<V.Box>();
    let e = List.empty<V.Box>();
    var pay : Int = 0;
    var payExact : Int = 0;
    for (b in ORDER.values()) {
      if (b != 49) {
        let x = exact.get(b) ?? 0;
        let k = x / 100; // Int division truncates toward zero
        if (x != 0) e.add({ box = b; amount = x });
        if (k != 0) w.add({ box = b; amount = k });
        if (payable(b)) { pay += k; payExact += x } else if (b == 48) { pay -= k; payExact -= x };
      };
    };
    w.add({ box = 49; amount = pay });
    e.add({ box = 49; amount = payExact });
    (w.toArray(), e.toArray());
  };

  public func get(boxes : [V.Box], box : Nat) : Int {
    for (b in boxes.values()) if (b.box == box) return b.amount;
    0;
  };

  func vline(account : Nat, amount : Int) : Types.VoucherLine = {
    account; amount; vatCode = null; costCenter = null; project = null; quantity = null; text = null;
  };

  /// Moves the period's VAT to 2650 (the amount on the return) with the dropped öre on 3740.
  public func settlementLines(chart : Types.Chart, s : Map.Map<Nat, Int>, box49 : Int) : [Types.VoucherLine] {
    let out = List.empty<Types.VoucherLine>();
    var sum : Int = 0;
    for (a in vatAccounts(chart).keys()) {
      let x = s.get(a) ?? 0;
      if (x != 0) { out.add(vline(a, -x)); sum -= x };
    };
    if (out.isEmpty()) return [];
    if (box49 != 0) out.add(vline(SETTLEMENT, -box49 * 100));
    let rest = -(sum - box49 * 100);
    if (rest != 0) out.add(vline(ROUNDING, rest));
    out.toArray();
  };

  /// The vouchers behind the return: count and hash of (id, series, number) in id order.
  public func sources(chart : Types.Chart, ledger : Types.Ledger, from : Text, to : Text) : (Nat, Blob) {
    let relevant = Set.empty<Nat>();
    for (a in vatAccounts(chart).keys()) relevant.add(a);
    for (a in chart.accounts.values()) if (baseBox(chart, a) != null) relevant.add(a.number);
    let items = List.empty<Canonical.Value>();
    for (v in ledger.vouchers.values()) {
      if (v.eventDate >= from and v.eventDate <= to and v.lines.any(func(l : Types.VoucherLine) : Bool = relevant.contains(l.account))) {
        items.add(#arr([#int(v.id), #text(v.series), #int(v.number)]));
      };
    };
    (items.size(), Canonical.sha256(#arr(items.toArray())));
  };

  public func normalizeVatNr(t : Text) : Text = t.toUpper().replace(#char ' ', "").replace(#char '-', "").replace(#char '.', "");

  /// Rows per buyer VAT number (SEK, whole kronor, öre dropped per row) and the number
  /// of documents with EU sales but no buyer VAT number.
  public func eslRows(chart : Types.Chart, sales : S.Sales, from : Text, to : Text) : ([V.EslRow], Nat, Int, Int) {
    let goods = Map.empty<Text, Int>();
    let services = Map.empty<Text, Int>();
    let names = Map.empty<Text, Text>();
    var missing = 0;
    var goodsExact : Int = 0;
    var servicesExact : Int = 0;
    for (d in sales.docs.values()) {
      let x = d.snapshot;
      if ((d.kind == #invoice or d.kind == #creditNote) and x.issueDate >= from and x.issueDate <= to) {
        let sign : Int = if (d.kind == #creditNote) -1 else 1;
        let nr = normalizeVatNr(x.buyer.vatNr ?? "");
        var eu = false;
        for (l in x.lines.values()) {
          let amount = sign * Invoice.toSek(l.net, x.fxRate);
          switch (chart.vatCodes.get(l.vatCode)) {
            case (?vc) {
              if (vc.kind == #euGoodsSale) { eu := true; goodsExact += amount; if (nr != "") add(goods, nr, amount) };
              if (vc.kind == #euServiceSale) { eu := true; servicesExact += amount; if (nr != "") add(services, nr, amount) };
            };
            case null {};
          };
        };
        if (eu) { if (nr == "") missing += 1 else names.add(nr, x.buyer.name) };
      };
    };
    let rows = names.entries().map(func((nr, buyer) : (Text, Text)) : V.EslRow = {
      vatNr = nr; buyer; goods = (goods.get(nr) ?? 0) / 100; triangulation = 0; services = (services.get(nr) ?? 0) / 100;
    }).toArray();
    (rows, missing, goodsExact, servicesExact);
  };

  func add(m : Map.Map<Text, Int>, k : Text, v : Int) { m.add(k, (m.get(k) ?? 0) + v) };

  // ── VIES (V5) ──

  public let VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";
  public let VIES_MAX_BYTES : Nat64 = 8_000;
  public let VIES_PER_DAY = 200;

  /// Request body for a VAT number "SE5560000167..." (country prefix first; Greece is EL).
  public func viesBody(vatNr : Text) : ?Text {
    let n = normalizeVatNr(vatNr);
    if (n.size() < 4 or n.size() > 14) return null;
    let cs = n.chars().toArray();
    if (not (cs[0] >= 'A' and cs[0] <= 'Z' and cs[1] >= 'A' and cs[1] <= 'Z')) return null;
    for (c in cs.values()) if (not ((c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '+' or c == '*')) return null;
    let cc = Text.fromIter([cs[0], cs[1]].values());
    let rest = Text.fromIter(cs.sliceToArray(2, cs.size()).values());
    ?("{\"countryCode\":\"" # cc # "\",\"vatNumber\":\"" # rest # "\"}");
  };

  /// Finds `"key"` in a flat JSON object and returns its raw value: a string (unescaped)
  /// or a literal such as true/false. Enough for the VIES response, nothing more.
  public func jsonField(body : Text, key : Text) : ?Text {
    let cs = body.chars().toArray();
    let k = ("\"" # key # "\"").chars().toArray();
    let n = cs.size();
    var i = 0;
    label search while (i + k.size() <= n) {
      var j = 0;
      while (j < k.size() and cs[i + j] == k[j]) j += 1;
      if (j < k.size()) { i += 1; continue search };
      var p = i + k.size();
      while (p < n and (cs[p] == ' ' or cs[p] == '\n' or cs[p] == '\r' or cs[p] == '\t')) p += 1;
      if (p >= n or cs[p] != ':') { i += 1; continue search };
      p += 1;
      while (p < n and (cs[p] == ' ' or cs[p] == '\n' or cs[p] == '\r' or cs[p] == '\t')) p += 1;
      if (p >= n) return null;
      let out = List.empty<Char>();
      if (cs[p] == '\"') {
        p += 1;
        while (p < n and cs[p] != '\"') {
          if (cs[p] == '\\' and p + 1 < n) {
            p += 1;
            out.add(switch (cs[p]) { case ('n') '\n'; case ('t') ' '; case ('r') ' '; case (c) c });
          } else out.add(cs[p]);
          p += 1;
        };
      } else {
        while (p < n and cs[p] != ',' and cs[p] != '}' and cs[p] != ' ' and cs[p] != '\n') { out.add(cs[p]); p += 1 };
      };
      return ?Text.fromIter(out.values());
    };
    null;
  };

  /// The part of a VIES answer that every replica sees the same way: "1|0", name, address.
  public func viesCanonical(body : Text) : ?Text {
    let valid = switch (jsonField(body, "valid")) { case (?"true") "1"; case (?"false") "0"; case (_) { return null } };
    let clean = func(t : ?Text) : Text = switch (t) { case (?x) { let y = x.trim(#char ' '); if (y == "---") "" else y.replace(#char '\n', ", ") }; case null "" };
    ?(valid # "\n" # clean(jsonField(body, "name")) # "\n" # clean(jsonField(body, "address")));
  };
};
