// Civil dates as "YYYY-MM-DD" (proleptic Gregorian, UTC). Days are counted
// from 1970-01-01 with Hinnant's days_from_civil / civil_from_days.
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Char "mo:core/Char";
import Nat32 "mo:core/Nat32";

module {
  public type Civil = { y : Nat; m : Nat; d : Nat };

  let NS_PER_DAY : Int = 86_400_000_000_000;

  func leap(y : Nat) : Bool = (y % 4 == 0 and y % 100 != 0) or y % 400 == 0;

  public func daysInMonth(y : Nat, m : Nat) : Nat {
    if (m == 2) { if (leap(y)) 29 else 28 } else if (m == 4 or m == 6 or m == 9 or m == 11) 30 else 31;
  };

  func digits(cs : [Char], from : Nat, count : Nat) : ?Nat {
    var n = 0;
    var i = from;
    while (i < from + count) {
      let c = cs[i];
      if (c < '0' or c > '9') return null;
      n := n * 10 + (c.toNat32() - '0'.toNat32()).toNat();
      i += 1;
    };
    ?n;
  };

  /// Strict "YYYY-MM-DD", years 1900–2199.
  public func parse(t : Text) : ?Civil {
    let cs = t.toArray();
    if (cs.size() != 10 or cs[4] != '-' or cs[7] != '-') return null;
    let y = digits(cs, 0, 4) ?? (return null);
    let m = digits(cs, 5, 2) ?? (return null);
    let d = digits(cs, 8, 2) ?? (return null);
    if (y < 1900 or y > 2199 or m < 1 or m > 12 or d < 1 or d > daysInMonth(y, m)) return null;
    ?{ y; m; d };
  };

  public func isValid(t : Text) : Bool = parse(t) != null;

  func pad(n : Nat, width : Nat) : Text {
    var s = n.toText();
    while (s.size() < width) s := "0" # s;
    s;
  };

  public func format(c : Civil) : Text = pad(c.y, 4) # "-" # pad(c.m, 2) # "-" # pad(c.d, 2);

  public func toDays(c : Civil) : Int {
    let y : Int = if (c.m <= 2) c.y - 1 else c.y;
    let era = (if (y >= 0) y else y - 399) / 400;
    let yoe = y - era * 400;
    let mp : Int = if (c.m > 2) c.m - 3 else c.m + 9;
    let doy = (153 * mp + 2) / 5 + c.d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468;
  };

  public func fromDays(z0 : Int) : Civil {
    let z = z0 + 719468;
    let era = (if (z >= 0) z else z - 146096) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if (mp < 10) mp + 3 else mp - 9;
    let y = yoe + era * 400 + (if (m <= 2) 1 else 0);
    { y = Int.abs(y); m = Int.abs(m); d = Int.abs(d) };
  };

  /// Day number of a valid date (traps on invalid input: validate first).
  public func days(t : Text) : Int = toDays(parse(t) ?? { y = 1970; m = 1; d = 1 });

  public func addDays(t : Text, n : Int) : Text = format(fromDays(days(t) + n));

  public func fromTime(ns : Int) : Text {
    let d = if (ns >= 0) ns / NS_PER_DAY else (ns - NS_PER_DAY + 1) / NS_PER_DAY;
    format(fromDays(d));
  };

  public func dayNumber(ns : Int) : Nat = Int.abs(ns / NS_PER_DAY);

  /// Months from the month of `start` to the month of `date` (0 = same month).
  public func monthIndex(start : Text, date : Text) : Int {
    let s = parse(start) ?? { y = 1970; m = 1; d = 1 };
    let x = parse(date) ?? { y = 1970; m = 1; d = 1 };
    (x.y * 12 + x.m : Int) - (s.y * 12 + s.m : Int);
  };

  public func isFirstOfMonth(t : Text) : Bool = switch (parse(t)) { case (?c) { c.d == 1 }; case null { false } };

  public func isLastOfMonth(t : Text) : Bool = switch (parse(t)) {
    case (?c) { c.d == daysInMonth(c.y, c.m) };
    case null { false };
  };

  /// BFL 7:2: kept through the 7th year after the calendar year in which the
  /// fiscal year ended, so the last day is 31 Dec of (end year + 7).
  public func retainUntil(fiscalYearEnd : Text) : Text {
    let c = parse(fiscalYearEnd) ?? { y = 1970; m = 1; d = 1 };
    format({ y = c.y + 7; m = 12; d = 31 });
  };
};
