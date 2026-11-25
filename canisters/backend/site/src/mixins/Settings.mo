// Contact info, SEO and site settings, plus the public read of them.
import Result "mo:core/Result";
import Time "mo:core/Time";
import Auth "../lib/Auth";
import SettingsLib "../lib/Settings";
import Types "../types";

mixin (admins : Types.Admins, config : Types.Config) {
  public query func getPublicConfig() : async Types.PublicConfig {
    {
      contact = SettingsLib.publicContact(config.contact);
      seo = config.seo;
      responseTime = config.site.responseTime;
      retentionMonths = config.site.retentionMonths;
    };
  };

  public shared query ({ caller }) func getContactInfo() : async Result.Result<Types.ContactInfo, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    #ok(config.contact);
  };

  public shared ({ caller }) func setContactInfo(c : Types.ContactInfo) : async Result.Result<Types.ContactInfo, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    SettingsLib.contact(c).mapOk(func clean {
      config.contact := clean;
      // The published JSON-LD includes contact details, so SEO needs a new Publish.
      config.seoUpdatedAt := Time.now();
      clean;
    });
  };

  public shared query ({ caller }) func getSeoSettings() : async Result.Result<Types.SeoState, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    #ok({ settings = config.seo; updatedAt = config.seoUpdatedAt; publishedAt = config.seoPublishedAt });
  };

  public shared ({ caller }) func setSeoSettings(s : Types.SeoSettings) : async Result.Result<Types.SeoSettings, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    SettingsLib.seo(s).mapOk(func clean {
      config.seo := clean;
      config.seoUpdatedAt := Time.now();
      clean;
    });
  };

  /// Called by the admin UI after Publish has written the SEO files to the frontend.
  public shared ({ caller }) func markSeoPublished() : async Result.Result<Int, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    let now = Time.now();
    config.seoPublishedAt := ?now;
    // Publish baked the draft home sections into the site; they are now the live copy.
    config.homePublished := config.homeDraft;
    #ok(now);
  };

  public shared query ({ caller }) func getSiteSettings() : async Result.Result<Types.SiteSettings, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    #ok(config.site);
  };

  public shared ({ caller }) func setSiteSettings(s : Types.SiteSettings) : async Result.Result<Types.SiteSettings, Types.Error> {
    if (not Auth.isAdmin(admins, caller)) return #err(#notAuthorized);
    SettingsLib.site(s).mapOk(func clean { config.site := clean; clean });
  };
};
