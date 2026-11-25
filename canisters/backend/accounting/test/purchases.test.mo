// Purchase vouchers per VAT treatment (V22), cash-method payments, bank suggestions,
// rules, duplicate keys and tax-account postings (V24).
import { suite; test; expect } "mo:test";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import BankLib "../src/lib/Bank";
import Purchase "../src/lib/Purchase";
import Seed "../src/lib/Seed";
import B "../src/types/Bank";
import P "../src/types/Purchases";
import Types "../src/types";

func newChart() : Types.Chart {
  let c : Types.Chart = { fiscalYears = Map.empty(); accounts = Map.empty(); vatCodes = Map.empty(); series = Map.empty() };
  for (a in Seed.accounts.values()) c.accounts.add(a.number, a);
  for (v in Seed.vatCodes().values()) c.vatCodes.add(v.code, v);
  c;
};

let chart = newChart();

func doc(kind : P.PurchaseKind, t : P.Treatment, lines : [P.PurchaseLine], total : Int) : P.PurchaseInput = {
  kind; supplierId = ?1; payee = null; docDate = "2026-11-02"; dueDate = ?"2026-12-02"; docNumber = ?"A-17"; currency = "SEK";
  fxRate = null; treatment = t; lines; total; paymentRef = ?"12351"; paidFrom = null; creditOf = null; description = "Inköp";
  attachmentIds = [7];
};

func pl(account : Nat, net : Int, rateBp : Nat, vat : Int) : P.PurchaseLine = { account; net; rateBp; vat; text = null };

func sum(ls : [Types.VoucherLine]) : Int { var t : Int = 0; for (l in ls.values()) t += l.amount; t };
func on(ls : [Types.VoucherLine], acc : Nat) : Int { var t : Int = 0; for (l in ls.values()) if (l.account == acc) t += l.amount; t };

func checked(x : P.PurchaseInput) : ?Types.Error = switch (Purchase.check(x, chart, func _ = true, func _ = true, "2026-11-25")) {
  case (#ok(_)) null;
  case (#err(e)) ?e;
};

suite("Purchase vouchers per VAT treatment", func() {
  test("domestic: cost and input VAT 2641 against 2440", func() {
    let ls = Purchase.bookLines(doc(#supplierInvoice, #domestic, [pl(6212, 80_000, 2500, 20_000)], 100_000), chart);
    expect.int(on(ls, 6212)).equal(80_000);
    expect.int(on(ls, 2641)).equal(20_000);
    expect.int(on(ls, 2440)).equal(-100_000);
    expect.int(sum(ls)).equal(0);
  });
  test("EU goods (16:17): Swedish VAT computed, 2645 debit and 2614 credit, payable is the net", func() {
    let ls = Purchase.bookLines(doc(#supplierInvoice, #euGoods, [pl(4515, 5_500_000, 2500, 0)], 5_500_000), chart);
    expect.int(on(ls, 4515)).equal(5_500_000);
    expect.int(on(ls, 2645)).equal(1_375_000); // Skatteverket's example: 55 000 → 13 750
    expect.int(on(ls, 2614)).equal(-1_375_000);
    expect.int(on(ls, 2440)).equal(-5_500_000);
    expect.int(sum(ls)).equal(0);
  });
  test("non-EU services 12 % and domestic construction RC: 2624 / 2647", func() {
    let a = Purchase.bookLines(doc(#supplierInvoice, #nonEuServices, [pl(4532, 10_000, 1200, 0)], 10_000), chart);
    expect.int(on(a, 2645)).equal(1_200);
    expect.int(on(a, 2624)).equal(-1_200);
    let b = Purchase.bookLines(doc(#supplierInvoice, #seServicesRC, [pl(4425, 40_000, 2500, 0)], 40_000), chart);
    expect.int(on(b, 2647)).equal(10_000);
    expect.int(on(b, 2614)).equal(-10_000);
    expect.int(on(b, 2645)).equal(0);
  });
  test("foreign currency: SEK at the document's rate", func() {
    let x = { doc(#supplierInvoice, #euServices, [pl(4535, 100_000, 2500, 0)], 100_000) with currency = "EUR"; fxRate = ?{ rate = 11_000_000; date = "2026-11-02" } };
    let ls = Purchase.bookLines(x, chart);
    expect.int(on(ls, 4535)).equal(1_100_000); // 1 000 EUR × 11,00
    expect.int(on(ls, 2645)).equal(275_000);
  });
  test("credit note, receipt and expense claim: reversed, 1910 cash, 2820 employee", func() {
    let cn = Purchase.bookLines(doc(#creditNote, #domestic, [pl(6212, 8_000, 2500, 2_000)], 10_000), chart);
    expect.int(on(cn, 2440)).equal(10_000);
    expect.int(on(cn, 2641)).equal(-2_000);
    let rc = Purchase.bookLines({ doc(#receipt, #domestic, [pl(6110, 4_000, 2500, 1_000)], 5_000) with paidFrom = ?#cash }, chart);
    expect.int(on(rc, 1910)).equal(-5_000);
    let ec = Purchase.bookLines({ doc(#expenseClaim, #domestic, [pl(6110, 4_000, 2500, 1_000)], 5_000) with payee = ?"Anna" }, chart);
    expect.int(on(ec, 2820)).equal(-5_000);
  });
});

suite("Purchase checks", func() {
  test("totals must add up; reverse charge carries no VAT on the document and needs a rate", func() {
    expect.bool(checked(doc(#supplierInvoice, #domestic, [pl(6212, 80_000, 2500, 20_000)], 100_000)) == null).isTrue();
    expect.bool(checked(doc(#supplierInvoice, #domestic, [pl(6212, 80_000, 2500, 20_000)], 99_999)) == ?#invalid("total")).isTrue();
    expect.bool(checked(doc(#supplierInvoice, #euGoods, [pl(4515, 80_000, 2500, 20_000)], 100_000)) == ?#invalid("vat")).isTrue();
    expect.bool(checked(doc(#supplierInvoice, #euGoods, [pl(4515, 80_000, 0, 0)], 80_000)) == ?#invalid("rateBp")).isTrue();
  });
  test("foreign VAT is never deducted: no VAT line allowed without Swedish treatment", func() {
    expect.bool(checked(doc(#supplierInvoice, #noVat, [pl(6212, 100_000, 2500, 25_000)], 125_000)) == ?#invalid("vat")).isTrue();
    let ls = Purchase.bookLines(doc(#supplierInvoice, #noVat, [pl(6212, 125_000, 0, 0)], 125_000), chart);
    expect.int(on(ls, 2641) + on(ls, 2645)).equal(0);
  });
  test("the original file is required; supplier, payee and paidFrom by kind", func() {
    expect.bool(checked({ doc(#supplierInvoice, #domestic, [pl(6212, 800, 2500, 200)], 1_000) with attachmentIds = [] }) == ?#invalid("attachmentIds")).isTrue();
    expect.bool(checked({ doc(#supplierInvoice, #domestic, [pl(6212, 800, 2500, 200)], 1_000) with supplierId = null }) == ?#invalid("supplierId")).isTrue();
    expect.bool(checked(doc(#receipt, #domestic, [pl(6212, 800, 2500, 200)], 1_000)) == ?#invalid("paidFrom")).isTrue();
    expect.bool(checked(doc(#expenseClaim, #domestic, [pl(6212, 800, 2500, 200)], 1_000)) == ?#invalid("payee")).isTrue();
    expect.bool(checked({ doc(#supplierInvoice, #domestic, [pl(6212, 800, 2500, 200)], 1_000) with docDate = "2026-12-01" }) == ?#invalid("docDate")).isTrue();
  });
});

suite("Supplier payments", func() {
  test("invoice method: 2440 against the bank, FX loss when paying more SEK", func() {
    let x = { doc(#supplierInvoice, #euServices, [pl(4535, 100_000, 2500, 0)], 100_000) with currency = "EUR"; fxRate = ?{ rate = 11_000_000; date = "2026-11-02" } };
    let ls = Purchase.payLines({ purchaseId = 1; date = "2026-11-20"; amount = 100_000; amountSek = ?1_120_000; reference = null }, x, chart, false, 1930);
    expect.int(on(ls, 2440)).equal(1_100_000);
    expect.int(on(ls, 1930)).equal(-1_120_000);
    expect.int(on(ls, 7960)).equal(20_000);
    expect.int(sum(ls)).equal(0);
  });
  test("cash method: cost, VAT and the reverse-charge pair pro rata at payment", func() {
    let x = doc(#supplierInvoice, #domestic, [pl(6212, 80_000, 2500, 20_000)], 100_000);
    let half = Purchase.payLines({ purchaseId = 1; date = "2026-11-20"; amount = 50_000; amountSek = null; reference = null }, x, chart, true, 1930);
    expect.int(on(half, 6212)).equal(40_000);
    expect.int(on(half, 2641)).equal(10_000);
    expect.int(sum(half)).equal(0);
    let rc = doc(#supplierInvoice, #euServices, [pl(4535, 33_333, 2500, 0)], 33_333);
    let part = Purchase.payLines({ purchaseId = 1; date = "2026-11-20"; amount = 10_000; amountSek = null; reference = null }, rc, chart, true, 1930);
    expect.int(on(part, 2645) + on(part, 2614)).equal(0);
    expect.int(sum(part)).equal(0);
  });
});

func row(date : Text, amount : Int, text : Text, reference : ?Text) : B.Row = { date; amount; text; reference; counterparty = null };

suite("Bank matching", func() {
  let invoices : [BankLib.OpenItem] = [
    { id = 10; title = "Faktura 123"; ocr = ?"12351"; balanceSek = 375_000; dueDate = ?"2026-11-30" },
    { id = 11; title = "Faktura 124"; ocr = ?"12450"; balanceSek = 99_900; dueDate = ?"2026-11-30" },
  ];
  let purchases : [BankLib.OpenItem] = [{ id = 20; title = "Telia, A-17"; ocr = null; balanceSek = 49_900; dueDate = ?"2026-11-28" }];
  let rules : [B.Rule] = [{ id = 30; contains = "telia"; account = 6212; vatRateBp = 2500; description = "Telefon" }];
  test("OCR first: an OCR in the reference wins over the amount", func() {
    let s = BankLib.suggest(row("2026-11-29", 99_900, "BG INBET", ?"12351"), invoices, purchases, rules);
    expect.bool(s[0].target == #invoice(10) and s[0].reason == #ocr).isTrue();
    expect.nat(s.size()).equal(1);
  });
  test("then amount within ±10 days of the due date; then rules", func() {
    let s = BankLib.suggest(row("2026-12-05", 99_900, "KUND AB", null), invoices, purchases, rules);
    expect.bool(s[0].target == #invoice(11) and s[0].reason == #amount).isTrue();
    expect.nat(BankLib.suggest(row("2027-01-05", 99_900, "KUND AB", null), invoices, purchases, rules).size()).equal(0);
    let out = BankLib.suggest(row("2026-11-28", -49_900, "TELIA SVERIGE", null), invoices, purchases, rules);
    expect.bool(out[0].target == #purchase(20) and out[1].target == #rule(30)).isTrue();
  });
  test("rule lines split the included VAT", func() {
    let ls = BankLib.ruleLines(rules[0], -49_900, 1930);
    expect.int(on(ls, 1930)).equal(-49_900);
    expect.int(on(ls, 2641)).equal(9_980);
    expect.int(on(ls, 6212)).equal(39_920);
    expect.int(sum(ls)).equal(0);
  });
  test("duplicate key: same row twice in one file stays two rows; re-import is a duplicate", func() {
    let r = row("2026-11-02", -10_000, "Kortköp ", ?"X");
    expect.text(BankLib.key(1, r, 0)).equal(BankLib.key(1, { r with text = "kortköp" }, 0));
    expect.bool(BankLib.key(1, r, 0) != BankLib.key(1, r, 1)).isTrue();
    expect.bool(BankLib.key(1, r, 0) != BankLib.key(2, r, 0)).isTrue();
  });
});

suite("Tax account (V24)", func() {
  test("interest income 8314 and cost 8423 against 1630; payments are linked, not booked", func() {
    expect.bool(BankLib.taxCounter(#interestIncome) == ?8314).isTrue();
    expect.bool(BankLib.taxCounter(#interestCost) == ?8423).isTrue();
    expect.bool(BankLib.taxCounter(#payment) == null).isTrue();
    let ls = BankLib.taxLines(-12_500_00, 2650);
    expect.int(on(ls, 1630)).equal(-12_500_00);
    expect.int(on(ls, 2650)).equal(12_500_00);
  });
  test("every A5 account is seeded", func() {
    for (n in [2624, 2634, 2645, 2647, 2820, 4415, 4425, 4516, 4537, 8314, 8423, 1630, 2518, 2650].values()) expect.bool(chart.accounts.containsKey(n)).isTrue();
  });
});
