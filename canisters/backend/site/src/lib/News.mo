// News: input cleaning/validation and the public (published-only) views.
import Array "mo:core/Array";
import Char "mo:core/Char";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Types "../types";
import V "Validate";

module {
  public let MAX_ARTICLES = 500;
  public let MAX_PAGE = 50;

  type R<T> = Result.Result<T, Types.Error>;

  func check(ok : Bool, field : Text) : R<()> = if (ok) #ok(()) else #err(#invalid(field));

  /// 3–80 chars of a–z, 0–9 and single hyphens, not at the ends.
  public func isSlug(s : Text) : Bool {
    if (not V.lengthIn(s, 3, 80) or s.startsWith(#char '-') or s.endsWith(#char '-') or s.contains(#text "--")) return false;
    not s.contains(#predicate(func c = not ((c >= 'a' and c <= 'z') or c.isDigit() or c == '-')));
  };

  func isCover(u : Text) : Bool {
    (u.startsWith(#text "/uploads/") and V.lengthIn(u, 10, 300) and not u.contains(#predicate(func c = c.isWhitespace() or c == '\"' or c == '<' or c == '>')))
    or V.isHttpsUrl(u);
  };

  func cleanLang(l : Types.NewsLang, lang : Text) : R<Types.NewsLang> {
    let c : Types.NewsLang = {
      title = V.singleLine(l.title);
      excerpt = V.singleLine(l.excerpt);
      body = V.multiLine(l.body);
      coverAlt = V.singleLine(l.coverAlt);
    };
    check(V.lengthIn(c.title, 1, 120), lang # ".title")
      .chain(func _ = check(V.lengthIn(c.excerpt, 1, 300), lang # ".excerpt"))
      .chain(func _ = check(V.lengthIn(c.body, 1, 20_000), lang # ".body"))
      .chain(func _ = check(c.coverAlt.size() <= 200, lang # ".coverAlt"))
      .mapOk(func _ = c);
  };

  /// Cleans and validates an input; slug uniqueness is checked against `store`
  /// (ignoring the article being edited).
  public func clean(input : Types.NewsInput, store : Types.NewsStore, editing : ?Nat) : R<Types.NewsInput> {
    let slug = V.singleLine(input.slug).toLower();
    if (not isSlug(slug)) return #err(#invalid("slug"));
    for ((id, n) in store.entries()) {
      if (n.slug == slug and ?id != editing) return #err(#conflict("slug"));
    };
    let coverUrl = V.optLine(input.coverUrl);
    switch (coverUrl) { case (?u) { if (not isCover(u)) return #err(#invalid("coverUrl")) }; case null {} };
    if (input.publishedAt < 0) return #err(#invalid("publishedAt"));
    let sv = switch (cleanLang(input.sv, "sv")) { case (#ok(l)) { l }; case (#err(e)) { return #err(e) } };
    let en = switch (input.en) {
      case (?l) { switch (cleanLang(l, "en")) { case (#ok(c)) { ?c }; case (#err(e)) { return #err(e) } } };
      case null { null };
    };
    #ok({ input with slug; coverUrl; sv; en });
  };

  public func isLive(n : Types.News, now : Int) : Bool = n.status == #published and n.publishedAt <= now;

  func langOf(n : Types.News, lang : Types.Lang) : ?Types.NewsLang = switch (lang) { case (#sv) { ?n.sv }; case (#en) { n.en } };

  func summary(n : Types.News, l : Types.NewsLang, lang : Types.Lang) : Types.NewsSummary {
    {
      slug = n.slug; publishedAt = n.publishedAt; area = n.area; coverUrl = n.coverUrl; coverAlt = l.coverAlt;
      title = l.title; excerpt = l.excerpt;
      hasOtherLang = switch (lang) { case (#sv) { n.en != null }; case (#en) { true } };
    };
  };

  /// Live articles in `lang`, newest first.
  public func live(store : Types.NewsStore, lang : Types.Lang, now : Int) : [Types.News] {
    let out = List.empty<Types.News>();
    for (n in store.values()) {
      if (isLive(n, now) and langOf(n, lang) != null) out.add(n);
    };
    out.toArray().sort(func(a, b) = Int.compare(b.publishedAt, a.publishedAt));
  };

  public func page(store : Types.NewsStore, lang : Types.Lang, now : Int, offset : Nat, limit : Nat) : Types.NewsPage {
    let all = live(store, lang, now);
    let items = List.empty<Types.NewsSummary>();
    let max = Nat.min(limit, MAX_PAGE);
    var i = 0;
    for (n in all.values()) {
      if (i >= offset and items.size() < max) {
        switch (langOf(n, lang)) { case (?l) { items.add(summary(n, l, lang)) }; case null {} };
      };
      i += 1;
    };
    { items = items.toArray(); total = all.size() };
  };

  public func article(store : Types.NewsStore, slug : Text, lang : Types.Lang, now : Int) : ?Types.NewsArticle {
    for (n in store.values()) {
      if (n.slug == slug and isLive(n, now)) {
        return switch (langOf(n, lang)) { case (?l) { ?{ summary = summary(n, l, lang); body = l.body } }; case null { null } };
      };
    };
    null;
  };

  /// Every live article, both languages: what the deploy bake and Publish render.
  public func allLive(store : Types.NewsStore, now : Int) : [Types.News] {
    store.values().filter(func n = isLive(n, now)).toArray().sort(func(a, b) = Int.compare(b.publishedAt, a.publishedAt));
  };
};
