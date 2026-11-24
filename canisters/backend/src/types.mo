// Central schema. Stable state types must match the NewActor of the migration chain.
import Map "mo:core/Map";
import Queue "mo:core/Queue";

module {
  public type Lang = { #sv; #en };
  public type Area = { #parts; #software; #security; #other };
  public type Status = { #new; #read; #handled };

  public type Message = {
    id : Nat;
    createdAt : Int;
    name : Text;
    email : Text;
    phone : ?Text;
    company : ?Text;
    area : Area;
    message : Text;
    lang : Lang;
    status : Status;
    adminNote : ?Text;
  };

  public type ContactInfo = {
    email : Text;
    phone : ?Text;
    street : ?Text;
    postalCode : ?Text;
    city : Text;
    orgNumber : ?Text;
    showAddress : Bool;
    showPhone : Bool;
  };

  public type SeoLang = {
    title : Text;
    metaDescription : Text;
    keywords : ?Text;
    ogTitle : ?Text;
    ogDescription : ?Text;
    ogImageUrl : Text;
    canonicalBaseUrl : Text;
    indexable : Bool;
  };

  public type SeoSettings = {
    sv : SeoLang;
    en : SeoLang;
    organisationName : Text;
    logoUrl : Text;
    sameAs : [Text];
    googleVerification : ?Text;
    bingVerification : ?Text;
  };

  public type SiteSettings = {
    retentionMonths : Nat;
    responseTime : { sv : Text; en : Text };
  };

  /// Mutable settings shared by the settings and publish mixins.
  public type Config = {
    var contact : ContactInfo;
    var seo : SeoSettings;
    var seoUpdatedAt : Int;
    var seoPublishedAt : ?Int;
    var site : SiteSettings;
  };

  public type Counters = { var nextMessageId : Nat };

  /// Contact-form spam protection state.
  public type FormState = {
    var secret : Blob; // HMAC key from raw_rand, set by a timer right after install
    usedTokens : Map.Map<Text, Int>; // token -> issuedAt, pruned after MAX_AGE
    recent : Queue.Queue<Int>; // accepted submission times of the last 24 h
  };

  /// Admin principal -> time added (ns).
  public type Admins = Map.Map<Principal, Int>;
  public type Messages = Map.Map<Nat, Message>;

  // ── API types ──

  public type Error = {
    #notAuthorized;
    #notFound;
    #invalid : Text; // name of the offending field
    #lastAdmin;
    #frontend : Text; // the frontend canister rejected authorize/deauthorize
  };

  public type ContactInput = {
    name : Text;
    email : Text;
    phone : ?Text;
    company : ?Text;
    area : Area;
    message : Text;
    lang : Lang;
    consent : Bool;
    website : Text; // honeypot: humans never see it, so it must stay empty
  };

  public type SubmitError = {
    #invalid : Text; // field name
    #tokenInvalid;
    #tokenTooFast;
    #tokenExpired;
    #tokenUsed;
    #rateLimited;
    #unavailable; // secret not initialised yet
  };

  public type AdminView = { principal : Principal; addedAt : Int };
  public type Whoami = { principal : Principal; isAdmin : Bool };

  public type MessageFilter = { status : ?Status; search : ?Text };
  public type PageRequest = { offset : Nat; limit : Nat };
  public type MessagePage = { items : [Message]; total : Nat; unread : Nat };

  /// Contact details with the show flags applied: hidden fields are null.
  public type PublicContact = {
    email : ?Text;
    phone : ?Text;
    street : ?Text;
    postalCode : ?Text;
    city : Text;
    orgNumber : ?Text;
  };

  public type PublicConfig = {
    contact : PublicContact;
    seo : SeoSettings;
    responseTime : { sv : Text; en : Text };
    retentionMonths : Nat;
  };

  public type SeoState = {
    settings : SeoSettings;
    updatedAt : Int;
    publishedAt : ?Int;
  };
};
