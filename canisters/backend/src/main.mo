// Composition root: owns state and includes mixins. No public methods here.
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Timer "mo:core/Timer";
import MessagesLib "lib/Messages";
import AdminsMixin "mixins/Admins";
import MessagesMixin "mixins/Messages";
import SettingsMixin "mixins/Settings";
import Types "types";

// `firstAdmin` is the optional install argument `(opt principal "...")`. A plain
// deploy passes nothing (null), so upgrades never change the admin set.
actor class Backend(firstAdmin : ?Principal) {
  let admins : Types.Admins;
  let messages : Types.Messages;
  let config : Types.Config;

  // Only takes effect while there are no admins (first install); the last admin
  // can never be removed, so later deploys can't re-seed it.
  switch (firstAdmin) {
    case (?p) { if (admins.isEmpty() and not p.isAnonymous()) admins.add(p, Time.now()) };
    case null {};
  };

  include AdminsMixin(admins);
  include MessagesMixin(admins, messages);
  include SettingsMixin(admins, config);

  // Timers don't survive upgrades, so this is re-registered on every start.
  transient let _retentionTimer = Timer.recurringTimer<system>(
    #hours(24),
    func() : async () {
      ignore MessagesLib.purgeBefore(messages, MessagesLib.retentionCutoff(Time.now(), config.site.retentionMonths));
    },
  );
};
