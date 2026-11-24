import { suite; test; expect } "mo:test";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import N "../src/lib/News";
import Types "../src/types";

let sv : Types.NewsLang = { title = " Ny tjänst "; excerpt = "Kort."; body = "Rad ett\r\nRad två\u{0}"; coverAlt = "" };
let en : Types.NewsLang = { title = "New service"; excerpt = "Short."; body = "Line"; coverAlt = "" };
let input : Types.NewsInput = { slug = "ny-tjanst"; status = #published; publishedAt = 100; area = ?#software; coverUrl = ?"/uploads/og-1.png"; sv; en = ?en };

func article(id : Nat, slug : Text, status : Types.NewsStatus, at : Int, withEn : Bool) : Types.News {
  { input with id; slug; status; publishedAt = at; createdAt = 0; updatedAt = 0; sv; en = if (withEn) ?en else null };
};

func invalid<T>(r : { #ok : T; #err : Types.Error }, field : Text) : Bool = switch (r) { case (#err(#invalid(f))) { f == field }; case (_) { false } };

suite("News input", func() {
  test("slug rules", func() {
    assert N.isSlug("ny-tjanst-2026");
    assert not N.isSlug("Ny-tjanst");
    assert not N.isSlug("ny--tjanst");
    assert not N.isSlug("-ny");
    assert not N.isSlug("ny tjänst");
    assert not N.isSlug("ab");
  });
  test("clean trims, lowercases slug, strips control chars; English optional", func() {
    let store : Types.NewsStore = Map.empty();
    switch (N.clean({ input with slug = " NY-TJANST "; en = null }, store, null)) {
      case (#ok(c)) {
        expect.text(c.slug).equal("ny-tjanst");
        expect.text(c.sv.title).equal("Ny tjänst");
        expect.text(c.sv.body).equal("Rad ett\nRad två");
        assert c.en == null;
      };
      case (#err(_)) { assert false };
    };
  });
  test("rejects bad fields and duplicate slugs", func() {
    let store : Types.NewsStore = Map.empty();
    store.add(1, article(1, "ny-tjanst", #draft, 0, true));
    switch (N.clean(input, store, null)) { case (#err(#conflict("slug"))) {}; case (_) { assert false } };
    switch (N.clean(input, store, ?1)) { case (#ok(_)) {}; case (_) { assert false } }; // editing itself is fine
    assert invalid(N.clean({ input with slug = "x" }, store, ?1), "slug");
    assert invalid(N.clean({ input with coverUrl = ?"javascript:alert(1)" }, store, ?1), "coverUrl");
    assert invalid(N.clean({ input with coverUrl = ?"/uploads/a\"b.png" }, store, ?1), "coverUrl");
    assert invalid(N.clean({ input with sv = { sv with title = "  " } }, store, ?1), "sv.title");
    assert invalid(N.clean({ input with en = ?{ en with excerpt = "" } }, store, ?1), "en.excerpt");
  });
});

suite("Public news", func() {
  let store : Types.NewsStore = Map.empty();
  store.add(1, article(1, "old", #published, 100, true));
  store.add(2, article(2, "newest", #published, 300, false));
  store.add(3, article(3, "draft", #draft, 200, true));
  store.add(4, article(4, "future", #published, 9_999, true));
  store.add(5, article(5, "middle", #published, 200, true));

  test("only live articles, newest first; English skips Swedish-only", func() {
    let svPage = N.page(store, #sv, 1_000, 0, 10);
    expect.nat(svPage.total).equal(3);
    expect.text(svPage.items.map(func s = s.slug).values().join(",")).equal("newest,middle,old");
    expect.text(N.page(store, #en, 1_000, 0, 10).items.map(func s = s.slug).values().join(",")).equal("middle,old");
  });
  test("paging and the page cap", func() {
    let p = N.page(store, #sv, 1_000, 1, 1);
    expect.nat(p.items.size()).equal(1);
    expect.text(p.items[0].slug).equal("middle");
    let big : Types.NewsStore = Map.empty();
    for (i in Nat.range(1, 80)) big.add(i, article(i, "a" # i.toText(), #published, i, true));
    expect.nat(N.page(big, #sv, 1_000, 0, 500).items.size()).equal(N.MAX_PAGE);
  });
  test("article lookup respects status, date and language", func() {
    assert N.article(store, "middle", #en, 1_000) != null;
    assert N.article(store, "newest", #en, 1_000) == null; // no English version
    assert N.article(store, "draft", #sv, 1_000) == null;
    assert N.article(store, "future", #sv, 1_000) == null;
    expect.nat(N.allLive(store, 1_000).size()).equal(3);
  });
});
