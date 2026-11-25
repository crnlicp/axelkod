import { suite; test; expect } "mo:test";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Sha256 "mo:sha2/Sha256";
import Store "../src/lib/Store";
import Types "../src/types";

let me = Principal.fromText("aaaaa-aa");

func store() : Types.Store = { uploads = Map.empty(); files = Map.empty(); chunks = Map.empty(); var nextUpload = 1; var nextFile = 1 };

func upload(size : Nat, sha : Blob) : Types.Upload = {
  id = 1; owner = me; mime = "application/pdf"; size; chunkCount = Store.chunksFor(size); cipherSha256 = sha; createdAt = 0; chunks = Map.empty();
};

suite("Vault store", func() {
  test("chunk count and sizes", func() {
    expect.nat(Store.chunksFor(1)).equal(1);
    expect.nat(Store.chunksFor(Store.CHUNK)).equal(1);
    expect.nat(Store.chunksFor(Store.CHUNK + 1)).equal(2);
    expect.nat(Store.chunkSize(Store.CHUNK + 5, 0)).equal(Store.CHUNK);
    expect.nat(Store.chunkSize(Store.CHUNK + 5, 1)).equal(5);
  });
  test("begin checks mime, size, chunk count and hash length", func() {
    let s = store();
    let sha : Blob = Sha256.fromBlob(#sha256, "x");
    assert Store.checkBegin(s, me, { mime = "application/pdf"; size = 10; chunkCount = 1; cipherSha256 = sha }) == #ok(());
    assert Store.checkBegin(s, me, { mime = "text/html"; size = 10; chunkCount = 1; cipherSha256 = sha }) == #err(#invalid("mime"));
    assert Store.checkBegin(s, me, { mime = "application/pdf"; size = 10; chunkCount = 2; cipherSha256 = sha }) == #err(#invalid("chunkCount"));
    assert Store.checkBegin(s, me, { mime = "application/pdf"; size = Store.MAX_SIZE + 1; chunkCount = 11; cipherSha256 = sha }) == #err(#invalid("size"));
    assert Store.checkBegin(s, me, { mime = "application/pdf"; size = 10; chunkCount = 1; cipherSha256 = "short" }) == #err(#invalid("cipherSha256"));
  });
  test("chunks are written once and must have the expected size", func() {
    let u = upload(3, Sha256.fromBlob(#sha256, "abc"));
    assert Store.put(u, 0, "ab") == #err(#invalid("chunkSize"));
    assert Store.put(u, 1, "abc") == #err(#invalid("index"));
    assert Store.put(u, 0, "abc") == #ok(());
    assert Store.put(u, 0, "abc") == #err(#conflict("chunk already written"));
  });
  test("finalize checks completeness and the hash", func() {
    let s = store();
    let bad = upload(3, Sha256.fromBlob(#sha256, "xyz"));
    s.uploads.add(1, bad);
    assert Store.finalize(s, bad, 0) == #err(#invalid("incomplete"));
    ignore Store.put(bad, 0, "abc");
    assert Store.finalize(s, bad, 0) == #err(#invalid("cipherSha256"));
    let good = upload(3, Sha256.fromBlob(#sha256, "abc"));
    ignore Store.put(good, 0, "abc");
    switch (Store.finalize(s, good, 5)) {
      case (#ok(f)) {
        expect.nat(f.id).equal(1);
        assert s.chunks.get(Store.chunkKey(1, 0)) == ?("abc" : Blob);
        assert s.uploads.isEmpty();
      };
      case (#err(_)) { assert false };
    };
  });
  test("expired uploads are dropped", func() {
    let s = store();
    s.uploads.add(1, upload(3, "x"));
    Store.dropExpired(s, Store.UPLOAD_TTL + 1);
    assert s.uploads.isEmpty();
  });
});

