// Composition root: owns state and includes mixins. No public methods here.
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Audit "lib/Audit";
import Seed "lib/Seed";
import AttachmentsMixin "mixins/Attachments";
import AuditMixin "mixins/Audit";
import ChartMixin "mixins/Chart";
import KeysMixin "mixins/Keys";
import LedgerMixin "mixins/Ledger";
import RolesMixin "mixins/Roles";
import SettingsMixin "mixins/Settings";
import Types "types";

// `firstOwner` is the optional install argument `(opt principal "...")`. It only
// takes effect while there are no roles; controllers get no business methods (C15).
actor class Accounting(firstOwner : ?Principal) {
  let roles : Types.Roles;
  let config : Types.Config;
  let chart : Types.Chart;
  let ledger : Types.Ledger;
  let files : Types.Files;
  let counters : Types.Counters;
  let audit : Types.Audit;
  let keyUse : Types.KeyUse;

  switch (firstOwner) {
    case (?p) {
      if (roles.isEmpty() and not p.isAnonymous()) {
        let now = Time.now();
        roles.add(p, { role = #owner; addedAt = now; addedBy = p });
        ignore Audit.append(audit, now, p, "role.set", "role", null, #obj([("principal", #text(p.toText())), ("role", #tag("owner", #null_)), ("via", #text("install"))]));
      };
    };
    case null {};
  };

  // Seed data is add-only: a new seed version adds missing accounts, VAT codes and
  // series but never changes existing ones (they may have been edited).
  if (config.seedVersion != Seed.VERSION) {
    for (a in Seed.accounts.values()) if (not chart.accounts.containsKey(a.number)) chart.accounts.add(a.number, a);
    for (c in Seed.vatCodes().values()) if (not chart.vatCodes.containsKey(c.code)) chart.vatCodes.add(c.code, c);
    for (s in Seed.series.values()) if (not chart.series.containsKey(s.code)) chart.series.add(s.code, s);
    config.seedVersion := Seed.VERSION;
  };

  include RolesMixin(roles, audit);
  include SettingsMixin(roles, config, audit);
  include ChartMixin(roles, chart, counters, audit);
  include LedgerMixin(roles, config, chart, ledger, files, counters, audit);
  include AttachmentsMixin(roles, ledger, files, counters, audit);
  include AuditMixin(roles, audit);
  include KeysMixin(roles, config, keyUse, audit);

  // Rejects oversized calls before they run (saves cycles; every method still
  // validates its own input). A 500-line voucher fits well within this.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not caller.isAnonymous() and arg.size() <= 262_144;
  };
};
