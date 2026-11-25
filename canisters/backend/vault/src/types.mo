// Vault: encrypted originals of received documents (räkenskapsinformation).
// Append-only: there is no delete or overwrite method.
import Map "mo:core/Map";

module {
  public type Role = { #owner; #bookkeeper; #payroll; #auditor };
  /// A copy of accounting's roles, pushed by the accounting canister (C17).
  public type Roles = Map.Map<Principal, Role>;

  public type Upload = {
    id : Nat;
    owner : Principal;
    mime : Text;
    size : Nat; // ciphertext bytes
    chunkCount : Nat;
    cipherSha256 : Blob;
    createdAt : Int;
    chunks : Map.Map<Nat, Blob>;
  };

  public type File = {
    id : Nat;
    mime : Text;
    size : Nat;
    chunkCount : Nat;
    cipherSha256 : Blob;
    uploadedBy : Principal;
    uploadedAt : Int;
  };

  public type Store = {
    uploads : Map.Map<Nat, Upload>;
    files : Map.Map<Nat, File>;
    /// Chunks.key(fileId, index) -> bytes.
    chunks : Map.Map<Nat, Blob>;
    var nextUpload : Nat;
    var nextFile : Nat;
  };

  public type FileInfo = { id : Nat; mime : Text; size : Nat; cipherSha256 : Blob; uploadedBy : Principal; uploadedAt : Int };

  public type UploadInput = { mime : Text; size : Nat; chunkCount : Nat; cipherSha256 : Blob };

  public type Stats = { files : Nat; bytes : Nat; pendingUploads : Nat };

  public type Error = { #notAuthorized; #notFound; #invalid : Text; #conflict : Text };
};
