// HMAC-SHA256 (RFC 2104) on top of sha2's Sha256.
import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Text "mo:core/Text";
import Nat8 "mo:core/Nat8";
import Sha256 "mo:sha2/Sha256";

module {
  let BLOCK = 64;

  public func sha256(data : Blob) : Blob = Sha256.fromBlob(#sha256, data);

  public func hmacSha256(key : Blob, message : Blob) : Blob {
    let k = if (key.size() > BLOCK) sha256(key).toArray() else key.toArray();
    let padded = Array.tabulate<Nat8>(BLOCK, func i = if (i < k.size()) k[i] else 0);
    let inner = Sha256.new(#sha256);
    inner.writeArray(padded.map(func b = b ^ 0x36));
    inner.writeBlob(message);
    let outer = Sha256.new(#sha256);
    outer.writeArray(padded.map(func b = b ^ 0x5c));
    outer.writeBlob(inner.sum());
    outer.sum();
  };

  public func hex(b : Blob) : Text {
    let digits = "0123456789abcdef".toArray();
    var out = "";
    for (byte in b.values()) {
      let n = byte.toNat();
      out #= digits[n / 16].toText() # digits[n % 16].toText();
    };
    out;
  };
};
