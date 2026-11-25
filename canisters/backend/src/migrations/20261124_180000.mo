// Initial state. Still pending (never deployed to mainnet), so later phases may
// extend it in place. Self-contained: types are copied, not imported.
import Map "mo:core/Map";
import Nat "mo:core/Nat";
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
  type NewsLang = { title : Text; excerpt : Text; body : Text; coverAlt : Text };
  type News = {
    id : Nat; slug : Text; status : { #draft; #published }; publishedAt : Int; createdAt : Int; updatedAt : Int;
    area : ?{ #parts; #software; #security; #company }; coverUrl : ?Text; sv : NewsLang; en : ?NewsLang;
  };
  type SiteSettings = { retentionMonths : Nat; responseTime : { sv : Text; en : Text } };
  type HomeText = { title : Text; text : Text };
  type HomeItem = { icon : Text; visual : Text; sv : HomeText; en : HomeText };
  type HomeHead = { eyebrow : Text; title : Text; intro : Text };
  type HomeSection = { sv : HomeHead; en : HomeHead; items : [HomeItem] };
  type HeroLang = { eyebrow : Text; words : [Text]; subtitle : Text; cta : Text; cta2 : Text };
  type HomeHero = { sv : HeroLang; en : HeroLang; highlight : Nat; trust : [HomeItem] };
  type HomeContent = { hero : HomeHero; services : HomeSection; security : HomeSection; industries : HomeSection };
  type Config = {
    var contact : ContactInfo; var seo : SeoSettings; var seoUpdatedAt : Int;
    var seoPublishedAt : ?Int; var site : SiteSettings;
    var homeDraft : HomeContent; var homePublished : HomeContent;
  };

  type OldActor = {};
  type NewActor = {
    admins : Map.Map<Principal, Int>;
    messages : Map.Map<Nat, Message>;
    config : Config;
    counters : { var nextMessageId : Nat; var nextNewsId : Nat };
    news : Map.Map<Nat, News>;
    form : { var secret : Blob; usedTokens : Map.Map<Text, Int>; recent : Queue.Queue<Int> };
  };

  let base = "https://axelkod.eu";

  // Generic sample articles so the site has news from the start. Admins edit or
  // delete them under Nyheter.
  func sampleNews() : Map.Map<Nat, News> {
    let m = Map.empty<Nat, News>();
    m.add(0, {
      id = 0; slug = "saker-inloggning-med-passkeys"; status = #published;
      publishedAt = 1793692800000000000; createdAt = 1793692800000000000; updatedAt = 1793692800000000000;
      area = ?#security; coverUrl = null;
      sv = { title = "Säkrare inloggning med passkeys"; excerpt = "Lösenord är fortfarande den vanligaste vägen in för angripare. Passkeys gör nätfiske betydligt svårare – så här kommer ni igång."; body = "Stulna eller gissade lösenord ligger bakom en stor del av alla intrång. Passkeys ersätter lösenordet med en kryptografisk nyckel som stannar på användarens enhet och bara fungerar på rätt webbplats.\n\n## Varför passkeys?\n\n- **Skydd mot nätfiske:** nyckeln är knuten till webbplatsens adress och kan inte lämnas ut på en falsk sida.\n- **Inget att läcka:** tjänsten sparar bara en publik nyckel, så en dataläcka avslöjar inga lösenord.\n- **Enklare för användaren:** inloggning med fingeravtryck, ansikte eller PIN.\n\n## Kom igång\n\n1. Börja med e-post och administratörskonton – där gör ett intrång mest skada.\n2. Behåll en reservmetod, till exempel en extra säkerhetsnyckel.\n3. Utbilda medarbetarna kort: vad en passkey är och varför den inte kan \"ges bort\".\n\nVill ni ha hjälp att se över inloggningen i era system? Hör av er till oss."; coverAlt = "" };
      en = ?{ title = "Safer sign-in with passkeys"; excerpt = "Passwords are still the most common way in for attackers. Passkeys make phishing much harder – here is how to get started."; body = "Stolen or guessed passwords are behind a large share of breaches. Passkeys replace the password with a cryptographic key that stays on the user's device and only works on the right website.\n\n## Why passkeys?\n\n- **Phishing-resistant:** the key is bound to the site's address and cannot be handed over on a fake page.\n- **Nothing to leak:** the service stores only a public key, so a data breach reveals no passwords.\n- **Easier for users:** sign in with a fingerprint, face or PIN.\n\n## Getting started\n\n1. Start with email and admin accounts – that is where a breach does the most damage.\n2. Keep a backup method, such as a spare security key.\n3. Brief your staff: what a passkey is and why it cannot be \"given away\".\n\nWant help reviewing sign-in across your systems? Get in touch."; coverAlt = "" };
    });
    m.add(1, {
      id = 1; slug = "nis2-for-mindre-foretag"; status = #published;
      publishedAt = 1791964800000000000; createdAt = 1791964800000000000; updatedAt = 1791964800000000000;
      area = ?#security; coverUrl = null;
      sv = { title = "NIS2: vad betyder det för mindre företag?"; excerpt = "EU:s NIS2-direktiv skärper kraven på cybersäkerhet. Även företag utanför direktivet påverkas när kunderna ställer krav på sina leverantörer."; body = "NIS2 är EU:s uppdaterade regelverk för cybersäkerhet. Det gäller främst medelstora och stora verksamheter inom samhällsviktiga sektorer, men effekten sprider sig längre än så.\n\n## Leverantörskedjan i fokus\n\nVerksamheter som omfattas måste hantera risker hos sina leverantörer. Det betyder att även mindre företag kan få frågor om hur de skyddar system, data och åtkomst.\n\n## Fem saker att ha på plats\n\n- En aktuell bild av vilka system och data ni har.\n- Flerfaktorsinloggning för e-post och fjärråtkomst.\n- Säkerhetskopior som testas regelbundet.\n- En enkel plan för vad ni gör vid en incident.\n- Rutiner för uppdateringar av datorer, servrar och programvara.\n\n> Börja smått och dokumentera. Det är ofta det som efterfrågas först.\n\nVi hjälper gärna till med en genomgång av nuläget."; coverAlt = "" };
      en = ?{ title = "NIS2: what does it mean for smaller businesses?"; excerpt = "The EU's NIS2 directive raises the bar for cyber security. Companies outside its scope are affected too, as customers place demands on their suppliers."; body = "NIS2 is the EU's updated framework for cyber security. It mainly covers medium and large organisations in critical sectors, but its effects reach further.\n\n## The supply chain in focus\n\nOrganisations in scope must manage risks in their supply chain. That means smaller companies may also be asked how they protect systems, data and access.\n\n## Five things to have in place\n\n- An up-to-date view of your systems and data.\n- Multi-factor sign-in for email and remote access.\n- Backups that are tested regularly.\n- A simple plan for what to do during an incident.\n- Routines for updating computers, servers and software.\n\n> Start small and write it down. That is usually what gets asked for first.\n\nWe are happy to help you review where you stand."; coverAlt = "" };
    });
    m.add(2, {
      id = 2; slug = "hall-beroendena-uppdaterade"; status = #published;
      publishedAt = 1790064000000000000; createdAt = 1790064000000000000; updatedAt = 1790064000000000000;
      area = ?#software; coverUrl = null;
      sv = { title = "Därför håller vi beroendena uppdaterade"; excerpt = "Moderna system bygger på hundratals öppna bibliotek. Att hålla dem uppdaterade är ett av de enklaste sätten att minska risken."; body = "Nästan all mjukvara bygger i dag på öppen källkod. Det sparar tid, men varje bibliotek är också en möjlig väg in om en sårbarhet upptäcks.\n\n## Så arbetar vi\n\n- **Små, täta uppdateringar** i stället för stora hopp en gång om året.\n- **Låsta versioner** så att samma kod byggs varje gång.\n- **Automatiska tester** som körs innan något når produktion.\n- **Färre beroenden:** vi lägger inte till ett bibliotek för något vi enkelt kan skriva själva.\n\n## Vad ni kan fråga er leverantör\n\n1. Hur ofta uppdateras era beroenden?\n2. Hur får ni veta när en sårbarhet publiceras?\n3. Hur snabbt kan en säkerhetsfix nå produktion?\n\nSäker utveckling handlar mindre om enskilda verktyg och mer om goda vanor."; coverAlt = "" };
      en = ?{ title = "Why we keep dependencies up to date"; excerpt = "Modern systems are built on hundreds of open-source libraries. Keeping them current is one of the simplest ways to reduce risk."; body = "Almost all software today is built on open source. It saves time, but every library is also a possible way in when a vulnerability is found.\n\n## How we work\n\n- **Small, frequent updates** instead of big jumps once a year.\n- **Pinned versions** so the same code is built every time.\n- **Automated tests** that run before anything reaches production.\n- **Fewer dependencies:** we don't add a library for something we can easily write ourselves.\n\n## What to ask your supplier\n\n1. How often are your dependencies updated?\n2. How do you find out when a vulnerability is published?\n3. How quickly can a security fix reach production?\n\nSecure development is less about individual tools and more about good habits."; coverAlt = "" };
    });
    m;
  };

  // Home-page sections as first shipped; admins edit them under "Startsida".
  let home : HomeContent = {
    hero = {
      sv = { eyebrow = "Axelkod AB · Mölndal"; words = ["Delar.", "Kod.", "Säkerhet."]; subtitle = "Reservdelar, mjukvara och cybersäkerhet, levererat med svensk noggrannhet."; cta = "Kontakta oss"; cta2 = "Se vad vi gör" };
      en = { eyebrow = "Axelkod AB · Mölndal, Sweden"; words = ["Parts.", "Code.", "Security."]; subtitle = "Spare parts, software and cyber security, delivered with Swedish precision."; cta = "Contact us"; cta2 = "See what we do" };
      highlight = 2;
      trust = [
      { icon = "person"; visual = ""; sv = { title = "Personlig kontakt"; text = "Du pratar direkt med oss, inte med en växel." }; en = { title = "Personal contact"; text = "You talk to us directly, not to a switchboard." } },
      { icon = "company"; visual = ""; sv = { title = "Svenskt bolag"; text = "Registrerat och verksamt i Mölndal." }; en = { title = "Swedish company"; text = "Registered and operating in Mölndal." } },
      { icon = "lock"; visual = ""; sv = { title = "Säkert från början"; text = "Säkerhet är en del av allt vi bygger." }; en = { title = "Secure by design"; text = "Security is part of everything we build." } },
      { icon = "clock"; visual = ""; sv = { title = "Snabbt svar"; text = "Vi återkommer inom 1–2 arbetsdagar." }; en = { title = "Quick response"; text = "We get back to you within 1–2 business days." } }
      ];
    };
    services = {
    sv = { eyebrow = "Tjänster"; title = "Vad vi gör"; intro = "Tre områden, ett bolag. Fråga oss så berättar vi mer." };
    en = { eyebrow = "Services"; title = "What we do"; intro = "Three areas, one company. Ask us and we'll tell you more." };
    items = [
      { icon = "parts"; visual = "gear"; sv = { title = "Fordonsdelar"; text = "Reservdelar och tillbehör till lastbilar och tunga fordon." }; en = { title = "Vehicle parts"; text = "Spare parts and accessories for trucks and heavy vehicles." } },
      { icon = "code"; visual = "code"; sv = { title = "Mjukvaruutveckling"; text = "Mjukvara, webbapplikationer och webbplatser byggda för att hålla." }; en = { title = "Software development"; text = "Software, web applications and websites built to last." } },
      { icon = "shield"; visual = "shield"; sv = { title = "Cybersäkerhet"; text = "Rådgivning inom IT- och informationssäkerhet." }; en = { title = "Cyber security"; text = "Consulting in IT and information security." } }
    ];
  };
    security = {
    sv = { eyebrow = "Säkerhet"; title = "Säkerhet i varje lager"; intro = "Vi bygger in skydd från början, inte i efterhand." };
    en = { eyebrow = "Security"; title = "Security in every layer"; intro = "We build protection in from the start, not as an afterthought." };
    items = [
      { icon = "code"; visual = ""; sv = { title = "Kod"; text = "Säker utveckling, granskad kod och beroenden vi har koll på." }; en = { title = "Code"; text = "Secure development, reviewed code and dependencies we keep track of." } },
      { icon = "server"; visual = ""; sv = { title = "Infrastruktur"; text = "Härdade system, minsta möjliga behörighet och övervakning." }; en = { title = "Infrastructure"; text = "Hardened systems, least privilege and monitoring." } },
      { icon = "users"; visual = ""; sv = { title = "Människor"; text = "Medvetenhet och rutiner som gör det svårt att bli lurad." }; en = { title = "People"; text = "Awareness and routines that make people hard to fool." } },
      { icon = "truck"; visual = ""; sv = { title = "Leverantörskedja"; text = "Spårbara delar och leverantörer vi kan stå för." }; en = { title = "Supply chain"; text = "Traceable parts and suppliers we can vouch for." } }
    ];
  };
    industries = {
    sv = { eyebrow = "Branscher"; title = "Vi hjälper"; intro = "" };
    en = { eyebrow = "Industries"; title = "Who we help"; intro = "" };
    items = [
      { icon = "truck"; visual = ""; sv = { title = "Åkerier & logistik"; text = "Rätt delar snabbt, så att fordonen rullar." }; en = { title = "Haulage & logistics"; text = "The right parts, fast, to keep vehicles moving." } },
      { icon = "wrench"; visual = ""; sv = { title = "Verkstäder"; text = "En pålitlig källa för reservdelar och tillbehör." }; en = { title = "Workshops"; text = "A reliable source of spare parts and accessories." } },
      { icon = "store"; visual = ""; sv = { title = "Små och medelstora företag"; text = "Webbplatser och system som växer med er." }; en = { title = "Small and medium businesses"; text = "Websites and systems that grow with you." } },
      { icon = "factory"; visual = ""; sv = { title = "Industri & tillverkning"; text = "Skydd för system som inte får stanna." }; en = { title = "Industry & manufacturing"; text = "Protection for systems that can't stop." } }
    ];
  };
  };

  public func migration(_ : OldActor) : NewActor {
    {
      admins = Map.empty();
      messages = Map.empty();
      config = {
        var contact = {
          email = ""; phone = null; street = null; postalCode = null; city = "Mölndal";
          orgNumber = null; showAddress = false; showPhone = false;
          mapLat = null; mapLon = null; mapUrl = null;
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
        var homeDraft = home;
        var homePublished = home;
        var seoPublishedAt = null;
        var site = {
          retentionMonths = 12;
          responseTime = {
            sv = "Vi återkommer inom 1–2 arbetsdagar.";
            en = "We get back to you within 1–2 business days.";
          };
        };
      };
      counters = { var nextMessageId = 0; var nextNewsId = 3 };
      news = sampleNews();
      form = { var secret = ""; usedTokens = Map.empty(); recent = Queue.empty() };
    };
  };
};
