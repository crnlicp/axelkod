import { suite; test; expect } "mo:test";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Audit "../src/lib/Audit";
import Types "../src/types";

let p = Principal.fromText("aaaaa-aa");

suite("Audit chain", func() {
  test("each entry links to the previous hash", func() {
    let log : Types.Audit = List.empty();
    let a = Audit.append(log, 1, p, "login", "session", null, #null_);
    let b = Audit.append(log, 2, p, "voucher.post", "voucher", ?1, #obj([("n", #int(1))]));
    assert a.prevHash == Audit.GENESIS;
    assert b.prevHash == a.hash;
    expect.nat(b.seq).equal(1);
    assert Audit.verify(log, 0, 10) == null;
    assert Audit.verify(log, 1, 10) == null;
  });
  test("an edited entry breaks the chain at that entry", func() {
    let log : Types.Audit = List.empty();
    for (i in [1, 2, 3].values()) ignore Audit.append(log, i, p, "x", "y", ?i, #int(i));
    let e = log.at(1);
    log.put(1, { e with action = "changed" });
    assert Audit.verify(log, 0, 10) == ?1;
  });
  test("pages newest first", func() {
    let log : Types.Audit = List.empty();
    for (i in [1, 2, 3, 4].values()) ignore Audit.append(log, i, p, "x", "y", ?i, #null_);
    let page = Audit.page(log, 1, 2);
    expect.nat(page.size()).equal(2);
    expect.nat(page[0].seq).equal(2);
    expect.nat(page[1].seq).equal(1);
    expect.nat(Audit.page(log, 9, 2).size()).equal(0);
  });
  test("the trail of one record, oldest first", func() {
    let log : Types.Audit = List.empty();
    ignore Audit.append(log, 1, p, "voucher.post", "voucher", ?7, #null_);
    ignore Audit.append(log, 2, p, "draft.save", "draft", ?7, #null_);
    ignore Audit.append(log, 3, p, "voucher.correct", "voucher", ?8, #null_);
    ignore Audit.append(log, 4, p, "attachment.link", "voucher", ?7, #null_);
    let trail = Audit.forEntity(log, "voucher", 7, 10);
    expect.nat(trail.size()).equal(2);
    expect.text(trail[0].action).equal("voucher.post");
    expect.text(trail[1].action).equal("attachment.link");
    expect.nat(Audit.forEntity(log, "voucher", 7, 1).size()).equal(1);
  });
});
