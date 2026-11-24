// Admin management. Every change is mirrored on the frontend canister
// (authorize/deauthorize) so admins can Publish SEO files there.
import Array "mo:core/Array";
import Error "mo:core/Error";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Auth "../lib/Auth";
import Frontend "../lib/Frontend";
import Types "../types";

mixin (admins : Types.Admins) {
  /// Bounded wait: a stuck frontend call must not block backend upgrades.
  transient let frontendTimeoutSecs : Nat32 = 60;

  public shared query ({ caller }) func whoami() : async Types.Whoami {
    { principal = caller; isAdmin = Auth.isAdmin(admins, caller) };
  };

  public shared query ({ caller }) func listAdmins() : async Result.Result<[Types.AdminView], Types.Error> {
    if (not Auth.canManageAdmins(admins, caller)) return #err(#notAuthorized);
    #ok(admins.entries().map(func((principal, addedAt)) = { principal; addedAt }).toArray());
  };

  public shared ({ caller }) func addAdmin(p : Principal) : async Result.Result<(), Types.Error> {
    if (not Auth.canManageAdmins(admins, caller)) return #err(#notAuthorized);
    if (p.isAnonymous()) return #err(#invalid("principal"));
    let fe = Frontend.canister<system>() ?? (return #err(#frontend("frontend canister id not set")));
    let isNew = not admins.containsKey(p);
    // Record first so a concurrent call sees it; undo if the frontend refuses.
    if (isNew) admins.add(p, Time.now());
    try {
      await (with timeout = frontendTimeoutSecs) fe.authorize(p);
      #ok(());
    } catch e {
      if (isNew) admins.remove(p);
      #err(#frontend(e.message()));
    };
  };

  public shared ({ caller }) func removeAdmin(p : Principal) : async Result.Result<(), Types.Error> {
    if (not Auth.canManageAdmins(admins, caller)) return #err(#notAuthorized);
    let addedAt = admins.get(p) ?? (return #err(#notFound));
    if (admins.size() <= 1) return #err(#lastAdmin);
    let fe = Frontend.canister<system>() ?? (return #err(#frontend("frontend canister id not set")));
    // Remove before the await so a concurrent removal can't take the last admin.
    admins.remove(p);
    try {
      await (with timeout = frontendTimeoutSecs) fe.deauthorize(p);
      #ok(());
    } catch e {
      admins.add(p, addedAt);
      #err(#frontend(e.message()));
    };
  };

  /// Makes the frontend's authorized set equal the admin set. Run after deploys:
  /// a frontend reinstall wipes its authorized list.
  public shared ({ caller }) func syncAdminsToFrontend() : async Result.Result<{ authorized : Nat; deauthorized : Nat }, Types.Error> {
    if (not Auth.canManageAdmins(admins, caller)) return #err(#notAuthorized);
    let fe = Frontend.canister<system>() ?? (return #err(#frontend("frontend canister id not set")));
    try {
      let current = await (with timeout = frontendTimeoutSecs) fe.list_authorized();
      var authorized = 0;
      var deauthorized = 0;
      for (p in admins.keys()) {
        if (not current.contains(p)) {
          await (with timeout = frontendTimeoutSecs) fe.authorize(p);
          authorized += 1;
        };
      };
      for (p in current.values()) {
        if (not admins.containsKey(p)) {
          await (with timeout = frontendTimeoutSecs) fe.deauthorize(p);
          deauthorized += 1;
        };
      };
      #ok({ authorized; deauthorized });
    } catch e {
      #err(#frontend(e.message()));
    };
  };
};
