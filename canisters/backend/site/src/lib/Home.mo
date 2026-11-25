// Cleaning and validation of the editable home-page sections.
import Array "mo:core/Array";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Types "../types";
import V "Validate";

module {
  type R<T> = Result.Result<T, Types.Error>;

  /// Icon keys the site can draw (app/lib/home-icons.ts has the same list).
  public let icons : [Text] = [
    "parts", "code", "shield", "lock", "key", "bug", "eye", "cloud", "server", "chip", "network", "globe",
    "truck", "wrench", "store", "factory", "company", "person", "users", "chart", "clock", "mail", "phone", "pin",
  ];
  /// Decorative visuals for the featured service cards ("" = none).
  public let visuals : [Text] = ["", "gear", "code", "shield"];

  public let maxItems = 12;

  func check(ok : Bool, field : Text) : R<()> = if (ok) #ok(()) else #err(#invalid(field));

  func keyName(k : Types.HomeKey) : Text = switch (k) { case (#services) "services"; case (#security) "security"; case (#industries) "industries" };

  func head(h : Types.HomeHead, field : Text) : R<Types.HomeHead> {
    let clean = { eyebrow = V.singleLine(h.eyebrow); title = V.singleLine(h.title); intro = V.singleLine(h.intro) };
    check(V.lengthIn(clean.eyebrow, 1, 40), field # ".eyebrow")
      .chain(func _ = check(V.lengthIn(clean.title, 1, 80), field # ".title"))
      .chain(func _ = check(clean.intro.size() <= 300, field # ".intro"))
      .mapOk(func _ = clean);
  };

  func text(t : Types.HomeText, field : Text) : R<Types.HomeText> {
    let clean = { title = V.singleLine(t.title); text = V.singleLine(t.text) };
    check(V.lengthIn(clean.title, 1, 80), field # ".title")
      .chain(func _ = check(V.lengthIn(clean.text, 1, 300), field # ".text"))
      .mapOk(func _ = clean);
  };

  func item(it : Types.HomeItem, field : Text) : R<Types.HomeItem> {
    switch (text(it.sv, field # ".sv"), text(it.en, field # ".en")) {
      case (#ok(sv), #ok(en)) {
        check(icons.find(func i = i == it.icon) != null, field # ".icon")
          .chain(func _ = check(visuals.find(func v = v == it.visual) != null, field # ".visual"))
          .mapOk(func _ = { icon = it.icon; visual = it.visual; sv; en });
      };
      case (#err(e), _) { #err(e) };
      case (_, #err(e)) { #err(e) };
    };
  };

  /// Errors name the field as "<section>.<sv|en>.title" or "<section>.items.<n>.<sv|en>.text".
  public func section(k : Types.HomeKey, s : Types.HomeSection) : R<Types.HomeSection> {
    let name = keyName(k);
    if (s.items.size() < 1 or s.items.size() > maxItems) return #err(#invalid(name # ".items"));
    let items = Array.tabulate(s.items.size(), func i = item(s.items[i], name # ".items." # debug_show i));
    for (r in items.values()) { switch (r) { case (#err(e)) return #err(e); case (#ok(_)) {} } };
    switch (head(s.sv, name # ".sv"), head(s.en, name # ".en")) {
      case (#ok(sv), #ok(en)) {
        #ok({ sv; en; items = items.map(func r = switch (r) { case (#ok(v)) v; case (#err(_)) s.items[0] }) });
      };
      case (#err(e), _) { #err(e) };
      case (_, #err(e)) { #err(e) };
    };
  };

  public let maxWords = 4;
  public let maxTrust = 8;

  func heroLang(h : Types.HeroLang, field : Text) : R<Types.HeroLang> {
    let words = h.words.map(V.singleLine);
    let clean = { eyebrow = V.singleLine(h.eyebrow); words; subtitle = V.singleLine(h.subtitle); cta = V.singleLine(h.cta); cta2 = V.singleLine(h.cta2) };
    check(V.lengthIn(clean.eyebrow, 1, 60), field # ".eyebrow")
      .chain(func _ = check(words.size() >= 1 and words.size() <= maxWords, field # ".words"))
      .chain(func _ = check(words.all(func w = V.lengthIn(w, 1, 30)), field # ".words"))
      .chain(func _ = check(V.lengthIn(clean.subtitle, 1, 200), field # ".subtitle"))
      .chain(func _ = check(V.lengthIn(clean.cta, 1, 40), field # ".cta"))
      .chain(func _ = check(V.lengthIn(clean.cta2, 1, 40), field # ".cta2"))
      .mapOk(func _ = clean);
  };

  func trustItem(it : Types.HomeItem, field : Text) : R<Types.HomeItem> {
    let sv = { title = V.singleLine(it.sv.title); text = V.singleLine(it.sv.text) };
    let en = { title = V.singleLine(it.en.title); text = V.singleLine(it.en.text) };
    check(icons.find(func i = i == it.icon) != null, field # ".icon")
      .chain(func _ = check(V.lengthIn(sv.title, 1, 40) and V.lengthIn(sv.text, 1, 120), field # ".sv"))
      .chain(func _ = check(V.lengthIn(en.title, 1, 40) and V.lengthIn(en.text, 1, 120), field # ".en"))
      .mapOk(func _ = { icon = it.icon; visual = ""; sv; en });
  };

  /// Errors name the field as "hero.<sv|en>.<field>" or "hero.trust.<n>.<sv|en|icon>".
  public func hero(h : Types.HomeHero) : R<Types.HomeHero> {
    if (h.trust.size() < 1 or h.trust.size() > maxTrust) return #err(#invalid("hero.trust"));
    if (h.highlight >= maxWords) return #err(#invalid("hero.highlight"));
    let trust = Array.tabulate(h.trust.size(), func i = trustItem(h.trust[i], "hero.trust." # debug_show i));
    for (r in trust.values()) { switch (r) { case (#err(e)) return #err(e); case (#ok(_)) {} } };
    switch (heroLang(h.sv, "hero.sv"), heroLang(h.en, "hero.en")) {
      case (#ok(sv), #ok(en)) {
        #ok({ sv; en; highlight = h.highlight; trust = trust.map(func r = switch (r) { case (#ok(v)) v; case (#err(_)) h.trust[0] }) });
      };
      case (#err(e), _) { #err(e) };
      case (_, #err(e)) { #err(e) };
    };
  };

  public func set(c : Types.HomeContent, k : Types.HomeKey, s : Types.HomeSection) : Types.HomeContent {
    switch (k) {
      case (#services) { { c with services = s } };
      case (#security) { { c with security = s } };
      case (#industries) { { c with industries = s } };
    };
  };
};
