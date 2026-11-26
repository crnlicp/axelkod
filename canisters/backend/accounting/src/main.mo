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
import BankMixin "mixins/Bank";
import ChartMixin "mixins/Chart";
import KeysMixin "mixins/Keys";
import LedgerMixin "mixins/Ledger";
import PartiesMixin "mixins/Parties";
import PurchasesMixin "mixins/Purchases";
import RolesMixin "mixins/Roles";
import SalesMixin "mixins/Sales";
import SettingsMixin "mixins/Settings";
import VatMixin "mixins/Vat";
import B "types/Bank";
import P "types/Purchases";
import S "types/Sales";
import V "types/Vat";
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
  let sales : S.Sales;
  let purchases : P.Purchases;
  let bank : B.Bank;
  let vat : V.Vat;

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
  // series but never changes existing ones (they may have been edited). The only
  // exception fills fields earlier seeds left empty: VAT codes without boxes (V3) and
  // accounts without a VAT code.
  if (config.seedVersion != Seed.VERSION) {
    for (a in Seed.accounts.values()) switch (chart.accounts.get(a.number)) {
      case null { chart.accounts.add(a.number, a) };
      case (?x) { if (x.vatCode == null and a.vatCode != null) chart.accounts.add(a.number, { x with vatCode = a.vatCode }) };
    };
    for (c in Seed.vatCodes().values()) switch (chart.vatCodes.get(c.code)) {
      case null { chart.vatCodes.add(c.code, c) };
      case (?x) { if (x.boxBase == null and x.boxVat == null) chart.vatCodes.add(c.code, { x with boxBase = c.boxBase; boxVat = c.boxVat }) };
    };
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
  include PartiesMixin(roles, chart, sales, audit);
  include SalesMixin(roles, config, chart, ledger, files, counters, audit, sales);
  include PurchasesMixin(roles, config, chart, ledger, files, counters, audit, purchases);
  include BankMixin(roles, config, chart, ledger, files, counters, audit, sales, purchases, bank);
  include VatMixin(roles, config, chart, ledger, files, counters, audit, sales, purchases, bank, vat);

  // Rejects oversized calls before they run (saves cycles; every method still
  // validates its own input). A 500-line voucher fits well within this.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not caller.isAnonymous() and arg.size() <= 262_144;
  };
};
