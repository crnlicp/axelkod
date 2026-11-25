import { suite; test; expect } "mo:test";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Auth "../src/lib/Auth";
import M "../src/lib/Messages";
import Types "../src/types";

func msg(id : Nat, createdAt : Int, status : Types.Status, name : Text) : Types.Message {
  {
    id; createdAt; name; email = "x@y.se"; phone = null; company = ?"ACME"; area = #software;
    message = "Hej"; lang = #sv; status; adminNote = null;
  };
};

func store() : Types.Messages {
  let ms : Types.Messages = Map.empty();
  ms.add(0, msg(0, 100, #handled, "Anna"));
  ms.add(1, msg(1, 200, #new, "Bertil"));
  ms.add(2, msg(2, 300, #read, "Cecilia"));
  ms.add(3, msg(3, 400, #new, "=cmd|' /C calc'!A0"));
  ms;
};

suite("Inbox", func() {
  test("page: newest first, unread counts all, filter + offset", func() {
    let p = M.page(store(), { status = null; search = null }, { offset = 1; limit = 2 });
    expect.nat(p.total).equal(4);
    expect.nat(p.unread).equal(2);
    expect.nat(p.items.size()).equal(2);
    expect.nat(p.items[0].id).equal(2);
    expect.nat(p.items[1].id).equal(1);
  });
  test("page: status and case-insensitive search", func() {
    expect.nat(M.page(store(), { status = ?#new; search = null }, { offset = 0; limit = 10 }).total).equal(2);
    let s = M.page(store(), { status = null; search = ?"  ceCIL " }, { offset = 0; limit = 10 });
    expect.nat(s.total).equal(1);
    expect.nat(s.items[0].id).equal(2);
  });
  test("page: limit capped at 100", func() {
    let ms : Types.Messages = Map.empty();
    for (i in Nat.range(0, 150)) ms.add(i, msg(i, i, #new, "n"));
    expect.nat(M.page(ms, { status = null; search = null }, { offset = 0; limit = 1000 }).items.size()).equal(100);
  });
});

suite("Retention", func() {
  test("purgeBefore removes only older messages", func() {
    let ms = store();
    expect.nat(M.purgeBefore(ms, 250)).equal(2);
    expect.nat(ms.size()).equal(2);
    assert not ms.containsKey(0) and not ms.containsKey(1) and ms.containsKey(2);
  });
  test("cutoff is months back", func() {
    expect.int(M.retentionCutoff(10 * M.MONTH_NS, 12)).equal(-2 * M.MONTH_NS);
  });
});

suite("CSV", func() {
  test("isoUtc", func() {
    expect.text(M.isoUtc(0)).equal("1970-01-01T00:00:00Z");
    expect.text(M.isoUtc(1_795_539_534_000_000_000)).equal("2026-11-24T16:58:54Z");
    expect.text(M.isoUtc(951_782_400_000_000_000)).equal("2000-02-29T00:00:00Z");
  });
  test("cells are quoted and formulas neutralised", func() {
    expect.text(M.csvCell("a \"b\", c")).equal("\"a \"\"b\"\", c\"");
    expect.text(M.csvCell("=1+1")).equal("\"'=1+1\"");
    expect.text(M.csvCell("@SUM(A1)")).equal("\"'@SUM(A1)\"");
  });
  test("export has header and one row per message", func() {
    let csv = M.toCsv(store());
    assert csv.startsWith(#text "id,createdAt,name,email");
    assert csv.contains(#text "\"'=cmd|' /C calc'!A0\"");
    expect.nat(csv.split(#text "\r\n").toArray().size()).equal(6); // header + 4 + trailing empty
  });
});

suite("Auth", func() {
  test("anonymous is never admin, even if listed", func() {
    let admins : Types.Admins = Map.empty();
    let anon = Principal.anonymous();
    let p = Principal.fromText("aaaaa-aa");
    admins.add(anon, 0);
    admins.add(p, 0);
    assert not Auth.isAdmin(admins, anon);
    assert Auth.isAdmin(admins, p);
    assert not Auth.isAdmin(admins, Principal.fromText("2vxsx-fae"));
  });
});
