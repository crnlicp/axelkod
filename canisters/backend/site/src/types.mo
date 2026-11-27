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
    /// Map behind the contact card: coordinates plus a snapshot image the admin
    /// uploads (/uploads/…). No map is shown without a snapshot.
    mapLat : ?Float;
    mapLon : ?Float;
    mapUrl : ?Text;
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
    /// Home-page sections: edited as a draft, copied to `homePublished` by Publish.
    var homeDraft : HomeContent;
    var homePublished : HomeContent;
  };

  public type Counters = { var nextMessageId : Nat; var nextNewsId : Nat };

  // ── News ──
  public type NewsArea = { #parts; #software; #security; #company };
  public type NewsStatus = { #draft; #published };

  /// One language version. `body` is a safe Markdown subset rendered by the frontend.
  public type NewsLang = { title : Text; excerpt : Text; body : Text; coverAlt : Text };

  public type News = {
    id : Nat;
    slug : Text;
    status : NewsStatus;
    publishedAt : Int; // shown date; drafts keep it for when they go live
    createdAt : Int;
    updatedAt : Int;
    area : ?NewsArea;
    coverUrl : ?Text; // "/uploads/..." on this site, or an https URL
    sv : NewsLang;
    en : ?NewsLang; // optional: without it the article is not on the English site
  };
  public type NewsStore = Map.Map<Nat, News>;

  public type NewsInput = {
    slug : Text;
    status : NewsStatus;
    publishedAt : Int;
    area : ?NewsArea;
    coverUrl : ?Text;
    sv : NewsLang;
    en : ?NewsLang;
  };

  /// A published article in one language, for the public site.
  public type NewsSummary = {
    slug : Text;
    publishedAt : Int;
    area : ?NewsArea;
    coverUrl : ?Text;
    coverAlt : Text;
    title : Text;
    excerpt : Text;
    hasOtherLang : Bool;
  };
  public type NewsArticle = { summary : NewsSummary; body : Text };
  public type NewsPage = { items : [NewsSummary]; total : Nat };

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
    #conflict : Text; // e.g. slug already used
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
    mapUrl : ?Text;
    mapLat : ?Float;
    mapLon : ?Float;
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

  /// Editable home-page sections. Icons and visuals are keys from fixed lists
  /// (lib/Home.mo), never markup.
  public type HomeKey = { #services; #security; #industries };
  public type HomeText = { title : Text; text : Text };
  public type HomeItem = { icon : Text; visual : Text; sv : HomeText; en : HomeText };
  public type HomeHead = { eyebrow : Text; title : Text; intro : Text };
  public type HomeSection = { sv : HomeHead; en : HomeHead; items : [HomeItem] };
  /// Hero: headline words (highlighted and/or encrypted), buttons and the trust strip below it.
  public type HeroLang = { eyebrow : Text; words : [Text]; subtitle : Text; cta : Text; cta2 : Text };
  /// `highlights`: words with the colour gradient; `ciphers`: words that play the "decrypt"
  /// effect (word indexes, any number of each). The visual layers, any combination:
  /// `network` (circuit background), `globe` (3D globe, `globeSize` = its diameter in
  /// percent of the screen height) and `logo` (the logo with its hexagons; `logoInGlobe`
  /// draws it inside the globe instead of in its own column, when both are on;
  /// `logoDepth` is that logo's thickness in percent of its height). `beacon` is the
  /// place the globe's beacon pulses from (the company's location).
  public type HeroVisuals = {
    network : Bool; globe : Bool; logo : Bool; logoInGlobe : Bool; globeSize : Nat; logoDepth : Nat;
    beacon : { lat : Float; lon : Float };
  };
  public type HomeHero = {
    sv : HeroLang; en : HeroLang; highlights : [Nat]; ciphers : [Nat]; visuals : HeroVisuals; trust : [HomeItem];
  };
  /// Our own products: no url sends the CTA to the contact form.
  public type ProductStatus = { #live; #beta; #soon };
  public type ProductText = { title : Text; text : Text; cta : Text };
  /// `background`: a simulation id from `Home.productBackgrounds` ("" = none).
  public type ProductItem = { icon : Text; status : ProductStatus; url : Text; background : Text; sv : ProductText; en : ProductText };
  public type ProductSection = { sv : HomeHead; en : HomeHead; items : [ProductItem] };
  public type HomeContent = {
    hero : HomeHero; services : HomeSection; security : HomeSection; industries : HomeSection; products : ProductSection;
  };
};
