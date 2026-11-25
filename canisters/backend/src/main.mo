// Composition root: owns state and includes mixins. No public methods here.
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Random "mo:core/Random";
import Time "mo:core/Time";
import Timer "mo:core/Timer";
import MessagesLib "lib/Messages";
import AdminsMixin "mixins/Admins";
import ContactFormMixin "mixins/ContactForm";
import HomeMixin "mixins/Home";
import MessagesMixin "mixins/Messages";
import NewsMixin "mixins/News";
import SettingsMixin "mixins/Settings";
import Types "types";

// `firstAdmin` is the optional install argument `(opt principal "...")`. A plain
// deploy passes nothing (null), so upgrades never change the admin set.
actor class Backend(firstAdmin : ?Principal) {
  let admins : Types.Admins;
  let messages : Types.Messages;
  let config : Types.Config;
  let counters : Types.Counters;
  let form : Types.FormState;
  let news : Types.NewsStore;

  // Only takes effect while there are no admins (first install); the last admin
  // can never be removed, so later deploys can't re-seed it.
  switch (firstAdmin) {
    case (?p) { if (admins.isEmpty() and not p.isAnonymous()) admins.add(p, Time.now()) };
    case null {};
  };

  include AdminsMixin(admins);
  include MessagesMixin(admins, messages);
  include SettingsMixin(admins, config);
  include ContactFormMixin(messages, counters, form);
  include NewsMixin(admins, news, counters, config);
  include HomeMixin(admins, config);

  // raw_rand is async, so the form secret is created right after the first install.
  transient let _secretTimer = Timer.setTimer<system>(
    #seconds(0),
    func() : async () {
      if (form.secret.size() == 0) form.secret := await Random.blob();
    },
  );

  // Rejects oversized calls before they are executed (saves cycles; not a security
  // boundary — every method still validates its own input).
  system func inspect({ arg : Blob }) : Bool {
    arg.size() <= 16_384;
  };

  // Timers don't survive upgrades, so this is re-registered on every start.
  transient let _retentionTimer = Timer.recurringTimer<system>(
    #hours(24),
    func() : async () {
      ignore MessagesLib.purgeBefore(messages, MessagesLib.retentionCutoff(Time.now(), config.site.retentionMonths));
    },
  );
};
