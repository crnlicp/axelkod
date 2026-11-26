// ROT/RUT (V12): the deduction on labour incl. VAT, truncated to whole kronor; caps per
// buyer; the split between buyers; the partial-payment share; the issue and decision vouchers.
import { suite; test; expect } "mo:test";
import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Invoice "../src/lib/Invoice";
import RotRut "../src/lib/RotRut";
import SalesLib "../src/lib/Sales";
import Seed "../src/lib/Seed";
import R "../src/types/RotRut";
import S "../src/types/Sales";
import Types "../src/types";

func newChart() : Types.Chart {
  let c : Types.Chart = { fiscalYears = Map.empty(); accounts = Map.empty(); vatCodes = Map.empty(); series = Map.empty() };
  for (a in Seed.accounts.values()) c.accounts.add(a.number, a);
  for (v in Seed.vatCodes().values()) c.vatCodes.add(v.code, v);
  c;
};

let company : Types.CompanyProfile = {
  legalName = "El AB"; orgNr = "556036-0793"; vatNr = "SE556036079301"; registeredOffice = "Göteborg"; street = "Gatan 1";
  postalCode = "411 01"; city = "Göteborg"; country = "SE"; email = "a@b.se"; phone = null; web = null; bankgiro = null;
  plusgiro = null; iban = null; bic = null; fSkatt = true; peppolId = null;
};

let person : S.Customer = {
  id = 1; kind = #person; name = "Anna Andersson"; orgNr = null; vatNr = null;
  address = { street = "Vägen 2"; postalCode = "111 22"; city = "Stockholm"; country = "SE" };
  email = null; peppolId = null; termsDays = 30; language = #sv; reminderFeeAgreed = false; active = true;
};

let params : S.Parameters = {
  referenceRates = [{ from = "2026-01-01"; rateBp = 200 }]; lateInterestMarginBp = 800; reminderFee = 6_000;
  forseningsersattning = 45_000; simplifiedInvoiceLimit = 400_000; ocrLengthDigit = true; source = "test";
};

let husParams : [R.HusParams] = [{
  from = "2026-01-01"; rotBp = 3_000; rutBp = 5_000; rotCap = 5_000_000; totalCap = 7_500_000; xml11From = "2027-01-01"; source = "V12";
}];

func line(net : Int) : S.DocLine = {
  itemId = null; description = "Rad"; quantity = 1_000; unit = "st"; unitPrice = net; discountBp = 0; vatCode = "U25"; account = 3001;
};

func snap(lines : [S.DocLine], buyer : S.Customer, currency : Text) : S.Snapshot {
  let input : S.DocInput = {
    customerId = 1; language = #sv; deliveryDate = null; validUntil = null; termsDays = 30; currency;
    fxRate = if (currency == "SEK") null else ?{ rate = 11_000_000; date = "2026-03-01" };
    lines; ourRef = null; yourRef = null; notes = null; hus = null;
  };
  switch (Invoice.build(#invoice, 1, input, ?company, buyer, newChart(), params, "2026-03-01", null)) {
    case (#ok(x)) x;
    case (#err(_)) { assert false; loop {} };
  };
};

let enc = "\01\02\03" : Blob;
func buyers(shares : [Nat]) : [R.HusBuyerInput] = shares.map(func s = { identityEnc = enc; shareBp = s });

func hus(kind : R.HusKind, parts : [?R.HusLinePart], shares : [Nat]) : R.HusInput = {
  kind; lineParts = parts; buyers = buyers(shares); propertyEnc = if (kind == #rot) ?enc else null; deductionLimit = null;
};

func ok(r : { #ok : R.HusPart; #err : Types.Error }) : R.HusPart = switch (r) {
  case (#ok(x)) x;
  case (#err(_)) { assert false; loop {} };
};
func isErr(r : { #ok : R.HusPart; #err : Types.Error }, field : Text) : Bool = switch (r) { case (#err(#invalid(f))) { f == field }; case (_) { false } };
func amountOn(ls : [Types.VoucherLine], acc : Nat) : Int { var t : Int = 0; for (l in ls.values()) if (l.account == acc) t += l.amount; t };
func sum(ls : [Types.VoucherLine]) : Int { var t : Int = 0; for (l in ls.values()) t += l.amount; t };

// Skatteverket's example (V12): labour 10 000, material 8 000, travel 400, 25 % VAT.
let elLines = [line(1_000_000), line(800_000), line(40_000)];
let elParts : [?R.HusLinePart] = [?#labour("EL"), ?#material("EL"), ?#other];

suite("ROT/RUT deduction", func() {
  test("Skatteverket's example: 30 % of labour incl. VAT = 3 750 kr, the customer pays 19 250 kr", func() {
    let x0 = snap(elLines, person, "SEK");
    let h = ok(RotRut.part(hus(#rot, elParts, [10_000]), x0, husParams));
    expect.int(h.labour).equal(1_250_000);
    expect.int(h.material).equal(1_000_000);
    expect.int(h.other).equal(50_000);
    expect.int(h.deduction).equal(375_000);
    let x = { x0 with hus = ?h };
    expect.int(x.total).equal(2_300_000);
    expect.int(RotRut.customerPart(x)).equal(1_925_000);
    // Issue voucher: the customer's part on 1510, the deduction on 1513 (BAS "Kundfordringar – delad faktura").
    let ls = SalesLib.issueLines(x, newChart());
    expect.int(amountOn(ls, 1510)).equal(1_925_000);
    expect.int(amountOn(ls, 1513)).equal(375_000);
    expect.int(sum(ls)).equal(0);
  });
  test("RUT 50 %, truncated to whole kronor", func() {
    let x = snap([line(100_100)], person, "SEK"); // 1 001 kr + VAT = 1 251,25 kr
    let h = ok(RotRut.part(hus(#rut, [?#labour("IT_TJANSTER")], [10_000]), x, husParams));
    expect.int(h.deduction).equal(62_500); // 625,625 → 625 kr
  });
  test("caps per buyer and year: ROT 50 000, RUT 75 000", func() {
    let big = snap([line(20_000_000)], person, "SEK"); // 250 000 kr incl. VAT
    assert isErr(RotRut.part(hus(#rot, [?#labour("BYGG")], [10_000]), big, husParams), "hus.cap"); // 75 000 > 50 000
    let two = ok(RotRut.part(hus(#rot, [?#labour("BYGG")], [5_000, 5_000]), big, husParams));
    expect.int(two.buyers[0].amount).equal(3_750_000);
    assert isErr(RotRut.part(hus(#rut, [?#labour("STADNING")], [10_000]), big, husParams), "hus.cap"); // 125 000 > 75 000
    let limited = ok(RotRut.part({ (hus(#rut, [?#labour("STADNING")], [10_000])) with deductionLimit = ?7_500_000 }, big, husParams));
    expect.int(limited.deduction).equal(7_500_000);
    assert isErr(RotRut.part({ (hus(#rut, [?#labour("STADNING")], [10_000])) with deductionLimit = ?7_500_050 }, big, husParams), "hus.deductionLimit");
  });
  test("split between buyers in whole kronor; the first takes the remainder", func() {
    let parts = RotRut.split(375_000, [3_333, 6_667]);
    expect.int(parts[0]).equal(125_000);
    expect.int(parts[1]).equal(250_000);
    expect.int(parts[0] + parts[1]).equal(375_000);
  });
  test("rules: SEK, a private buyer, property for ROT only, shares, work types", func() {
    let x = snap(elLines, person, "SEK");
    assert isErr(RotRut.part(hus(#rot, elParts, [10_000]), snap(elLines, person, "EUR"), husParams), "hus.currency");
    assert isErr(RotRut.part(hus(#rot, elParts, [10_000]), snap(elLines, { person with kind = #company }, "SEK"), husParams), "hus.buyer");
    assert isErr(RotRut.part({ (hus(#rot, elParts, [10_000])) with propertyEnc = null }, x, husParams), "hus.property");
    assert isErr(RotRut.part({ (hus(#rut, [?#labour("STADNING"), null, null], [10_000])) with propertyEnc = ?enc }, x, husParams), "hus.property");
    assert isErr(RotRut.part(hus(#rot, elParts, [5_000, 4_000]), x, husParams), "hus.shares");
    assert isErr(RotRut.part(hus(#rot, [?#labour("EL"), ?#material("VVS"), null], [10_000]), x, husParams), "hus.material");
    assert isErr(RotRut.part(hus(#rot, [?#labour("STADNING"), null, null], [10_000]), x, husParams), "hus.lineParts[0]");
    assert isErr(RotRut.part(hus(#rot, [null, ?#material("EL"), null], [10_000]), x, husParams), "hus.labour");
    assert isErr(RotRut.part(hus(#rot, [?#labour("EL")], [10_000]), x, husParams), "hus.lineParts");
    assert isErr(RotRut.part(hus(#rot, elParts, [10_000]), x, []), "hus.params");
  });
});

suite("ROT/RUT claims", func() {
  let x0 = snap(elLines, person, "SEK");
  let x = { x0 with hus = ?ok(RotRut.part(hus(#rot, elParts, [10_000]), x0, husParams)) };
  test("partial payment: the same share of the deduction as the share paid", func() {
    // 40 % of 19 250 kr paid → 40 % of 3 750 kr; then the rest.
    let a = switch (RotRut.caseAmounts(x, 0, 770_000)) { case (#ok(c)) c; case (#err(_)) { assert false; loop {} } };
    expect.int(a.requested).equal(150_000);
    expect.int(a.labour).equal(500_000);
    expect.int(a.paidLabour).equal(350_000);
    let b = switch (RotRut.caseAmounts(x, 770_000, 1_155_000)) { case (#ok(c)) c; case (#err(_)) { assert false; loop {} } };
    expect.int(b.requested).equal(225_000);
    expect.int(a.requested + b.requested).equal(375_000);
    expect.int(a.labour + b.labour).equal(1_250_000);
    // Overpaying claims nothing more.
    assert (switch (RotRut.caseAmounts(x, 1_925_000, 10_000)) { case (#err(#invalid("requested"))) true; case (_) false });
  });
  test("hours per work type, whole hours", func() {
    let h = switch (x.hus) { case (?h) h; case null { assert false; loop {} } };
    assert (switch (RotRut.checkHours(h, [{ workType = "EL"; hours = 12 }])) { case (#ok(v)) v[0].hours == 12; case (_) false });
    assert (switch (RotRut.checkHours(h, [])) { case (#err(_)) true; case (_) false });
    assert (switch (RotRut.checkHours(h, [{ workType = "EL"; hours = 0 }])) { case (#err(_)) true; case (_) false });
    assert (switch (RotRut.checkHours(h, [{ workType = "VVS"; hours = 3 }])) { case (#err(_)) true; case (_) false });
  });
  test("deadline 31 January the year after payment; claim name; reference", func() {
    expect.text(RotRut.deadline(2026)).equal("2027-01-31");
    assert RotRut.claimName("Begäran november") == ?"Begäran november";
    assert RotRut.claimName("Sjutton tecken xx") == null;
    assert RotRut.validReference("20260000185");
    assert RotRut.validReference("20260000185-01");
    assert not RotRut.validReference("2026000018");
    assert not RotRut.validReference("20260000185-");
  });
  test("decision voucher: payout from 1513, a refused part moves to the customer", func() {
    let ls = RotRut.decisionLines(300_000, 375_000, 1930);
    expect.int(amountOn(ls, 1930)).equal(300_000);
    expect.int(amountOn(ls, 1510)).equal(75_000);
    expect.int(amountOn(ls, 1513)).equal(-375_000);
    expect.int(sum(ls)).equal(0);
    // Cash method: the payout is revenue and VAT pro rata.
    let cash = SalesLib.husPayoutLines(x, newChart(), 375_000, 1930);
    expect.int(sum(cash)).equal(0);
    expect.int(amountOn(cash, 1930)).equal(375_000);
    expect.int(amountOn(cash, 2611)).equal(-75_000); // 3 750 × 20 %, as in Skatteverket's example
  });
  test("parameters in force on a date", func() {
    assert RotRut.paramsOn(husParams, "2025-12-31") == null;
    assert (switch (RotRut.paramsOn(husParams, "2026-06-01")) { case (?p) p.rotBp == 3_000; case null false });
    assert (switch (RotRut.checkParams({ husParams[0] with totalCap = 100 })) { case (#err(_)) true; case (_) false });
  });
});
