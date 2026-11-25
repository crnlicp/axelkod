// Upload rules: fixed-size chunks (the last may be shorter), each index written
// once, and the SHA-256 of all chunks in order must match the declared hash.
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Sha256 "mo:sha2/Sha256";
import Types "../types";

module {
  type R<T> = Result.Result<T, Types.Error>;

  /// Under the ~2 MB message limit with room for the Candid envelope.
  public let CHUNK = 1_900_000;
  /// 20 MB plaintext plus AES-GCM overhead (12-byte IV + 16-byte tag), with margin.
  public let MAX_SIZE = 20_001_024;
  public let MIME = ["application/pdf", "image/jpeg", "image/png", "image/heic", "application/xml", "text/xml"];
  public let MAX_OPEN_PER_USER = 5;
  public let MAX_PENDING_BYTES = 200_000_000;
  public let UPLOAD_TTL : Int = 86_400_000_000_000; // 24 h

  public func chunkKey(fileId : Nat, index : Nat) : Nat = fileId * 1_000 + index;

  public func chunksFor(size : Nat) : Nat = (size + CHUNK - 1) / CHUNK;

  /// Expected byte length of chunk `index`.
  public func chunkSize(size : Nat, index : Nat) : Nat {
    let full = index * CHUNK;
    if (full + CHUNK <= size) CHUNK else size - full;
  };

  public func pendingBytes(store : Types.Store) : Nat = store.uploads.values().foldLeft(0, func(n : Nat, u : Types.Upload) : Nat = n + u.size);

  public func checkBegin(store : Types.Store, caller : Principal, u : Types.UploadInput) : R<()> {
    if (MIME.find(func x = x == u.mime) == null) return #err(#invalid("mime"));
    if (u.size == 0 or u.size > MAX_SIZE) return #err(#invalid("size"));
    if (u.chunkCount != chunksFor(u.size)) return #err(#invalid("chunkCount"));
    if (u.cipherSha256.size() != 32) return #err(#invalid("cipherSha256"));
    let open = store.uploads.values().filter(func(x : Types.Upload) : Bool = x.owner == caller).size();
    if (open >= MAX_OPEN_PER_USER) return #err(#invalid("tooManyUploads"));
    if (pendingBytes(store) + u.size > MAX_PENDING_BYTES) return #err(#invalid("busy"));
    #ok(());
  };

  public func put(u : Types.Upload, index : Nat, bytes : Blob) : R<()> {
    if (index >= u.chunkCount) return #err(#invalid("index"));
    if (u.chunks.containsKey(index)) return #err(#conflict("chunk already written"));
    if (bytes.size() != chunkSize(u.size, index)) return #err(#invalid("chunkSize"));
    u.chunks.add(index, bytes);
    #ok(());
  };

  /// Moves a complete, hash-checked upload into the file store.
  public func finalize(store : Types.Store, u : Types.Upload, now : Int) : R<Types.File> {
    if (u.chunks.size() != u.chunkCount) return #err(#invalid("incomplete"));
    let digest = Sha256.new(#sha256);
    for (i in Nat.range(0, u.chunkCount)) {
      switch (u.chunks.get(i)) { case (?b) { digest.writeBlob(b) }; case null { return #err(#invalid("incomplete")) } };
    };
    if (digest.sum() != u.cipherSha256) return #err(#invalid("cipherSha256"));
    let id = store.nextFile;
    store.nextFile += 1;
    for ((i, b) in u.chunks.entries()) store.chunks.add(chunkKey(id, i), b);
    let file : Types.File = { id; mime = u.mime; size = u.size; chunkCount = u.chunkCount; cipherSha256 = u.cipherSha256; uploadedBy = u.owner; uploadedAt = now };
    store.files.add(id, file);
    store.uploads.remove(u.id);
    #ok(file);
  };

  public func dropExpired(store : Types.Store, now : Int) {
    let old = store.uploads.entries().filter(func((_, u)) = now - u.createdAt > UPLOAD_TTL).map(func((id, _)) = id).toArray();
    for (id in old.values()) store.uploads.remove(id);
  };
};
