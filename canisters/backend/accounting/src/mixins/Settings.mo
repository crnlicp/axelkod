// Company legal profile (C6), accounting settings and the lock date. Owner-only writes.
import Result "mo:core/Result";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import Dates "../lib/Dates";
import Encode "../lib/Encode";
import Roles "../lib/Roles";
import Validate "../lib/Validate";
import Types "../types";

mixin (roles : Types.Roles, config : Types.Config, audit : Types.Audit) {
  public shared query ({ caller }) func getCompany() : async Result.Result<?Types.CompanyProfile, Types.Error> {
    if (not Roles.canSeeSetup(roles, caller)) return #err(#notAuthorized);
    #ok(config.company);
  };

  public shared ({ caller }) func setCompany(c : Types.CompanyProfile) : async Result.Result<Types.CompanyProfile, Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    switch (Validate.company(c)) {
      case (#err(e)) { #err(e) };
      case (#ok(clean)) {
        config.company := ?clean;
        ignore Audit.append(audit, Time.now(), caller, "company.set", "company", null, Encode.company(clean));
        #ok(clean);
      };
    };
  };

  public shared query ({ caller }) func getSettings() : async Result.Result<{ settings : Types.AccountingSettings; lockDate : ?Types.Date }, Types.Error> {
    if (not Roles.canSeeSetup(roles, caller)) return #err(#notAuthorized);
    #ok({ settings = config.settings; lockDate = config.lockDate });
  };

  public shared ({ caller }) func setSettings(s : Types.AccountingSettings) : async Result.Result<(), Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    switch (Validate.settings(s)) {
      case (#err(e)) { #err(e) };
      case (#ok(clean)) {
        config.settings := clean;
        let method = switch (clean.accountingMethod) { case (#invoice) "invoice"; case (#cash) "cash" };
        let period = switch (clean.vatPeriod) { case (#month) "month"; case (#quarter) "quarter"; case (#year) "year" };
        ignore Audit.append(audit, Time.now(), caller, "settings.set", "settings", null, #obj([
          ("accountingMethod", #text(method)),
          ("vatPeriod", #text(period)),
          ("invoiceTermsDays", #int(clean.invoiceTermsDays)),
          ("storageNotice", switch (clean.storageNotice) { case (?n) #obj([("date", #text(n.date)), ("location", #text(n.location))]); case null #null_ }),
          ("modules", #obj([("payroll", #bool(clean.modules.payroll)), ("rotRut", #bool(clean.modules.rotRut)), ("inventory", #bool(clean.modules.inventory))])),
        ]));
        #ok(());
      };
    };
  };

  /// Moves the lock date forward (never back), up to today.
  public shared ({ caller }) func setLockDate(date : Types.Date) : async Result.Result<(), Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    if (not Dates.isValid(date)) return #err(#invalid("date"));
    let now = Time.now();
    if (date > Dates.fromTime(now)) return #err(#invalid("future"));
    switch (config.lockDate) {
      case (?d) { if (date <= d) return #err(#invalid("backwards")) };
      case null {};
    };
    config.lockDate := ?date;
    ignore Audit.append(audit, now, caller, "lockDate.set", "settings", null, #obj([("lockDate", #text(date))]));
    #ok(());
  };
};
