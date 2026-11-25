// The frontend (certified-assets) canister, reached through the ID icp-cli injects
// as PUBLIC_CANISTER_ID:web. The backend must be one of its controllers.
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

module {
  public type Assets = actor {
    authorize : shared Principal -> async ();
    deauthorize : shared Principal -> async ();
    list_authorized : shared () -> async [Principal];
  };

  /// Read lazily (not at init) so a reinstall or a new deploy always gets the current ID.
  public func canister<system>() : ?Assets {
    switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:web")) {
      case (?id) { ?(actor (id) : Assets) };
      case null { null };
    };
  };
};
