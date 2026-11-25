// Roles. Owners manage them; at least one owner always remains. Every change is
// pushed to the vault, which checks callers against its own copy (C17).
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import Encode "../lib/Encode";
import Roles "../lib/Roles";
import Vault "../lib/Vault";
import Types "../types";

mixin (roles : Types.Roles, audit : Types.Audit) {
  /// Bounded wait: a stuck vault call must not block upgrades.
  transient let vaultTimeoutSecs : Nat32 = 60;

  func roleList() : [(Principal, Types.Role)] = roles.entries().map(func((p, a)) = (p, a.role)).toArray();

  func pushRoles(v : Vault.Vault) : async Bool {
    try {
      await (with timeout = vaultTimeoutSecs) v.setRoles(roleList());
      true;
    } catch _ { false };
  };

  public shared query ({ caller }) func me() : async Types.Me {
    { principal = caller; role = Roles.roleOf(roles, caller) };
  };

  /// Called by the admin UI after sign-in so logins appear in the audit log.
  public shared ({ caller }) func signIn() : async Types.Me {
    let role = Roles.roleOf(roles, caller);
    if (role != null) ignore Audit.append(audit, Time.now(), caller, "login", "session", null, #null_);
    { principal = caller; role };
  };

  public shared query ({ caller }) func listRoles() : async Result.Result<[Types.RoleView], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(roles.entries().map(func((principal, a)) = { principal; role = a.role; addedAt = a.addedAt; addedBy = a.addedBy }).toArray());
  };

  public shared ({ caller }) func setRole(p : Principal, role : Types.Role) : async Result.Result<{ mirrored : Bool }, Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    if (p.isAnonymous()) return #err(#invalid("principal"));
    if (Roles.isOwner(roles, p) and role != #owner and Roles.ownerCount(roles) <= 1) return #err(#lastOwner);
    let now = Time.now();
    roles.add(p, { role; addedAt = now; addedBy = caller });
    ignore Audit.append(audit, now, caller, "role.set", "role", null, #obj([("principal", #text(p.toText())), ("role", Encode.role(role))]));
    let v = Vault.canister<system>() ?? (return #ok({ mirrored = false }));
    #ok({ mirrored = await pushRoles(v) });
  };

  public shared ({ caller }) func removeRole(p : Principal) : async Result.Result<{ mirrored : Bool }, Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    if (not roles.containsKey(p)) return #err(#notFound);
    if (Roles.isOwner(roles, p) and Roles.ownerCount(roles) <= 1) return #err(#lastOwner);
    roles.remove(p);
    ignore Audit.append(audit, Time.now(), caller, "role.remove", "role", null, #obj([("principal", #text(p.toText()))]));
    let v = Vault.canister<system>() ?? (return #ok({ mirrored = false }));
    #ok({ mirrored = await pushRoles(v) });
  };

  /// Repairs the vault's copy, e.g. after a vault reinstall.
  public shared ({ caller }) func syncRolesToVault() : async Result.Result<(), Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    let v = Vault.canister<system>() ?? (return #err(#vault("vault canister id not set")));
    if (await pushRoles(v)) #ok(()) else #err(#vault("setRoles failed"));
  };
};
