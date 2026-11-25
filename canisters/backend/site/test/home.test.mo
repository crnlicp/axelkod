import { suite; test; expect } "mo:test";
import Home "../src/lib/Home";
import Types "../src/types";

let head : Types.HomeHead = { eyebrow = " Tjänster "; title = "Vad vi gör"; intro = "" };
let item : Types.HomeItem = { icon = "parts"; visual = "gear"; sv = { title = "Delar"; text = "Text" }; en = { title = "Parts"; text = "Text" } };
let section : Types.HomeSection = { sv = head; en = head; items = [item] };

func invalid(r : { #ok : Types.HomeSection; #err : Types.Error }) : Text {
  switch (r) { case (#err(#invalid(f))) { f }; case (_) { "" } };
};

suite("home sections", func() {
  test("a valid section is cleaned", func() {
    switch (Home.section(#services, section)) {
      case (#ok(s)) { expect.text(s.sv.eyebrow).equal("Tjänster") };
      case (#err(_)) { assert false };
    };
  });
  test("unknown icons are rejected", func() {
    expect.text(invalid(Home.section(#industries, { section with items = [{ item with icon = "<svg>" }] }))).equal("industries.items.0.icon");
  });
  test("unknown visuals are rejected", func() {
    expect.text(invalid(Home.section(#services, { section with items = [{ item with visual = "x" }] }))).equal("services.items.0.visual");
  });
  test("empty and oversized item lists are rejected", func() {
    expect.text(invalid(Home.section(#security, { section with items = [] }))).equal("security.items");
    let many = [item, item, item, item, item, item, item, item, item, item, item, item, item];
    expect.text(invalid(Home.section(#security, { section with items = many }))).equal("security.items");
  });
  test("item text is required in both languages", func() {
    expect.text(invalid(Home.section(#security, { section with items = [{ item with en = { title = "T"; text = " " } }] }))).equal("security.items.0.en.text");
  });
});

let heroLang : Types.HeroLang = { eyebrow = "Axelkod"; words = ["Delar.", "Kod."]; subtitle = "Sub"; cta = "Kontakt"; cta2 = "Mer" };
let trust : Types.HomeItem = { icon = "clock"; visual = "gear"; sv = { title = "Snabbt"; text = "Svar" }; en = { title = "Fast"; text = "Reply" } };
let hero : Types.HomeHero = { sv = heroLang; en = heroLang; highlight = 1; trust = [trust] };

func heroInvalid(r : { #ok : Types.HomeHero; #err : Types.Error }) : Text {
  switch (r) { case (#err(#invalid(f))) { f }; case (_) { "" } };
};

suite("hero", func() {
  test("a valid hero is accepted and trust visuals are cleared", func() {
    switch (Home.hero(hero)) {
      case (#ok(h)) { expect.text(h.trust[0].visual).equal("") };
      case (#err(_)) { assert false };
    };
  });
  test("one to four headline words", func() {
    expect.text(heroInvalid(Home.hero({ hero with sv = { heroLang with words = [] } }))).equal("hero.sv.words");
    expect.text(heroInvalid(Home.hero({ hero with en = { heroLang with words = ["a", "b", "c", "d", "e"] } }))).equal("hero.en.words");
  });
  test("highlight index and trust icons are checked", func() {
    expect.text(heroInvalid(Home.hero({ hero with highlight = 4 }))).equal("hero.highlight");
    expect.text(heroInvalid(Home.hero({ hero with trust = [{ trust with icon = "x" }] }))).equal("hero.trust.0.icon");
  });
});

