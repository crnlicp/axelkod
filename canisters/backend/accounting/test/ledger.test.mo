// Fiscal years, posting rules, gapless numbering, corrections and balances.
import { suite; test; expect } "mo:test";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Chart "../src/lib/Chart";
import Ledger "../src/lib/Ledger";
import Seed "../src/lib/Seed";
import Types "../src/types";

let me = Principal.fromText("aaaaa-aa");

func newChart() : Types.Chart {
  let c : Types.Chart = { fiscalYears = Map.empty(); accounts = Map.empty(); vatCodes = Map.empty(); series = Map.empty() };
  for (a in Seed.accounts.values()) c.accounts.add(a.number, a);
  for (v in Seed.vatCodes().values()) c.vatCodes.add(v.code, v);
  for (s in Seed.series.values()) c.series.add(s.code, s);
  c;
};

func newLedger() : Types.Ledger = {
  vouchers = Map.empty();
  drafts = Map.empty();
  numbering = Map.empty();
  correctionsOf = Map.empty();
  balances = Map.empty();
};

func line(account : Nat, amount : Int) : Types.VoucherLine = {
  account; amount; vatCode = null; costCenter = null; project = null; quantity = null; text = null;
};

func sale(date : Text, series : Text) : Types.VoucherInput = {
  series;
  eventDate = date;
  description = "Försäljning";
  lines = [line(1930, 12_500), line(3001, -10_000), { line(2611, -2_500) with vatCode = ?"U25" }];
  attachmentIds = [];
  counterparty = ?"Kund AB";
};

let noFiles = func(_ : Nat) : Bool = false;

func isOk<T>(r : { #ok : T; #err : Types.Error }) : Bool = switch (r) { case (#ok(_)) { true }; case (_) { false } };

func isErr<T>(r : { #ok : T; #err : Types.Error }, e : Types.Error) : Bool = switch (r) { case (#err(x)) { x == e }; case (_) { false } };

func addYear(c : Types.Chart, id : Nat, start : Text, end : Text) {
  c.fiscalYears.add(id, { id; start; end; status = #open; lockedAt = null });
};

suite("Fiscal years", func() {
  test("first year may run 1–18 whole months", func() {
    let c = newChart();
    assert Chart.checkNewYear(c, "2026-03-01", "2027-06-30", false) == #ok(());
    assert isErr(Chart.checkNewYear(c, "2026-01-01", "2027-07-31", false), #invalid("length"));
    assert isErr(Chart.checkNewYear(c, "2026-01-02", "2026-12-31", false), #invalid("start"));
    assert isErr(Chart.checkNewYear(c, "2026-01-01", "2026-12-30", false), #invalid("end"));
  });
  test("later years follow on and are 12 months unless changed over", func() {
    let c = newChart();
    addYear(c, 1, "2026-01-01", "2026-12-31");
    assert Chart.checkNewYear(c, "2027-01-01", "2027-12-31", false) == #ok(());
    assert isErr(Chart.checkNewYear(c, "2027-02-01", "2028-01-31", false), #invalid("start"));
    assert isErr(Chart.checkNewYear(c, "2027-01-01", "2028-06-30", false), #invalid("length"));
    assert Chart.checkNewYear(c, "2027-01-01", "2028-06-30", true) == #ok(());
    assert isErr(Chart.checkNewYear(c, "2027-01-01", "2028-07-31", true), #invalid("length"));
  });
  test("status: open ⇄ closing → locked, in order", func() {
    let c = newChart();
    addYear(c, 1, "2026-01-01", "2026-12-31");
    addYear(c, 2, "2027-01-01", "2027-12-31");
    let y1 = { id = 1; start = "2026-01-01"; end = "2026-12-31"; status = #closing; lockedAt = null } : Types.FiscalYear;
    let y2 = { y1 with id = 2; start = "2027-01-01"; end = "2027-12-31" };
    assert isErr(Chart.checkStatus(c, { y1 with status = #open }, #locked), #invalid("status"));
    assert isErr(Chart.checkStatus(c, y2, #locked), #conflict("earlier year not locked"));
    assert Chart.checkStatus(c, y1, #locked) == #ok(());
    assert isErr(Chart.checkStatus(c, { y1 with status = #locked }, #open), #invalid("status"));
  });
});

suite("Posting", func() {
  test("rejects unbalanced, empty, zero and unknown lines", func() {
    let c = newChart();
    addYear(c, 1, "2026-01-01", "2026-12-31");
    let v = sale("2026-03-10", "A");
    assert isErr(Ledger.check(c, null, { v with lines = [line(1930, 100), line(3001, -99)] }, noFiles), #invalid("unbalanced"));
    assert isErr(Ledger.check(c, null, { v with lines = [line(1930, 0), line(3001, 0)] }, noFiles), #invalid("lines[0].amount"));
    assert isErr(Ledger.check(c, null, { v with lines = [line(1930, 100)] }, noFiles), #invalid("lines"));
    assert isErr(Ledger.check(c, null, { v with lines = [line(1930, 100), line(9999, -100)] }, noFiles), #invalid("lines[1].account"));
    assert isErr(Ledger.check(c, null, { v with series = "Q" }, noFiles), #invalid("series"));
    assert isErr(Ledger.check(c, null, { v with description = "  " }, noFiles), #invalid("description"));
    assert isErr(Ledger.check(c, null, { v with attachmentIds = [7] }, noFiles), #invalid("attachmentIds"));
  });
  test("needs an unlocked fiscal year and a date after the lock date", func() {
    let c = newChart();
    addYear(c, 1, "2026-01-01", "2026-12-31");
    assert isErr(Ledger.check(c, null, sale("2027-01-05", "A"), noFiles), #invalid("noFiscalYear"));
    assert isErr(Ledger.check(c, ?"2026-03-31", sale("2026-03-31", "A"), noFiles), #locked("lockDate"));
    assert isOk(Ledger.check(c, ?"2026-03-31", sale("2026-04-01", "A"), noFiles));
    c.fiscalYears.add(1, { id = 1; start = "2026-01-01"; end = "2026-12-31"; status = #locked; lockedAt = ?1 });
    assert isErr(Ledger.check(c, null, sale("2026-04-01", "A"), noFiles), #locked("fiscalYear"));
  });
  test("numbers are gapless per series and fiscal year", func() {
    let c = newChart();
    let l = newLedger();
    addYear(c, 1, "2026-01-01", "2026-12-31");
    addYear(c, 2, "2027-01-01", "2027-12-31");
    var id = 1;
    func postOk(v : Types.VoucherInput) : Types.Voucher {
      switch (Ledger.check(c, null, v, noFiles)) {
        case (#ok(fy)) { let x = Ledger.post(l, fy, id, v, #manual, null, me, 0); id += 1; x };
        case (#err(_)) { assert false; loop {} };
      };
    };
    // A rejected voucher between two good ones takes no number.
    let a1 = postOk(sale("2026-01-10", "A"));
    assert isErr(Ledger.check(c, null, { (sale("2026-01-11", "A")) with lines = [line(1930, 1), line(3001, -2)] }, noFiles), #invalid("unbalanced"));
    let a2 = postOk(sale("2026-02-10", "A"));
    let f1 = postOk(sale("2026-02-11", "F"));
    let a3 = postOk(sale("2026-12-31", "A"));
    let next = postOk(sale("2027-01-01", "A"));
    expect.nat(a1.number).equal(1);
    expect.nat(a2.number).equal(2);
    expect.nat(a3.number).equal(3);
    expect.nat(f1.number).equal(1);
    expect.nat(next.number).equal(1);
    expect.nat(next.fiscalYearId).equal(2);
    expect.text(a1.retainUntil).equal("2033-12-31");
  });
  test("corrections reference the original and reverse it", func() {
    let c = newChart();
    let l = newLedger();
    addYear(c, 1, "2026-01-01", "2026-12-31");
    let fy = switch (Ledger.check(c, null, sale("2026-05-02", "A"), noFiles)) { case (#ok(f)) f; case (#err(_)) { assert false; loop {} } };
    let orig = Ledger.post(l, fy, 1, sale("2026-05-02", "A"), #manual, null, me, 0);
    let fix : Types.VoucherInput = { (sale("2026-05-03", "C")) with lines = Ledger.reversal(orig.lines) };
    switch (Ledger.check(c, null, fix, noFiles)) {
      case (#ok(f)) { ignore Ledger.post(l, f, 2, fix, #manual, ?1, me, 0) };
      case (#err(_)) { assert false };
    };
    let view = Ledger.view(l, { attachments = Map.empty(); tickets = Map.empty(); links = Map.empty(); voucherLinks = Map.empty() }, orig);
    assert view.correctedBy == [2];
    // Original and reversal cancel out in the balances.
    for (row in Ledger.balances(l, fy).values()) assert row.months[4] == 0;
  });
  test("balances accumulate per account and month", func() {
    let c = newChart();
    let l = newLedger();
    addYear(c, 1, "2026-07-01", "2027-06-30");
    var id = 1;
    for (d in ["2026-07-15", "2026-07-20", "2027-06-30"].values()) {
      switch (Ledger.check(c, null, sale(d, "A"), noFiles)) {
        case (#ok(fy)) { ignore Ledger.post(l, fy, id, sale(d, "A"), #manual, null, me, 0); id += 1 };
        case (#err(_)) { assert false };
      };
    };
    let fy = c.fiscalYears.get(1) ?? { id = 0; start = ""; end = ""; status = #open; lockedAt = null };
    let rows = Ledger.balances(l, fy);
    expect.nat(rows.size()).equal(3);
    for (row in rows.values()) {
      expect.nat(row.months.size()).equal(12);
      if (row.account == 1930) {
        expect.int(row.months[0]).equal(25_000);
        expect.int(row.months[11]).equal(12_500);
      };
    };
  });
});
