// vetKeys for client-side encryption (C16). Each derivation costs cycles, so it
// is limited per principal per day and logged.
import Error "mo:core/Error";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import Dates "../lib/Dates";
import Keys "../lib/Keys";
import Roles "../lib/Roles";
import Types "../types";

mixin (roles : Types.Roles, config : Types.Config, keyUse : Types.KeyUse, audit : Types.Audit) {
  func pinnedKey<system>() : Keys.KeyId {
    let k = Keys.keyId<system>(config.vetkdKey);
    if (config.vetkdKey == null) config.vetkdKey := ?k.name;
    k;
  };

  public shared ({ caller }) func vetkdPublicKey() : async Result.Result<Blob, Types.Error> {
    if (not Roles.canSeeSetup(roles, caller)) return #err(#notAuthorized);
    try {
      let r = await Keys.management.vetkd_public_key({ canister_id = null; context = Keys.CONTEXT; key_id = pinnedKey<system>() });
      #ok(r.public_key);
    } catch e { #err(#keys(e.message())) };
  };

  /// The vetKey for `purpose`, encrypted to the caller's transport key.
  public shared ({ caller }) func deriveKey(purpose : Text, transportPublicKey : Blob) : async Result.Result<Blob, Types.Error> {
    if (not Roles.canDerive(roles, caller, purpose)) return #err(#notAuthorized);
    if (transportPublicKey.size() == 0 or transportPublicKey.size() > 200) return #err(#invalid("transportPublicKey"));
    let now = Time.now();
    let day = Dates.dayNumber(now);
    let used = switch (keyUse.get(caller)) { case (?(d, n)) { if (d == day) n else 0 }; case null { 0 } };
    if (used >= Keys.DAILY_LIMIT) return #err(#keys("daily limit reached"));
    // Counted before the await so parallel calls can't exceed the limit.
    keyUse.add(caller, (day, used + 1));
    let keyId = pinnedKey<system>();
    try {
      let r = await (with cycles = Keys.DERIVE_CYCLES) Keys.management.vetkd_derive_key({
        input = Keys.input(purpose);
        context = Keys.CONTEXT;
        transport_public_key = transportPublicKey;
        key_id = keyId;
      });
      ignore Audit.append(audit, Time.now(), caller, "key.derive", "key", null, #obj([("purpose", #text(purpose))]));
      #ok(r.encrypted_key);
    } catch e { #err(#keys(e.message())) };
  };
};
