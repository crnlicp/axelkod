// acj-1: the canonical JSON encoding hashed for snapshots and audit details (C11).
// UTF-8, object keys sorted (keys are ASCII), no whitespace, integers only,
// `null` for absent options, variants as {"tag":value}, blobs as lowercase hex.
// The browser implements the same rules (app/admin/accounting/canonical.ts);
// both test suites check the vectors in test/canonical.test.mo.
import Array "mo:core/Array";
import Char "mo:core/Char";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Nat32 "mo:core/Nat32";
import Nat8 "mo:core/Nat8";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Sha256 "mo:sha2/Sha256";

module {
  public type Value = {
    #obj : [(Text, Value)];
    #arr : [Value];
    #int : Int;
    #text : Text;
    #bool : Bool;
    #blob : Blob;
    #null_;
    #tag : (Text, Value); // a variant case
  };

  let HEX : [Char] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

  public func hex(b : Blob) : Text {
    var out = "";
    for (byte in b.values()) {
      let n = byte.toNat();
      out #= HEX[n / 16].toText() # HEX[n % 16].toText();
    };
    out;
  };

  func escape(t : Text) : Text {
    var out = "\"";
    for (c in t.chars()) {
      let n = c.toNat32();
      if (c == '\"') out #= "\\\""
      else if (c == '\\') out #= "\\\\"
      else if (n < 0x20) {
        let v = n.toNat();
        out #= "\\u00" # HEX[v / 16].toText() # HEX[v % 16].toText();
      } else out #= c.toText();
    };
    out # "\"";
  };

  public func encode(v : Value) : Text {
    switch (v) {
      case (#null_) { "null" };
      case (#bool(b)) { if (b) "true" else "false" };
      case (#int(i)) { i.toText() };
      case (#text(t)) { escape(t) };
      case (#blob(b)) { escape(hex(b)) };
      case (#arr(xs)) { "[" # xs.values().map(encode).join(",") # "]" };
      case (#tag(t, x)) { "{" # escape(t) # ":" # encode(x) # "}" };
      case (#obj(fields)) {
        let sorted = fields.sort(func(a, b) = Text.compare(a.0, b.0));
        "{" # sorted.values().map(func((k, x)) = escape(k) # ":" # encode(x)).join(",") # "}";
      };
    };
  };

  public func sha256(v : Value) : Blob = Sha256.fromBlob(#sha256, encode(v).encodeUtf8());

  // Helpers for building values.
  public func opt<T>(x : ?T, f : T -> Value) : Value = switch (x) { case (?y) { f(y) }; case null { #null_ } };
  public func text(t : Text) : Value = #text(t);
  public func int(i : Int) : Value = #int(i);
  public func nat(n : Nat) : Value = #int(n);
  public func principal(p : Principal) : Value = #text(p.toText());

};
