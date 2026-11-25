// Upload, read and role-mirror API. Roles come only from the accounting canister.
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Store "../lib/Store";
import Types "../types";

/// `accounting` is read from PUBLIC_CANISTER_ID:accounting on every start (queries
/// have no system capability to read it themselves).
mixin (roles : Types.Roles, store : Types.Store, accounting : ?Principal) {
  func roleOf(p : Principal) : ?Types.Role = if (p.isAnonymous()) null else roles.get(p);

  func canWrite(p : Principal) : Bool = switch (roleOf(p)) { case (?#owner or ?#bookkeeper) { true }; case (_) { false } };

  func canRead(p : Principal) : Bool = switch (roleOf(p)) { case (?#owner or ?#bookkeeper or ?#auditor) { true }; case (_) { false } };

  func isAccounting(p : Principal) : Bool = accounting == ?p;

  /// Replaces the role copy. Accounting calls this after every role change.
  public shared ({ caller }) func setRoles(list : [(Principal, Types.Role)]) : async () {
    if (not isAccounting(caller)) Runtime.trap("not the accounting canister");
    roles.clear();
    for ((p, r) in list.values()) if (not p.isAnonymous()) roles.add(p, r);
  };

  public shared ({ caller }) func beginUpload(u : Types.UploadInput) : async Result.Result<Nat, Types.Error> {
    if (not canWrite(caller)) return #err(#notAuthorized);
    let now = Time.now();
    Store.dropExpired(store, now);
    switch (Store.checkBegin(store, caller, u)) { case (#err(e)) { return #err(e) }; case (#ok) {} };
    let id = store.nextUpload;
    store.nextUpload += 1;
    store.uploads.add(id, { u with id; owner = caller; createdAt = now; chunks = Map.empty<Nat, Blob>() });
    #ok(id);
  };

  public shared ({ caller }) func putChunk(uploadId : Nat, index : Nat, bytes : Blob) : async Result.Result<(), Types.Error> {
    if (not canWrite(caller)) return #err(#notAuthorized);
    let u = store.uploads.get(uploadId) ?? (return #err(#notFound));
    if (u.owner != caller) return #err(#notAuthorized);
    Store.put(u, index, bytes);
  };

  public shared ({ caller }) func finalize(uploadId : Nat) : async Result.Result<Types.FileInfo, Types.Error> {
    if (not canWrite(caller)) return #err(#notAuthorized);
    let u = store.uploads.get(uploadId) ?? (return #err(#notFound));
    if (u.owner != caller) return #err(#notAuthorized);
    switch (Store.finalize(store, u, Time.now())) {
      case (#ok(f)) { #ok({ id = f.id; mime = f.mime; size = f.size; cipherSha256 = f.cipherSha256; uploadedBy = f.uploadedBy; uploadedAt = f.uploadedAt }) };
      case (#err(e)) { #err(e) };
    };
  };

  /// For accounting's confirm step and for readers. Null when missing or not allowed.
  public shared query ({ caller }) func fileInfo(id : Nat) : async ?Types.FileInfo {
    if (not isAccounting(caller) and not canRead(caller)) return null;
    switch (store.files.get(id)) {
      case (?f) { ?{ id = f.id; mime = f.mime; size = f.size; cipherSha256 = f.cipherSha256; uploadedBy = f.uploadedBy; uploadedAt = f.uploadedAt } };
      case null { null };
    };
  };

  public shared query ({ caller }) func getChunk(fileId : Nat, index : Nat) : async Result.Result<Blob, Types.Error> {
    if (not canRead(caller)) return #err(#notAuthorized);
    let f = store.files.get(fileId) ?? (return #err(#notFound));
    if (index >= f.chunkCount) return #err(#invalid("index"));
    switch (store.chunks.get(Store.chunkKey(fileId, index))) { case (?b) { #ok(b) }; case null { #err(#notFound) } };
  };

  public shared query ({ caller }) func stats() : async Result.Result<Types.Stats, Types.Error> {
    if (not canRead(caller)) return #err(#notAuthorized);
    let bytes = store.files.values().foldLeft(0, func(n : Nat, f : Types.File) : Nat = n + f.size);
    #ok({ files = store.files.size(); bytes; pendingUploads = store.uploads.size() });
  };

  public shared query ({ caller }) func myRole() : async ?Types.Role { roleOf(caller) };
};
