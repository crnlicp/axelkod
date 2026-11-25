import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Types "../types";

module {
  public func isAdmin(admins : Types.Admins, caller : Principal) : Bool {
    not caller.isAnonymous() and admins.containsKey(caller);
  };

  /// Controllers (the deploy identity) may manage admins, e.g. to add the first
  /// admin or recover access, but they are never admins themselves.
  public func canManageAdmins(admins : Types.Admins, caller : Principal) : Bool {
    isAdmin(admins, caller) or caller.isController();
  };
};
