// Composition root: owns state and includes mixins. No public methods here.
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Timer "mo:core/Timer";
import Time "mo:core/Time";
import Store "lib/Store";
import VaultMixin "mixins/Vault";
import Types "types";

actor Vault {
  let roles : Types.Roles;
  let store : Types.Store;

  transient let accounting : ?Principal = switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:accounting")) {
    case (?id) { ?Principal.fromText(id) };
    case null { null };
  };

  include VaultMixin(roles, store, accounting);

  // Rejects anonymous and oversized calls before they run; a chunk is at most
  // Store.CHUNK bytes plus the Candid envelope.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not caller.isAnonymous() and arg.size() <= Store.CHUNK + 4_096;
  };

  // Abandoned uploads are dropped after a day. Timers don't survive upgrades,
  // so this is registered on every start.
  transient let _cleanup = Timer.recurringTimer<system>(#hours(1), func() : async () { Store.dropExpired(store, Time.now()) });
};
