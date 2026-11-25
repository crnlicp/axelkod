// Behandlingshistorik, read-only.
import List "mo:core/List";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Audit "../lib/Audit";
import Roles "../lib/Roles";
import Types "../types";

mixin (roles : Types.Roles, audit : Types.Audit) {
  public shared query ({ caller }) func auditLog(offset : Nat, limit : Nat) : async Result.Result<Types.Page<Types.AuditEntry>, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok({ items = Audit.page(audit, offset, Nat.min(limit, 200)); total = audit.size() });
  };

  /// The audit trail of one record (e.g. "voucher", id), oldest first.
  public shared query ({ caller }) func auditFor(entity : Text, id : Nat) : async Result.Result<[Types.AuditEntry], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(Audit.forEntity(audit, entity, id, 100));
  };

  /// First broken entry in [from, from + 5000), or null if intact.
  public shared query ({ caller }) func verifyAudit(from : Nat) : async Result.Result<?Nat, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(Audit.verify(audit, from, from + 5_000));
  };
};
