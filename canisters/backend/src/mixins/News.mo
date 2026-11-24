// News: admin editing and public reads. Changes mark the site as needing a Publish
// (articles and the landing-page cards are baked into HTML).
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Auth "../lib/Auth";
import NewsLib "../lib/News";
import Types "../types";

mixin (admins : Types.Admins, news : Types.NewsStore, counters : Types.Counters, config : Types.Config) {
  public query func listNews(lang : Types.Lang, offset : Nat, limit : Nat) : async Types.NewsPage {
    NewsLib.page(news, lang, Time.now(), offset, limit);
  };

  public query func getNews(slug : Text, lang : Types.Lang) : async ?Types.NewsArticle {
    NewsLib.article(news, slug, lang, Time.now());
  };

  /// All published articles in both languages (public data), for baking pages.
  public query func publishedNews() : async [Types.News] {
    NewsLib.allLive(news, Time.now());
  };

  public shared query ({ caller }) func adminListNews() : async Result.Result<[Types.News], Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    #ok(news.values().toArray());
  };

  public shared ({ caller }) func createNews(input : Types.NewsInput) : async Result.Result<Types.News, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    if (news.size() >= NewsLib.MAX_ARTICLES) return #err(#invalid("limit"));
    let c = switch (NewsLib.clean(input, news, null)) { case (#ok(c)) { c }; case (#err(e)) { return #err(e) } };
    let now = Time.now();
    let id = counters.nextNewsId + 1;
    counters.nextNewsId := id;
    let n : Types.News = { c with id; createdAt = now; updatedAt = now };
    news.add(id, n);
    config.seoUpdatedAt := now;
    #ok(n);
  };

  public shared ({ caller }) func updateNews(id : Nat, input : Types.NewsInput) : async Result.Result<Types.News, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    let old = news.get(id) ?? (return #err(#notFound));
    let c = switch (NewsLib.clean(input, news, ?id)) { case (#ok(c)) { c }; case (#err(e)) { return #err(e) } };
    let now = Time.now();
    let n : Types.News = { c with id; createdAt = old.createdAt; updatedAt = now };
    news.add(id, n);
    config.seoUpdatedAt := now;
    #ok(n);
  };

  public shared ({ caller }) func deleteNews(id : Nat) : async Result.Result<(), Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    if (not news.containsKey(id)) return #err(#notFound);
    news.remove(id);
    config.seoUpdatedAt := Time.now();
    #ok(());
  };
};
