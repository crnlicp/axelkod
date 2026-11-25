// Role rules for every accounting method. The anonymous principal never has a role.
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Types "../types";

module {
  public func roleOf(roles : Types.Roles, p : Principal) : ?Types.Role {
    if (p.isAnonymous()) return null;
    switch (roles.get(p)) { case (?a) { ?a.role }; case null { null } };
  };

  public func isOwner(roles : Types.Roles, p : Principal) : Bool = roleOf(roles, p) == ?#owner;

  /// Ledger reads (vouchers, reports, audit log, exports).
  public func canRead(roles : Types.Roles, p : Principal) : Bool = switch (roleOf(roles, p)) {
    case (?#owner or ?#bookkeeper or ?#auditor) { true };
    case (_) { false };
  };

  /// Chart, fiscal years and settings: needed by every role, payroll included.
  public func canSeeSetup(roles : Types.Roles, p : Principal) : Bool = roleOf(roles, p) != null;

  /// Drafts, posting, corrections, accounts, attachments.
  public func canBook(roles : Types.Roles, p : Principal) : Bool = switch (roleOf(roles, p)) {
    case (?#owner or ?#bookkeeper) { true };
    case (_) { false };
  };

  /// vetKey purposes (C16). Rotation adds "-v2" next to "-v1".
  public func canDerive(roles : Types.Roles, p : Principal, purpose : Text) : Bool {
    switch (roleOf(roles, p), purpose) {
      case (?#owner, "docs-v1" or "pii-v1") { true };
      case (?#bookkeeper or ?#auditor, "docs-v1") { true };
      case (?#payroll, "pii-v1") { true };
      case (_) { false };
    };
  };

  public func ownerCount(roles : Types.Roles) : Nat = roles.foldLeft(0, func(n, _, a) = if (a.role == #owner) n + 1 else n);
};
