// VAT return boxes from the ledger (V3): fixtures with Skatteverket's examples, öre
// dropped per box, settlement voucher balance, periods, and the VIES answer parser (V5).
import { suite; test; expect } "mo:test";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Ledger "../src/lib/Ledger";
import Seed "../src/lib/Seed";
import Purchase "../src/lib/Purchase";
import VatLib "../src/lib/Vat";
import P "../src/types/Purchases";
import V "../src/types/Vat";
import Types "../src/types";

let owner = Principal.fromText("2vxsx-fae");

func newChart() : Types.Chart {
  let c : Types.Chart = { fiscalYears = Map.empty(); accounts = Map.empty(); vatCodes = Map.empty(); series = Map.empty() };
  for (a in Seed.accounts.values()) c.accounts.add(a.number, a);
  for (v in Seed.vatCodes().values()) c.vatCodes.add(v.code, v);
  for (s in Seed.series.values()) c.series.add(s.code, s);
  c.fiscalYears.add(1, { id = 1; start = "2026-01-01"; end = "2026-12-31"; status = #open; lockedAt = null });
  c;
};

func newLedger() : Types.Ledger = {
  vouchers = Map.empty(); drafts = Map.empty(); numbering = Map.empty(); correctionsOf = Map.empty(); balances = Map.empty();
};

func newPurchases() : P.Purchases = {
  suppliers = Map.empty(); docs = Map.empty(); payments = Map.empty(); paymentsOf = Map.empty(); creditsOf = Map.empty(); used = Map.empty(); var next = 1;
};

func l(account : Nat, amount : Int) : Types.VoucherLine = { account; amount; vatCode = null; costCenter = null; project = null; quantity = null; text = null };

var nextId = 1;
func post(chart : Types.Chart, ledger : Types.Ledger, date : Text, lines : [Types.VoucherLine]) {
  let v : Types.VoucherInput = { series = "A"; eventDate = date; description = "Test"; lines; attachmentIds = []; counterparty = null };
  switch (Ledger.check(chart, null, v, func _ = true)) {
    case (#ok(fy)) { ignore Ledger.post(ledger, fy, nextId, v, #manual, null, owner, 0); nextId += 1 };
    case (#err(_)) { assert false };
  };
};

func importDoc(date : Text, base : Int) : P.Purchase = {
  kind = #supplierInvoice; supplierId = ?1; payee = null; docDate = date; dueDate = null; docNumber = ?"T-1"; currency = "SEK";
  fxRate = null; treatment = #importVat; lines = [{ account = 2645; net = base; rateBp = 2500; vat = 0; text = null }]; total = 0;
  paymentRef = null; paidFrom = null; creditOf = null; description = "Tullräkning"; attachmentIds = [1];
  id = 1; voucherId = ?99; bookedAt = 0; bookedBy = owner; retainUntil = "2033-12-31";
};

func box(bs : [V.Box], b : Nat) : Int = VatLib.get(bs, b);

// One month with a domestic sale (öre), a domestic purchase, Skatteverket's EU goods
// example (55 000 kr) and import example (base 100 000 kr), an EU goods sale and a
// construction sale where the buyer is liable.
let chart = newChart();
let ledger = newLedger();
let purchases = newPurchases();
post(chart, ledger, "2026-11-03", [l(1510, 1_250_094), l(3001, -1_000_075), l(2611, -250_019)]);
post(chart, ledger, "2026-11-04", [l(6212, 80_000), l(2641, 20_000), l(2440, -100_000)]);
post(chart, ledger, "2026-11-05", [l(4515, 5_500_000), l(2645, 1_375_000), l(2614, -1_375_000), l(2440, -5_500_000)]);
post(chart, ledger, "2026-11-06", [l(2645, 2_500_000), l(2615, -2_500_000)]);
purchases.docs.add(1, importDoc("2026-11-06", 10_000_000));
post(chart, ledger, "2026-11-07", [l(1510, 300_000), l(3108, -300_000)]);
post(chart, ledger, "2026-11-08", [l(1510, 4_000_000), l(3231, -4_000_000)]);
// Outside the period: must not count.
post(chart, ledger, "2026-10-31", [l(1510, 125_000), l(3001, -100_000), l(2611, -25_000)]);

let s = VatLib.sums(chart, ledger, "2026-11-01", "2026-11-30");
let (boxes, exact) = VatLib.finish(VatLib.exactBoxes(chart, s, purchases, "2026-11-01", "2026-11-30"));

suite("VAT return boxes", func() {
  test("sales: 05 and 10 with öre dropped, 35 EU goods, 41 buyer liable", func() {
    expect.int(box(boxes, 5)).equal(10_000);
    expect.int(box(exact, 5)).equal(1_000_075);
    expect.int(box(boxes, 10)).equal(2_500);
    expect.int(box(boxes, 35)).equal(3_000);
    expect.int(box(boxes, 41)).equal(40_000);
  });
  test("EU goods purchase (Skatteverket: 55 000 kr → 13 750 kr in 30 and 48)", func() {
    expect.int(box(boxes, 20)).equal(55_000);
    expect.int(box(boxes, 30)).equal(13_750);
  });
  test("import (Skatteverket: base 100 000 kr → 25 000 kr in 60 and 48)", func() {
    expect.int(box(boxes, 50)).equal(100_000);
    expect.int(box(boxes, 60)).equal(25_000);
  });
  test("48 sums 2641, 2645; 49 = 10+30+60 − 48 from the whole-kronor boxes", func() {
    expect.int(box(boxes, 48)).equal(200 + 13_750 + 25_000);
    expect.int(box(boxes, 49)).equal(2_500 + 13_750 + 25_000 - 38_950);
    expect.int(box(exact, 49)).equal(230_019);
  });
  test("file order ends with 48, 49", func() {
    expect.nat(boxes[boxes.size() - 2].box).equal(48);
    expect.nat(boxes[boxes.size() - 1].box).equal(49);
  });
  test("import VAT on a manual voucher adds its base from the rate", func() {
    let p2 = newPurchases();
    let (b2, _) = VatLib.finish(VatLib.exactBoxes(chart, s, p2, "2026-11-01", "2026-11-30"));
    expect.int(box(b2, 50)).equal(100_000);
  });
});

suite("Settlement voucher", func() {
  let lines = VatLib.settlementLines(chart, s, box(boxes, 49));
  func on(acc : Nat) : Int { var t : Int = 0; for (x in lines.values()) if (x.account == acc) t += x.amount; t };
  test("zeroes every VAT account, 2650 gets box 49, öre go to 3740, balanced", func() {
    expect.int(on(2611)).equal(250_019);
    expect.int(on(2614)).equal(1_375_000);
    expect.int(on(2615)).equal(2_500_000);
    expect.int(on(2641)).equal(-20_000);
    expect.int(on(2645)).equal(-3_875_000);
    expect.int(on(2650)).equal(-230_000);
    expect.int(on(3740)).equal(-19);
    var t : Int = 0;
    for (x in lines.values()) t += x.amount;
    expect.int(t).equal(0);
  });
  test("refund period: 49 negative, 2650 debited", func() {
    let c2 = newChart();
    let l2 = newLedger();
    post(c2, l2, "2026-11-04", [l(5410, 400_000), l(2641, 100_000), l(2440, -500_000)]);
    let s2 = VatLib.sums(c2, l2, "2026-11-01", "2026-11-30");
    let (b2, _) = VatLib.finish(VatLib.exactBoxes(c2, s2, newPurchases(), "2026-11-01", "2026-11-30"));
    expect.int(box(b2, 49)).equal(-1_000);
    let ls = VatLib.settlementLines(c2, s2, box(b2, 49));
    expect.bool(ls.any(func(x : Types.VoucherLine) : Bool = x.account == 2650 and x.amount == 100_000)).isTrue();
  });
  test("nothing to report: no lines, 49 is 0", func() {
    let c3 = newChart();
    let s3 = VatLib.sums(c3, newLedger(), "2026-11-01", "2026-11-30");
    let (b3, _) = VatLib.finish(VatLib.exactBoxes(c3, s3, newPurchases(), "2026-11-01", "2026-11-30"));
    expect.int(box(b3, 49)).equal(0);
    expect.nat(VatLib.settlementLines(c3, s3, 0).size()).equal(0);
  });
});

suite("Periods", func() {
  test("month, calendar quarter, fiscal year", func() {
    expect.bool(VatLib.checkPeriod(chart, #month, "2026-11-01", "2026-11-30") == #ok(())).isTrue();
    expect.bool(VatLib.checkPeriod(chart, #month, "2026-11-02", "2026-11-30") == #ok(())).isFalse();
    expect.bool(VatLib.checkPeriod(chart, #quarter, "2026-10-01", "2026-12-31") == #ok(())).isTrue();
    expect.bool(VatLib.checkPeriod(chart, #quarter, "2026-11-01", "2027-01-31") == #ok(())).isFalse();
    expect.bool(VatLib.checkPeriod(chart, #year, "2026-01-01", "2026-12-31") == #ok(())).isTrue();
  });
  test("EU sales list period codes YYMM and YY-Q (V4)", func() {
    expect.bool(VatLib.eslPeriod("2026-11-01", "2026-11-30") == #ok("2611")).isTrue();
    expect.bool(VatLib.eslPeriod("2026-01-01", "2026-01-31") == #ok("2601")).isTrue();
    expect.bool(VatLib.eslPeriod("2026-10-01", "2026-12-31") == #ok("26-4")).isTrue();
    expect.bool(VatLib.eslPeriod("2026-11-01", "2027-01-31") == #ok("26-4")).isFalse();
  });
});

suite("VIES", func() {
  test("request body from a VAT number", func() {
    expect.text(VatLib.viesBody("de 262 875 793") ?? "").equal("{\"countryCode\":\"DE\",\"vatNumber\":\"262875793\"}");
    expect.bool(VatLib.viesBody("123") == null).isTrue();
  });
  test("canonical answer keeps valid, name and address only", func() {
    let body = "{\n  \"countryCode\" : \"DE\",\n  \"vatNumber\" : \"262875793\",\n  \"requestDate\" : \"2026-11-25T10:00:00.000Z\",\n  \"valid\" : true,\n  \"requestIdentifier\" : \"\",\n  \"name\" : \"---\",\n  \"address\" : \"---\"\n}";
    expect.text(VatLib.viesCanonical(body) ?? "x").equal("1\n\n");
    let se = "{\"valid\":false,\"name\":\"Bolag \\\"AB\\\"\",\"address\":\"Gatan 1\\n123 45 Stad\"}";
    expect.text(VatLib.viesCanonical(se) ?? "x").equal("0\nBolag \"AB\"\nGatan 1, 123 45 Stad");
    expect.bool(VatLib.viesCanonical("{\"error\":1}") == null).isTrue();
  });
});

suite("Import VAT document (13:35)", func() {
  let x : P.PurchaseInput = { importDoc("2026-11-06", 10_000_000) with lines = [{ account = 4010; net = 10_000_000; rateBp = 2500; vat = 0; text = null }] };
  test("books only the pair 2645 / 2615, nothing payable", func() {
    let ls = Purchase.bookLines(x, chart);
    expect.nat(ls.size()).equal(2);
    expect.bool(ls.any(func(v : Types.VoucherLine) : Bool = v.account == 2645 and v.amount == 2_500_000)).isTrue();
    expect.bool(ls.any(func(v : Types.VoucherLine) : Bool = v.account == 2615 and v.amount == -2_500_000)).isTrue();
  });
  test("SEK only, total 0, a rate on every line", func() {
    let ok = func(y : P.PurchaseInput) : Bool = switch (Purchase.check(y, chart, func _ = true, func _ = true, "2026-11-25")) { case (#ok(_)) true; case (#err(_)) false };
    expect.bool(ok(x)).isTrue();
    expect.bool(ok({ x with total = 100 })).isFalse();
    expect.bool(ok({ x with currency = "EUR"; fxRate = ?{ rate = 11_000_000; date = "2026-11-02" } })).isFalse();
    expect.bool(ok({ x with lines = [{ account = 4010; net = 100; rateBp = 0; vat = 0; text = null }] })).isFalse();
  });
});
