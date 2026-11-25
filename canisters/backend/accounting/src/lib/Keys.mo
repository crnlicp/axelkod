// vetKD through the management canister (C16). One key per purpose, shared by
// every principal allowed to use it; files and fields use random AES keys
// wrapped by it, so a derivation is needed once per session, not per file.
import Blob "mo:core/Blob";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";

module {
  public type KeyId = { curve : { #bls12_381_g2 }; name : Text };

  type Management = actor {
    vetkd_public_key : shared ({ canister_id : ?Principal; context : Blob; key_id : KeyId }) -> async { public_key : Blob };
    vetkd_derive_key : shared ({ input : Blob; context : Blob; transport_public_key : Blob; key_id : KeyId }) -> async { encrypted_key : Blob };
  };

  public let management : Management = actor ("aaaaa-aa");

  public let CONTEXT : Blob = "axelkod-accounting";

  public let PURPOSES = ["docs-v1", "pii-v1"];

  public let DAILY_LIMIT = 50;

  /// VETKD_KEY_NAME is set per environment in icp.yaml (key_1 on mainnet). The
  /// name is captured on first use and never changes afterwards.
  public func keyId<system>(stored : ?Text) : KeyId {
    { curve = #bls12_381_g2; name = stored ?? (Runtime.envVar<system>("VETKD_KEY_NAME") ?? "test_key_1") };
  };

  /// The key_1 fee; any excess is refunded.
  public let DERIVE_CYCLES = 26_153_846_153;

  public func input(purpose : Text) : Blob = purpose.encodeUtf8();

};
