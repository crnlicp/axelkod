// Editable home-page sections: a public read of the published copy and admin
// draft editing (Publish copies the draft, see Settings.markSeoPublished).
import Result "mo:core/Result";
import Time "mo:core/Time";
import Auth "../lib/Auth";
import HomeLib "../lib/Home";
import Types "../types";

mixin (admins : Types.Admins, config : Types.Config) {
  /// The published sections, as baked into the site.
  public query func getHome() : async Types.HomeContent {
    config.homePublished;
  };

  public shared query ({ caller }) func adminGetHome() : async Result.Result<Types.HomeContent, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    #ok(config.homeDraft);
  };

  public shared ({ caller }) func setHomeHero(hero : Types.HomeHero) : async Result.Result<Types.HomeHero, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    HomeLib.hero(hero).mapOk(func clean {
      config.homeDraft := { config.homeDraft with hero = clean };
      config.seoUpdatedAt := Time.now();
      clean;
    });
  };

  /// One section per call keeps each request well under the ingress size limit.
  public shared ({ caller }) func setHomeSection(key : Types.HomeKey, section : Types.HomeSection) : async Result.Result<Types.HomeSection, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    HomeLib.section(key, section).mapOk(func clean {
      config.homeDraft := HomeLib.set(config.homeDraft, key, clean);
      config.seoUpdatedAt := Time.now();
      clean;
    });
  };

  public shared ({ caller }) func setHomeProducts(section : Types.ProductSection) : async Result.Result<Types.ProductSection, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    HomeLib.products(section).mapOk(func clean {
      config.homeDraft := { config.homeDraft with products = clean };
      config.seoUpdatedAt := Time.now();
      clean;
    });
  };
};
