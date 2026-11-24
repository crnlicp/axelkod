// Initial state. Still pending (never deployed to mainnet), so later phases may
// extend it in place. Self-contained: types are copied, not imported.
import Map "mo:core/Map";
import Queue "mo:core/Queue";

module {
  type Lang = { #sv; #en };
  type Area = { #parts; #software; #security; #other };
  type Status = { #new; #read; #handled };
  type Message = {
    id : Nat; createdAt : Int; name : Text; email : Text; phone : ?Text; company : ?Text;
    area : Area; message : Text; lang : Lang; status : Status; adminNote : ?Text;
  };
  type ContactInfo = {
    email : Text; phone : ?Text; street : ?Text; postalCode : ?Text; city : Text;
    orgNumber : ?Text; showAddress : Bool; showPhone : Bool;
  };
  type SeoLang = {
    title : Text; metaDescription : Text; keywords : ?Text; ogTitle : ?Text; ogDescription : ?Text;
    ogImageUrl : Text; canonicalBaseUrl : Text; indexable : Bool;
  };
  type SeoSettings = {
    sv : SeoLang; en : SeoLang; organisationName : Text; logoUrl : Text; sameAs : [Text];
    googleVerification : ?Text; bingVerification : ?Text;
  };
  type SiteSettings = { retentionMonths : Nat; responseTime : { sv : Text; en : Text } };
  type Config = {
    var contact : ContactInfo; var seo : SeoSettings; var seoUpdatedAt : Int;
    var seoPublishedAt : ?Int; var site : SiteSettings;
  };

  type OldActor = {};
  type NewActor = {
    admins : Map.Map<Principal, Int>;
    messages : Map.Map<Nat, Message>;
    config : Config;
    counters : { var nextMessageId : Nat };
    form : { var secret : Blob; usedTokens : Map.Map<Text, Int>; recent : Queue.Queue<Int> };
  };

  let base = "https://axelkod.eu";

  public func migration(_ : OldActor) : NewActor {
    {
      admins = Map.empty();
      messages = Map.empty();
      config = {
        var contact = {
          email = ""; phone = null; street = null; postalCode = null; city = "Mölndal";
          orgNumber = null; showAddress = false; showPhone = false;
        };
        var seo = {
          sv = {
            title = "Axelkod AB – Fordonsdelar, mjukvara och cybersäkerhet";
            metaDescription = "Axelkod AB i Mölndal levererar reservdelar till tunga fordon, utvecklar mjukvara och ger råd inom cybersäkerhet. Kontakta oss så berättar vi mer.";
            keywords = null; ogTitle = null; ogDescription = null;
            ogImageUrl = base # "/og-image.png"; canonicalBaseUrl = base; indexable = true;
          };
          en = {
            title = "Axelkod AB – Vehicle parts, software and cyber security";
            metaDescription = "Axelkod AB in Mölndal, Sweden, supplies parts for heavy vehicles, builds software and advises on cyber security. Get in touch to learn more.";
            keywords = null; ogTitle = null; ogDescription = null;
            ogImageUrl = base # "/og-image.png"; canonicalBaseUrl = base; indexable = true;
          };
          organisationName = "Axelkod AB";
          logoUrl = base # "/icon-512.png";
          sameAs = [];
          googleVerification = null;
          bingVerification = null;
        };
        var seoUpdatedAt = 0;
        var seoPublishedAt = null;
        var site = {
          retentionMonths = 12;
          responseTime = {
            sv = "Vi återkommer inom 1–2 arbetsdagar.";
            en = "We get back to you within 1–2 business days.";
          };
        };
      };
      counters = { var nextMessageId = 0 };
      form = { var secret = ""; usedTokens = Map.empty(); recent = Queue.empty() };
    };
  };
};
