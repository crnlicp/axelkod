import { suite; test } "mo:test";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Roles "../src/lib/Roles";
import Types "../src/types";

let owner = Principal.fromText("aaaaa-aa");
let anon = Principal.fromText("2vxsx-fae");
let bk = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");
let pay = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");
let aud = Principal.fromText("r7inp-6aaaa-aaaaa-aaabq-cai");

func roles() : Types.Roles {
  let r : Types.Roles = Map.empty();
  for ((p, role) in [(owner, #owner), (bk, #bookkeeper), (pay, #payroll), (aud, #auditor), (anon, #owner)].values()) {
    r.add(p, { role; addedAt = 0; addedBy = owner });
  };
  r;
};

suite("Roles", func() {
  test("anonymous never has a role, even if stored", func() {
    let r = roles();
    assert Roles.roleOf(r, anon) == null;
    assert not Roles.canRead(r, anon);
  });
  test("permissions per role", func() {
    let r = roles();
    assert Roles.canBook(r, owner) and Roles.canBook(r, bk);
    assert not Roles.canBook(r, pay) and not Roles.canBook(r, aud);
    assert Roles.canRead(r, aud) and not Roles.canRead(r, pay);
    assert Roles.canSeeSetup(r, pay);
    assert Roles.canDerive(r, owner, "pii-v1") and Roles.canDerive(r, pay, "pii-v1");
    // C16: bookkeepers read ROT/RUT buyers' personnummer (A8); auditors never read pii-v1.
    assert Roles.canDerive(r, bk, "pii-v1") and Roles.canDerive(r, bk, "docs-v1") and not Roles.canDerive(r, aud, "pii-v1");
    assert not Roles.canDerive(r, pay, "docs-v1") and not Roles.canDerive(r, owner, "other");
  });
  test("owner count is a plain count of stored owners", func() {
    assert Roles.ownerCount(roles()) == 2;
  });
});
