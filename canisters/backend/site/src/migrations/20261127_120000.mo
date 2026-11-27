// New positioning: IT, software, cyber security and supply chain (vehicle spare parts
// are part of the supply chain, no longer a service of their own), plus a Products
// section with Prova. Rewrites the draft and published home sections and the SEO
// titles once; admins edit them afterwards as before.
// Self-contained: types are copied, not imported.
import Array "mo:core/Array";

module {
  type ContactInfo = {
    email : Text; phone : ?Text; street : ?Text; postalCode : ?Text; city : Text;
    orgNumber : ?Text; showAddress : Bool; showPhone : Bool;
    mapLat : ?Float; mapLon : ?Float; mapUrl : ?Text;
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
  type HomeText = { title : Text; text : Text };
  type HomeItem = { icon : Text; visual : Text; sv : HomeText; en : HomeText };
  type HomeHead = { eyebrow : Text; title : Text; intro : Text };
  type HomeSection = { sv : HomeHead; en : HomeHead; items : [HomeItem] };
  type HeroLang = { eyebrow : Text; words : [Text]; subtitle : Text; cta : Text; cta2 : Text };
  type HomeHero = { sv : HeroLang; en : HeroLang; highlight : Nat; trust : [HomeItem] };
  type ProductText = { title : Text; text : Text; cta : Text };
  type ProductItem = { icon : Text; status : { #live; #beta; #soon }; url : Text; sv : ProductText; en : ProductText };
  type ProductSection = { sv : HomeHead; en : HomeHead; items : [ProductItem] };

  type OldHome = { hero : HomeHero; services : HomeSection; security : HomeSection; industries : HomeSection };
  type NewHome = OldHome and { products : ProductSection };

  type OldConfig = {
    var contact : ContactInfo; var seo : SeoSettings; var seoUpdatedAt : Int; var seoPublishedAt : ?Int;
    var site : SiteSettings; var homeDraft : OldHome; var homePublished : OldHome;
  };
  type NewConfig = {
    var contact : ContactInfo; var seo : SeoSettings; var seoUpdatedAt : Int; var seoPublishedAt : ?Int;
    var site : SiteSettings; var homeDraft : NewHome; var homePublished : NewHome;
  };

  func item(icon : Text, visual : Text, svTitle : Text, svText : Text, enTitle : Text, enText : Text) : HomeItem = {
    icon; visual; sv = { title = svTitle; text = svText }; en = { title = enTitle; text = enText };
  };

  func home(old : OldHome) : NewHome = {
    // The trust strip is kept as it is.
    hero = {
      old.hero with
      sv = { eyebrow = "Axelkod AB · Mölndal"; words = ["Kod.", "Säkerhet.", "Leverans."]; subtitle = "Mjukvara, cybersäkerhet och säkra leveranskedjor, även för fordonsreservdelar, levererat med svensk noggrannhet."; cta = "Kontakta oss"; cta2 = "Se vad vi gör" };
      en = { eyebrow = "Axelkod AB · Mölndal, Sweden"; words = ["Code.", "Security.", "Supply."]; subtitle = "Software, cyber security and secure supply chains, including vehicle spare parts, delivered with Swedish precision."; cta = "Contact us"; cta2 = "See what we do" };
      highlight = 1;
    };
    services = {
      sv = { eyebrow = "Tjänster"; title = "Vad vi gör"; intro = "Fyra områden, ett bolag. Fråga oss så berättar vi mer." };
      en = { eyebrow = "Services"; title = "What we do"; intro = "Four areas, one company. Ask us and we'll tell you more." };
      items = [
        item("server", "infra", "IT & infrastruktur", "Drift, nätverk och moln som bara fungerar, säkert konfigurerat från start.", "IT & infrastructure", "Operations, networks and cloud that just work, securely configured from the start."),
        item("code", "code", "Mjukvaruutveckling", "Mjukvara, webbapplikationer och webbplatser byggda för att hålla.", "Software development", "Software, web applications and websites built to last."),
        item("network", "gear", "Leveranskedja", "Säkra, spårbara inköp och leveranser, även reservdelar till fordon.", "Supply chain", "Secure, traceable sourcing and delivery, including vehicle spare parts."),
        item("shield", "shield", "Cybersäkerhet", "Rådgivning inom IT- och informationssäkerhet, från system till leverantörer.", "Cyber security", "Consulting in IT and information security, from systems to suppliers."),
      ];
    };
    security = {
      old.security with
      items = old.security.items.map(func it = if (it.en.title == "Supply chain") ({
        it with icon = "network"; sv = { title = "Leverantörskedja"; text = "Leverantörer och komponenter vi kan spåra och stå för." }; en = { title = "Supply chain"; text = "Suppliers and components we can trace and vouch for." };
      }) else it);
    };
    industries = {
      old.industries with
      items = [
        item("globe", "", "Logistik & leveranskedja", "Spårbara leverantörer och delar, och system som håller godset i rörelse.", "Logistics & supply chain", "Traceable suppliers and parts, and systems that keep goods moving."),
        item("store", "", "Små och medelstora företag", "Webbplatser och system som växer med er.", "Small and medium businesses", "Websites and systems that grow with you."),
        item("factory", "", "Industri & tillverkning", "Skydd för system som inte får stanna.", "Industry & manufacturing", "Protection for systems that can't stop."),
      ];
    };
    products = {
      sv = { eyebrow = "Produkter"; title = "Byggt av Axelkod"; intro = "Egen mjukvara, byggd med samma säkerhetskrav som vi ställer åt våra kunder." };
      en = { eyebrow = "Products"; title = "Built by Axelkod"; intro = "Our own software, held to the same security standards we apply for customers." };
      items = [{
        icon = "lock";
        status = #beta;
        url = "";
        sv = { title = "Prova CRA"; text = "Ett konfidentiellt utbyte av cybersäkerhetsbevis i industriella leveranskedjor. Leverantörer registrerar signerade intyg och delar krypterade rapporter; köpare verifierar dem och registrerar sitt godkännande."; cta = "Be om en demo" };
        en = { title = "Prova CRA"; text = "A confidential exchange for cybersecurity evidence in industrial supply chains. Suppliers register signed statements and share encrypted reports; buyers verify them and record their acceptance."; cta = "Ask for a demo" };
      }];
    };
  };

  public func migration(old : { config : OldConfig }) : { config : NewConfig } {
    let c = old.config;
    let seo = c.seo;
    {
      config = {
        var contact = c.contact;
        var seo = {
          seo with
          sv = { seo.sv with title = "Axelkod AB – Mjukvara, cybersäkerhet och leveranskedja"; metaDescription = "Axelkod AB i Mölndal utvecklar mjukvara, ger råd inom cybersäkerhet och bygger säkra leveranskedjor, även för fordonsreservdelar. Kontakta oss så berättar vi mer." };
          en = { seo.en with title = "Axelkod AB – Software, cyber security and supply chain"; metaDescription = "Axelkod AB in Mölndal, Sweden, builds software, advises on cyber security and runs secure supply chains, including vehicle spare parts. Get in touch to learn more." };
        };
        var seoUpdatedAt = c.seoUpdatedAt;
        var seoPublishedAt = c.seoPublishedAt;
        var site = c.site;
        var homeDraft = home(c.homeDraft);
        var homePublished = home(c.homePublished);
      };
    };
  };
};
