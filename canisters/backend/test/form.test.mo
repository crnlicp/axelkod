import { suite; test; expect } "mo:test";
import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Queue "mo:core/Queue";
import Text "mo:core/Text";
import Contact "../src/lib/Contact";
import FormToken "../src/lib/FormToken";
import Hmac "../src/lib/Hmac";
import Types "../src/types";

func bytes(n : Nat, b : Nat8) : Blob = Array.tabulate<Nat8>(n, func _ = b).toBlob();
func hmac(key : Blob, msg : Text) : Text = Hmac.hex(Hmac.hmacSha256(key, msg.encodeUtf8()));

suite("HMAC-SHA256 (RFC 4231)", func() {
  test("case 1", func() {
    expect.text(hmac(bytes(20, 0x0b), "Hi There")).equal("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  });
  test("case 2", func() {
    expect.text(hmac("Jefe".encodeUtf8(), "what do ya want for nothing?")).equal("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });
  test("case 6 (key longer than a block)", func() {
    expect.text(hmac(bytes(131, 0xaa), "Test Using Larger Than Block-Size Key - Hash Key First")).equal("60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54");
  });
});

let secret = bytes(32, 7);
let nonce = "abcDEF0123456789_-xy";
let s = 1_000_000_000;

suite("FormToken", func() {
  test("valid after 3 s", func() {
    let t = FormToken.issue(secret, 100 * s, nonce);
    switch (FormToken.verify(secret, t, 103 * s)) { case (#ok(at)) { expect.int(at).equal(100 * s) }; case (#err(_)) { assert false } };
  });
  test("too fast, expired", func() {
    let t = FormToken.issue(secret, 100 * s, nonce);
    assert FormToken.verify(secret, t, 102 * s) == #err(#tooFast);
    assert FormToken.verify(secret, t, 100 * s + FormToken.MAX_AGE_NS + 1) == #err(#expired);
  });
  test("tampered timestamp, nonce, signature or secret", func() {
    let t = FormToken.issue(secret, 100 * s, nonce);
    let parts = t.split(#char '.').toArray();
    assert FormToken.verify(secret, "1." # parts[1] # "." # parts[2], 103 * s) == #err(#invalid);
    assert FormToken.verify(secret, parts[0] # ".zzzzzzzzzzzzzzzzzzzz." # parts[2], 103 * s) == #err(#invalid);
    assert FormToken.verify(secret, parts[0] # "." # parts[1] # ".00", 103 * s) == #err(#invalid);
    assert FormToken.verify(bytes(32, 8), t, 103 * s) == #err(#invalid);
    assert FormToken.verify(secret, "garbage", 103 * s) == #err(#invalid);
  });
  test("nonce format", func() {
    assert FormToken.isNonce(nonce);
    assert not FormToken.isNonce("short");
    assert not FormToken.isNonce("has.dots.in.it.0123456789");
  });
});

let input : Types.ContactInput = {
  name = " Anna "; email = "Anna@Example.SE"; phone = ?"+46 31-123 45 67"; company = ?"";
  area = #software; message = "Hej!\r\nVi behöver hjälp."; lang = #sv; consent = true; website = "";
};

func invalid(r : { #ok : Contact.Clean; #err : Types.SubmitError }, field : Text) : Bool {
  switch (r) { case (#err(#invalid(f))) { f == field }; case (_) { false } };
};

suite("Contact input", func() {
  test("clean: trims, lowercases email, empty company becomes null", func() {
    switch (Contact.clean(input)) {
      case (#ok(c)) {
        expect.text(c.name).equal("Anna");
        expect.text(c.email).equal("anna@example.se");
        assert c.company == null;
        expect.text(c.message).equal("Hej!\nVi behöver hjälp.");
      };
      case (#err(_)) { assert false };
    };
  });
  test("rejects bad fields", func() {
    assert invalid(Contact.clean({ input with consent = false }), "consent");
    assert invalid(Contact.clean({ input with email = "nope" }), "email");
    assert invalid(Contact.clean({ input with name = "   " }), "name");
    assert invalid(Contact.clean({ input with phone = ?"call me" }), "phone");
    assert invalid(Contact.clean({ input with message = Text.fromIter(Array.tabulate<Char>(2001, func _ = 'a').values()) }), "message");
  });
  test("global rate limit: 20 per hour, 100 per day", func() {
    let now = 100 * 86_400 * s;
    let q = Queue.empty<Int>();
    for (i in Nat.range(0, 19)) q.pushBack(now - i * s);
    assert Contact.withinGlobalLimit(q, now);
    q.pushBack(now);
    assert not Contact.withinGlobalLimit(q, now);
    let day = Queue.empty<Int>();
    for (i in Nat.range(0, 100)) day.pushBack(now - 2 * 3600 * s - i * 60 * s);
    assert not Contact.withinGlobalLimit(day, now);
  });
  test("prune drops entries older than a day", func() {
    let now = 10 * 86_400 * s;
    let q = Queue.empty<Int>();
    q.pushBack(now - 2 * 86_400 * s);
    q.pushBack(now - 3600 * s);
    Contact.prune(q, now);
    expect.nat(q.size()).equal(1);
  });
  test("per-email count looks back one day", func() {
    let now = 10 * 86_400 * s;
    let ms : Types.Messages = Map.empty();
    let m : Types.Message = {
      id = 0; createdAt = 0; name = "A"; email = "a@b.se"; phone = null; company = null;
      area = #other; message = "x"; lang = #sv; status = #new; adminNote = null;
    };
    ms.add(1, { m with id = 1; createdAt = now - 2 * 86_400 * s });
    ms.add(2, { m with id = 2; createdAt = now - 3600 * s });
    ms.add(3, { m with id = 3; createdAt = now - 60 * s; email = "c@d.se" });
    expect.nat(Contact.recentFromEmail(ms, "a@b.se", now)).equal(1);
  });
});
