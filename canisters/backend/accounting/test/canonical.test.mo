// acj-1 vectors. The browser implementation (A3) is tested against the same
// canonical strings and hashes, read from this file.
import { suite; test; expect } "mo:test";
import C "../src/lib/Canonical";

let vectors : [(Text, C.Value, Text, Text)] = [
  (
    "sorting-escapes-variant",
    #obj([("b", #arr([#bool(true), #null_, #text("x\"y")])), ("a", #int(1)), ("c", #tag("tag", #int(-5)))]),
    "{\"a\":1,\"b\":[true,null,\"x\\\"y\"],\"c\":{\"tag\":-5}}",
    "09a71423c78d7e63a01130f0a718d3a92c8abe95e7efd1aa986c46d7b4636ec0",
  ),
  (
    "unicode-control-blob",
    #obj([("name", #text("Åsa\n\u{1}\\")), ("blob", #blob("\01\ab"))]),
    "{\"blob\":\"01ab\",\"name\":\"Åsa\\u000a\\u0001\\\\\"}",
    "294cfc41f52d9e2a79e2b5897f057be37fd9cedca13d978590557f49e2b966d8",
  ),
  (
    "empty-and-bigint",
    #obj([("list", #arr([])), ("n", #int(-1234567890123456789012)), ("empty", #obj([]))]),
    "{\"empty\":{},\"list\":[],\"n\":-1234567890123456789012}",
    "d6e5c02087f84cd01457fc13f7a40a15e7134b2a925126aafc30b9bdd19ae93f",
  ),
];

suite("acj-1", func() {
  for ((name, value, canonical, sha) in vectors.values()) {
    test(name, func() {
      expect.text(C.encode(value)).equal(canonical);
      expect.text(C.hex(C.sha256(value))).equal(sha);
    });
  };
});
