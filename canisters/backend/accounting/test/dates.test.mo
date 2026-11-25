import { suite; test; expect } "mo:test";
import Dates "../src/lib/Dates";

suite("Dates", func() {
  test("strict parsing", func() {
    assert Dates.isValid("2026-02-28");
    assert Dates.isValid("2028-02-29");
    assert not Dates.isValid("2026-02-29");
    assert not Dates.isValid("2100-02-29");
    assert Dates.isValid("2000-02-29");
    assert not Dates.isValid("2026-13-01");
    assert not Dates.isValid("2026-1-01");
    assert not Dates.isValid("2026-01-01 ");
    assert not Dates.isValid("20260101xx");
  });
  test("day arithmetic round-trips", func() {
    expect.text(Dates.addDays("2026-12-31", 1)).equal("2027-01-01");
    expect.text(Dates.addDays("2028-03-01", -1)).equal("2028-02-29");
    expect.text(Dates.addDays("1970-01-01", -1)).equal("1969-12-31");
    expect.int(Dates.days("1970-01-01")).equal(0);
    expect.int(Dates.days("2026-11-25")).equal(20_782);
  });
  test("time to date", func() {
    expect.text(Dates.fromTime(0)).equal("1970-01-01");
    expect.text(Dates.fromTime(20_782 * 86_400_000_000_000 + 1)).equal("2026-11-25");
  });
  test("month index and month ends", func() {
    expect.int(Dates.monthIndex("2026-01-01", "2026-01-31")).equal(0);
    expect.int(Dates.monthIndex("2026-07-01", "2027-06-30")).equal(11);
    assert Dates.isLastOfMonth("2026-04-30");
    assert not Dates.isLastOfMonth("2026-04-29");
    assert Dates.isFirstOfMonth("2026-04-01");
  });
  test("retention: through 31 Dec of the 7th year after the year the FY ended", func() {
    expect.text(Dates.retainUntil("2026-12-31")).equal("2033-12-31");
    expect.text(Dates.retainUntil("2027-06-30")).equal("2034-12-31");
  });
});
