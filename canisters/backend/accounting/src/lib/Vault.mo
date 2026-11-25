// The vault canister, reached through the ID icp-cli injects as PUBLIC_CANISTER_ID:vault.
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

module {
  public type Role = { #owner; #bookkeeper; #payroll; #auditor };
  public type FileInfo = { id : Nat; mime : Text; size : Nat; cipherSha256 : Blob; uploadedBy : Principal; uploadedAt : Int };
  public type Vault = actor {
    setRoles : shared [(Principal, Role)] -> async ();
    fileInfo : shared query Nat -> async ?FileInfo;
  };

  /// Read lazily so a reinstall or new deploy always gets the current ID.
  public func canister<system>() : ?Vault {
    switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:vault")) {
      case (?id) { ?(actor (id) : Vault) };
      case null { null };
    };
  };

};
