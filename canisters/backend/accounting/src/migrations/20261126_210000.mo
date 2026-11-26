// Backup and restore (A9c): no restore in progress and no re-encrypted personal data yet.
// Self-contained: types are copied, not imported.
import Blob "mo:core/Blob";
import Map "mo:core/Map";

module {
  type Restore = { var by : ?Principal; rekey : Map.Map<Blob, Blob> };

  public func migration(_ : {}) : { restore : Restore } = {
    restore = { var by = null; rekey = Map.empty() };
  };
};
