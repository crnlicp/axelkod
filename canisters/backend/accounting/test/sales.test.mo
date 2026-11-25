// Invoice arithmetic, mandatory content per VAT treatment, OCR, late interest,
// and the vouchers of invoices, credit notes and payments.
import { suite; test; expect } "mo:test";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Invoice "../src/lib/Invoice";
import SalesLib "../src/lib/Sales";
import Seed "../src/lib/Seed";
import Validate "../src/lib/Validate";
import S "../src/types/Sales";
import Types "../src/types";

func newChart() : Types.Chart {
  let c : Types.Chart = { fiscalYears = Map.empty(); accounts = Map.empty(); vatCodes = Map.empty(); series = Map.empty() };
  for (a in Seed.accounts.values()) c.accounts.add(a.number, a);
  for (v in Seed.vatCodes().values()) c.vatCodes.add(v.code, v);
  c;
};

let company : Types.CompanyProfile = {
  legalName = "Axelkod AB"; orgNr = "556036-0793"; vatNr = "SE556036079301"; registeredOffice = "Göteborg"; street = "Gatan 1";
  postalCode = "411 01"; city = "Göteborg"; country = "SE"; email = "a@b.se"; phone = null; web = null; bankgiro = null;
  plusgiro = null; iban = null; bic = null; fSkatt = true; peppolId = null;
};

let buyer : S.Customer = {
  id = 1; kind = #company; name = "Kund AB"; orgNr = ?"556036-0793"; vatNr = null;
  address = { street = "Vägen 2"; postalCode = "111 22"; city = "Stockholm"; country = "SE" };
  email = null; peppolId = null; termsDays = 30; language = #sv; reminderFeeAgreed = false; active = true;
};

let params : S.Parameters = {
  referenceRates = [{ from = "2026-01-01"; rateBp = 200 }, { from = "2026-07-01"; rateBp = 200 }];
  lateInterestMarginBp = 800; reminderFee = 6_000; forseningsersattning = 45_000; simplifiedInvoiceLimit = 400_000;
  ocrLengthDigit = true; source = "test";
};

func line(qty : Int, price : Int, vat : Text, account : Nat) : S.DocLine = {
  itemId = null; description = "Tjänst"; quantity = qty; unit = "h"; unitPrice = price; discountBp = 0; vatCode = vat; account;
};

func input(lines : [S.DocLine]) : S.DocInput = {
  customerId = 1; language = #sv; deliveryDate = null; validUntil = null; termsDays = 30; currency = "SEK"; fxRate = null;
  lines; ourRef = null; yourRef = null; notes = null;
};

func ok(r : { #ok : S.Snapshot; #err : Types.Error }) : S.Snapshot = switch (r) {
  case (#ok(x)) x;
  case (#err(_)) { assert false; loop {} };
};

func isErr(r : { #ok : S.Snapshot; #err : Types.Error }, e : Types.Error) : Bool = switch (r) { case (#err(x)) { x == e }; case (_) { false } };

func sum(ls : [Types.VoucherLine]) : Int { var t : Int = 0; for (l in ls.values()) t += l.amount; t };
func amountOn(ls : [Types.VoucherLine], acc : Nat) : Int { var t : Int = 0; for (l in ls.values()) if (l.account == acc) t += l.amount; t };

suite("Invoice arithmetic", func() {
  test("line net: quantity in thousandths, discount, half away from zero", func() {
    expect.int(Invoice.lineNet(line(1_500, 99_999, "U25", 3001))).equal(149_999); // 1,5 × 999,99 = 1 499,985 → 1 499,99
    expect.int(Invoice.lineNet({ (line(1_000, 10_000, "U25", 3001)) with discountBp = 1_250 })).equal(8_750);
    expect.int(Invoice.divRound(-5, 10)).equal(-1);
  });
  test("VAT per rate on the summed base; totals", func() {
    let x = ok(Invoice.build(#invoice, 7, input([line(1_000, 10_001, "U25", 3001), line(1_000, 10_001, "U25", 3001), line(2_000, 5_000, "U12", 3002)]), ?company, buyer, newChart(), params, "2026-03-01", null));
    expect.nat(x.vat.size()).equal(2);
    expect.int(x.totalNet).equal(30_002);
    // 20 002 × 25 % = 5 000,5 → 5 001; 10 000 × 12 % = 1 200
    expect.int(x.totalVat).equal(6_201);
    expect.int(x.total).equal(36_203);
    expect.text(x.dueDate ?? "").equal("2026-03-31");
    assert x.legalNotes.size() == 0;
    assert x.ocr == ?Invoice.ocrFor(7, true);
  });
  test("delivery date is printed only when it differs (ML 17:24 8)", func() {
    let same = ok(Invoice.build(#invoice, 1, { (input([line(1_000, 100, "U25", 3001)])) with deliveryDate = ?"2026-03-01" }, ?company, buyer, newChart(), params, "2026-03-01", null));
    assert same.deliveryDate == null;
    let other = ok(Invoice.build(#invoice, 1, { (input([line(1_000, 100, "U25", 3001)])) with deliveryDate = ?"2026-02-20" }, ?company, buyer, newChart(), params, "2026-03-01", null));
    assert other.deliveryDate == ?"2026-02-20";
  });
});

suite("Mandatory content per VAT treatment", func() {
  test("EU services need the buyer's VAT number and carry 'Omvänd betalningsskyldighet'", func() {
    let eu = { buyer with address = { buyer.address with country = "DE" }; orgNr = null };
    assert isErr(Invoice.build(#invoice, 1, input([line(1_000, 100_000, "EUTJ", 3308)]), ?company, eu, newChart(), params, "2026-03-01", null), #invalid("buyer.vatNr"));
    let x = ok(Invoice.build(#invoice, 1, input([line(1_000, 100_000, "EUTJ", 3308)]), ?company, { eu with vatNr = ?"DE123456789" }, newChart(), params, "2026-03-01", null));
    assert x.legalNotes == ["Omvänd betalningsskyldighet"];
    expect.int(x.totalVat).equal(0);
    assert x.vat[0].category == "AE";
  });
  test("EU goods: exemption reference; export goods: exempt; English wording", func() {
    let eu = { buyer with vatNr = ?"FI12345678"; language = #en };
    let x = ok(Invoice.build(#invoice, 1, { (input([line(1_000, 100, "EUVA", 3108), line(1_000, 100, "EXPV", 3105)])) with language = #en }, ?company, eu, newChart(), params, "2026-03-01", null));
    assert x.legalNotes == ["Exempt", "Exempt, Article 138 of the VAT directive"];
  });
  test("no company profile, no lines, bad account or VAT code, purchase VAT code: rejected", func() {
    let c = newChart();
    assert isErr(Invoice.build(#invoice, 1, input([line(1_000, 100, "U25", 3001)]), null, buyer, c, params, "2026-03-01", null), #invalid("company"));
    assert isErr(Invoice.build(#invoice, 1, input([]), ?company, buyer, c, params, "2026-03-01", null), #invalid("lines"));
    assert isErr(Invoice.build(#invoice, 1, input([line(1_000, 100, "U25", 1930)]), ?company, buyer, c, params, "2026-03-01", null), #invalid("lines[0].account"));
    assert isErr(Invoice.build(#invoice, 1, input([line(1_000, 100, "I", 3001)]), ?company, buyer, c, params, "2026-03-01", null), #invalid("lines[0].vatCode"));
    assert isErr(Invoice.build(#invoice, 1, input([line(0, 100, "U25", 3001)]), ?company, buyer, c, params, "2026-03-01", null), #invalid("lines[0].quantity"));
  });
  test("other currency needs a rate; VAT also in SEK (ML 17:29)", func() {
    let eur = { (input([line(1_000, 10_000, "U25", 3001)])) with currency = "EUR" };
    assert isErr(Invoice.build(#invoice, 1, eur, ?company, buyer, newChart(), params, "2026-03-01", null), #invalid("fxRate"));
    let x = ok(Invoice.build(#invoice, 1, { eur with fxRate = ?{ rate = 11_234_500; date = "2026-02-28" } }, ?company, buyer, newChart(), params, "2026-03-01", null));
    expect.int(x.totalVat).equal(2_500); // 25,00 EUR
    assert x.totalVatSek == ?28_086; // 25,00 × 11,2345 = 280,86 SEK
  });
});

suite("OCR", func() {
  test("length digit and Luhn check digit", func() {
    expect.text(Invoice.ocrFor(123, true)).equal("12351"); // 123 + length digit 5 + check digit 1
    expect.text(Invoice.ocrFor(123, false)).equal("1230");
    for (n in [1, 9, 42, 1001, 987_654].values()) assert Validate.luhn(Invoice.ocrFor(n, true));
  });
});

suite("Late interest (Räntelagen 3, 6 §§)", func() {
  test("reference rate + 8 pp, actual/365, from the day after the due date", func() {
    let (i, rate) = Invoice.interest(100_000, "2026-01-31", "2026-03-02", params.referenceRates, 800);
    expect.int(rate).equal(1_000);
    expect.int(i).equal(822); // 1 000,00 kr × 10 % × 30/365 = 8,22 kr
    let (none, _) = Invoice.interest(100_000, "2026-03-02", "2026-03-02", params.referenceRates, 800);
    expect.int(none).equal(0);
  });
  test("each half-year at its own rate", func() {
    let rates = [{ from = "2026-01-01"; rateBp = 200 }, { from = "2026-07-01"; rateBp = 400 }];
    let (i, rate) = Invoice.interest(365_000, "2026-06-30", "2026-07-02", rates, 800);
    expect.int(rate).equal(1_200);
    expect.int(i).equal(240); // 2 days × 3 650,00 kr × 12 % / 365 = 2,40 kr
  });
});

suite("Reminder fees (1981:739)", func() {
  test("B2B: 450 kr once, never with a reminder fee; private: 60 kr only if agreed", func() {
    assert Invoice.reminderFee(#company, true, params, false) == (45_000, "forseningsersattning");
    assert Invoice.reminderFee(#company, true, params, true) == (0, "none");
    assert Invoice.reminderFee(#person, true, params, false) == (6_000, "reminderFee");
    assert Invoice.reminderFee(#person, false, params, false) == (0, "none");
  });
});

suite("Sales vouchers", func() {
  let c = newChart();
  let x = ok(Invoice.build(#invoice, 1, input([line(1_000, 100_000, "U25", 3001), line(1_000, 10_000, "U6", 3003)]), ?company, buyer, c, params, "2026-03-01", null));
  test("invoice: 1510 against revenue and output VAT, balanced", func() {
    let ls = SalesLib.issueLines(x, c);
    expect.int(sum(ls)).equal(0);
    expect.int(amountOn(ls, 1510)).equal(x.total);
    expect.int(amountOn(ls, 3001)).equal(-100_000);
    expect.int(amountOn(ls, 2611)).equal(-25_000);
    expect.int(amountOn(ls, 2631)).equal(-600);
  });
  test("credit note reverses it", func() {
    let cn = ok(Invoice.build(#creditNote, 2, input([line(1_000, 100_000, "U25", 3001), line(1_000, 10_000, "U6", 3003)]), ?company, buyer, c, params, "2026-03-05", ?{ number = 1; issueDate = "2026-03-01" }));
    let ls = SalesLib.issueLines(cn, c);
    expect.int(sum(ls)).equal(0);
    expect.int(amountOn(ls, 1510)).equal(-x.total);
    expect.int(amountOn(ls, 2611)).equal(25_000);
    assert cn.ocr == null;
  });
  let pay : S.PaymentInput = { salesDocId = 1; date = "2026-03-20"; amount = x.total; amountSek = null; interest = 500; fees = 0; method = #bankgiro; reference = null };
  test("payment, invoice method: bank against 1510, interest to 8313", func() {
    let ls = SalesLib.paymentLines(pay, x, c, false);
    expect.int(sum(ls)).equal(0);
    expect.int(amountOn(ls, 1930)).equal(x.total + 500);
    expect.int(amountOn(ls, 1510)).equal(-x.total);
    expect.int(amountOn(ls, 8313)).equal(-500);
  });
  test("payment, cash method: revenue and VAT pro rata", func() {
    let half = x.total / 2;
    let ls = SalesLib.paymentLines({ pay with amount = half; interest = 0 }, x, c, true);
    expect.int(sum(ls)).equal(0);
    expect.int(amountOn(ls, 1510)).equal(0);
    expect.int(amountOn(ls, 3001) + amountOn(ls, 3003) + amountOn(ls, 2611) + amountOn(ls, 2631)).equal(-half);
  });
  test("foreign currency: FX gain on receipt", func() {
    let eur = ok(Invoice.build(#invoice, 3, { (input([line(1_000, 10_000, "U25", 3001)])) with currency = "EUR"; fxRate = ?{ rate = 11_000_000; date = "2026-02-28" } }, ?company, buyer, c, params, "2026-03-01", null));
    let ls = SalesLib.paymentLines({ pay with amount = eur.total; amountSek = ?140_000; interest = 0 }, eur, c, false);
    expect.int(sum(ls)).equal(0);
    expect.int(amountOn(ls, 1510)).equal(-137_500); // 125,00 EUR × 11
    expect.int(amountOn(ls, 3960)).equal(-2_500);
  });
});
