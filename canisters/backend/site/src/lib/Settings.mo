// Cleaning and validation of the admin-editable settings.
import Array "mo:core/Array";
import Char "mo:core/Char";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Types "../types";
import V "Validate";

module {
  type R<T> = Result.Result<T, Types.Error>;

  func check(ok : Bool, field : Text) : R<()> = if (ok) #ok(()) else #err(#invalid(field));

  public func contact(c : Types.ContactInfo) : R<Types.ContactInfo> {
    let clean : Types.ContactInfo = {
      c with
      email = V.singleLine(c.email);
      phone = V.optLine(c.phone);
      street = V.optLine(c.street);
      postalCode = V.optLine(c.postalCode);
      city = V.singleLine(c.city);
      orgNumber = V.optLine(c.orgNumber);
      mapUrl = V.optLine(c.mapUrl);
    };
    check(clean.email == "" or V.isEmail(clean.email), "email")
      .chain(func _ = check(V.optLengthIn(clean.phone, 40), "phone"))
      .chain(func _ = check(V.optLengthIn(clean.street, 100), "street"))
      .chain(func _ = check(V.optLengthIn(clean.postalCode, 20), "postalCode"))
      .chain(func _ = check(V.lengthIn(clean.city, 1, 60), "city"))
      .chain(func _ = check(V.optLengthIn(clean.orgNumber, 20), "orgNumber"))
      .chain(func _ = check(coord(clean.mapLat, 90.0) and coord(clean.mapLon, 180.0), "map"))
      .chain(func _ = check(isUpload(clean.mapUrl), "mapUrl"))
      .mapOk(func _ = clean);
  };

  func coord(v : ?Float, limit : Float) : Bool {
    switch (v) { case (?x) { x >= -limit and x <= limit }; case null { true } };
  };

  /// Map snapshots are files uploaded to the site, never external addresses.
  func isUpload(u : ?Text) : Bool {
    switch (u) {
      case (?v) { v.startsWith(#text "/uploads/") and V.lengthIn(v, 10, 200) and not v.contains(#predicate(func c = c.isWhitespace() or c == '\"' or c == '<' or c == '>')) };
      case null { true };
    };
  };

  func seoLang(s : Types.SeoLang, lang : Text) : R<Types.SeoLang> {
    let clean : Types.SeoLang = {
      s with
      title = V.singleLine(s.title);
      metaDescription = V.singleLine(s.metaDescription);
      keywords = V.optLine(s.keywords);
      ogTitle = V.optLine(s.ogTitle);
      ogDescription = V.optLine(s.ogDescription);
      ogImageUrl = V.singleLine(s.ogImageUrl);
      canonicalBaseUrl = V.singleLine(s.canonicalBaseUrl).trimEnd(#char '/');
    };
    check(V.lengthIn(clean.title, 1, 120), lang # ".title")
      .chain(func _ = check(V.lengthIn(clean.metaDescription, 1, 320), lang # ".metaDescription"))
      .chain(func _ = check(V.optLengthIn(clean.keywords, 300), lang # ".keywords"))
      .chain(func _ = check(V.optLengthIn(clean.ogTitle, 120), lang # ".ogTitle"))
      .chain(func _ = check(V.optLengthIn(clean.ogDescription, 320), lang # ".ogDescription"))
      .chain(func _ = check(V.isHttpsUrl(clean.ogImageUrl), lang # ".ogImageUrl"))
      .chain(func _ = check(V.isHttpsUrl(clean.canonicalBaseUrl), lang # ".canonicalBaseUrl"))
      .mapOk(func _ = clean);
  };

  func optToken(t : ?Text, field : Text) : R<?Text> {
    switch (V.optLine(t)) {
      case (?v) { if (V.isToken(v)) #ok(?v) else #err(#invalid(field)) };
      case null { #ok(null) };
    };
  };

  public func seo(s : Types.SeoSettings) : R<Types.SeoSettings> {
    let sameAs = s.sameAs.map(V.singleLine).filter(func u = u != "");
    let organisationName = V.singleLine(s.organisationName);
    let logoUrl = V.singleLine(s.logoUrl);
    switch (seoLang(s.sv, "sv"), seoLang(s.en, "en"), optToken(s.googleVerification, "googleVerification"), optToken(s.bingVerification, "bingVerification")) {
      case (#ok(sv), #ok(en), #ok(google), #ok(bing)) {
        check(V.lengthIn(organisationName, 1, 120), "organisationName")
          .chain(func _ = check(V.isHttpsUrl(logoUrl), "logoUrl"))
          .chain(func _ = check(sameAs.size() <= 10 and sameAs.all(V.isHttpsUrl), "sameAs"))
          .mapOk(func _ = { sv; en; organisationName; logoUrl; sameAs; googleVerification = google; bingVerification = bing });
      };
      case (#err(e), _, _, _) { #err(e) };
      case (_, #err(e), _, _) { #err(e) };
      case (_, _, #err(e), _) { #err(e) };
      case (_, _, _, #err(e)) { #err(e) };
    };
  };

  public func site(s : Types.SiteSettings) : R<Types.SiteSettings> {
    let sv = V.singleLine(s.responseTime.sv);
    let en = V.singleLine(s.responseTime.en);
    check(s.retentionMonths >= 1 and s.retentionMonths <= 60, "retentionMonths")
      .chain(func _ = check(V.lengthIn(sv, 1, 200), "responseTime.sv"))
      .chain(func _ = check(V.lengthIn(en, 1, 200), "responseTime.en"))
      .mapOk(func _ = { retentionMonths = s.retentionMonths; responseTime = { sv; en } });
  };

  public func publicContact(c : Types.ContactInfo) : Types.PublicContact {
    {
      email = if (c.email == "") null else ?c.email;
      phone = if (c.showPhone) c.phone else null;
      street = if (c.showAddress) c.street else null;
      postalCode = if (c.showAddress) c.postalCode else null;
      city = c.city;
      orgNumber = c.orgNumber;
      mapUrl = c.mapUrl;
      mapLat = c.mapLat;
      mapLon = c.mapLon;
    };
  };
};
