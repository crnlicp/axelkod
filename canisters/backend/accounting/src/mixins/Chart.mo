// Fiscal years, accounts, VAT codes and series.
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import Chart "../lib/Chart";
import Roles "../lib/Roles";
import Types "../types";

mixin (roles : Types.Roles, chart : Types.Chart, counters : Types.Counters, audit : Types.Audit) {
  public shared query ({ caller }) func listFiscalYears() : async Result.Result<[Types.FiscalYear], Types.Error> {
    if (not Roles.canSeeSetup(roles, caller)) return #err(#notAuthorized);
    #ok(chart.fiscalYears.values().toArray());
  };

  public shared ({ caller }) func createFiscalYear(start : Types.Date, end : Types.Date, changeover : Bool) : async Result.Result<Types.FiscalYear, Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    switch (Chart.checkNewYear(chart, start, end, changeover)) { case (#err(e)) { return #err(e) }; case (#ok) {} };
    let fy : Types.FiscalYear = { id = counters.nextFiscalYear; start; end; status = #open; lockedAt = null };
    counters.nextFiscalYear += 1;
    chart.fiscalYears.add(fy.id, fy);
    ignore Audit.append(audit, Time.now(), caller, "fiscalYear.create", "fiscalYear", ?fy.id, #obj([("start", #text(start)), ("end", #text(end)), ("changeover", #bool(changeover))]));
    #ok(fy);
  };

  public shared ({ caller }) func setFiscalYearStatus(id : Nat, status : Types.FiscalYearStatus) : async Result.Result<Types.FiscalYear, Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    let fy = chart.fiscalYears.get(id) ?? (return #err(#notFound));
    switch (Chart.checkStatus(chart, fy, status)) { case (#err(e)) { return #err(e) }; case (#ok) {} };
    let now = Time.now();
    let next = { fy with status; lockedAt = if (status == #locked) ?now else null };
    chart.fiscalYears.add(id, next);
    let name = switch (status) { case (#open) "open"; case (#closing) "closing"; case (#locked) "locked" };
    ignore Audit.append(audit, now, caller, "fiscalYear.status", "fiscalYear", ?id, #obj([("status", #text(name))]));
    #ok(next);
  };

  public shared query ({ caller }) func listAccounts() : async Result.Result<[Types.Account], Types.Error> {
    if (not Roles.canSeeSetup(roles, caller)) return #err(#notAuthorized);
    #ok(chart.accounts.values().toArray());
  };

  public shared ({ caller }) func addAccount(number : Nat, name : Text, vatCode : ?Text, sruCode : ?Text) : async Result.Result<Types.Account, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (chart.accounts.containsKey(number)) return #err(#conflict("account exists"));
    let a : Types.Account = { number; name = name.trim(#char ' '); kind = Chart.kindFor(number); vatCode; sruCode; active = true; bas = false };
    switch (Chart.checkAccount(a, chart)) { case (#err(e)) { return #err(e) }; case (#ok) {} };
    chart.accounts.add(number, a);
    ignore Audit.append(audit, Time.now(), caller, "account.add", "account", ?number, #obj([("name", #text(a.name))]));
    #ok(a);
  };

  /// The number and kind never change; vouchers refer to the number.
  public shared ({ caller }) func updateAccount(number : Nat, name : Text, vatCode : ?Text, sruCode : ?Text, active : Bool) : async Result.Result<Types.Account, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let old = chart.accounts.get(number) ?? (return #err(#notFound));
    let a = { old with name = name.trim(#char ' '); vatCode; sruCode; active };
    switch (Chart.checkAccount(a, chart)) { case (#err(e)) { return #err(e) }; case (#ok) {} };
    chart.accounts.add(number, a);
    ignore Audit.append(audit, Time.now(), caller, "account.update", "account", ?number, #obj([("name", #text(a.name)), ("active", #bool(active))]));
    #ok(a);
  };

  public shared query ({ caller }) func listVatCodes() : async Result.Result<[Types.VatCode], Types.Error> {
    if (not Roles.canSeeSetup(roles, caller)) return #err(#notAuthorized);
    #ok(chart.vatCodes.values().toArray());
  };

  public shared query ({ caller }) func listSeries() : async Result.Result<[Types.Series], Types.Error> {
    if (not Roles.canSeeSetup(roles, caller)) return #err(#notAuthorized);
    #ok(chart.series.values().toArray());
  };
};
