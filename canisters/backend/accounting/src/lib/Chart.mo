// Fiscal years (BFL 3 kap.), accounts, VAT codes and series.
import Int "mo:core/Int";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Dates "Dates";
import Types "../types";

module {
  type R<T> = Result.Result<T, Types.Error>;

  public func months(fy : { start : Text; end : Text }) : Nat = Int.abs(Dates.monthIndex(fy.start, fy.end)) + 1;

  public func last(chart : Types.Chart) : ?Types.FiscalYear = switch (chart.fiscalYears.maxEntry()) {
    case (?(_, fy)) { ?fy };
    case null { null };
  };

  /// A year is whole calendar months. It is normally 12 months (3 kap. 1 §); the
  /// first year, or a change of fiscal year (`changeover`), may run 1–18 months
  /// (3 kap. 3 §). Years follow each other with no gap or overlap.
  public func checkNewYear(chart : Types.Chart, start : Text, end : Text, changeover : Bool) : R<()> {
    if (not Dates.isValid(start) or not Dates.isFirstOfMonth(start)) return #err(#invalid("start"));
    if (not Dates.isValid(end) or not Dates.isLastOfMonth(end) or end < start) return #err(#invalid("end"));
    let n = months({ start; end });
    switch (last(chart)) {
      case null { if (n > 18) return #err(#invalid("length")) };
      case (?prev) {
        if (start != Dates.addDays(prev.end, 1)) return #err(#invalid("start"));
        if (n != 12 and not (changeover and n <= 18)) return #err(#invalid("length"));
      };
    };
    #ok(());
  };

  public func yearOf(chart : Types.Chart, date : Text) : ?Types.FiscalYear {
    chart.fiscalYears.values().find(func(fy : Types.FiscalYear) : Bool = fy.start <= date and date <= fy.end);
  };

  /// open ⇄ closing → locked. Locked is final, and years lock in order.
  public func checkStatus(chart : Types.Chart, fy : Types.FiscalYear, next : Types.FiscalYearStatus) : R<()> {
    switch (fy.status, next) {
      case (#open, #closing) { #ok(()) };
      case (#closing, #open) { #ok(()) };
      case (#closing, #locked) {
        let earlierOpen = chart.fiscalYears.values().any(func(y : Types.FiscalYear) : Bool = y.id != fy.id and y.end < fy.start and y.status != #locked);
        if (earlierOpen) #err(#conflict("earlier year not locked")) else #ok(());
      };
      case (_) { #err(#invalid("status")) };
    };
  };

  public func checkAccount(a : Types.Account, chart : Types.Chart) : R<()> {
    if (a.number < 1000 or a.number > 8999) return #err(#invalid("number"));
    let name = a.name.trim(#char ' ');
    if (name.size() == 0 or name.size() > 100) return #err(#invalid("name"));
    switch (a.vatCode) {
      case (?c) { if (not chart.vatCodes.containsKey(c)) return #err(#invalid("vatCode")) };
      case null {};
    };
    switch (a.sruCode) {
      case (?s) { if (s.size() == 0 or s.size() > 10) return #err(#invalid("sruCode")) };
      case null {};
    };
    #ok(());
  };

  public func kindFor(number : Nat) : Types.AccountKind {
    if (number < 2000) #asset
    else if (number < 2100) #equity
    else if (number < 3000) #liability
    else if (number < 4000 or (number >= 8300 and number < 8400)) #revenue
    else #expense;
  };
};
