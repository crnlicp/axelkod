import { suite; test; expect } "mo:test";
import Settings "../src/lib/Settings";
import Types "../src/types";

let contact : Types.ContactInfo = {
  email = " info@axelkod.eu "; phone = ?"031-123 45"; street = ?"Gatan 1"; postalCode = ?"431 30";
  city = "Mölndal"; orgNumber = ?"559000-0000"; showAddress = false; showPhone = true;
};

let seoLang : Types.SeoLang = {
  title = "T"; metaDescription = "D"; keywords = null; ogTitle = null; ogDescription = null;
  ogImageUrl = "https://axelkod.eu/og-image.png"; canonicalBaseUrl = "https://axelkod.eu/"; indexable = true;
};
let seo : Types.SeoSettings = {
  sv = seoLang; en = seoLang; organisationName = "Axelkod AB"; logoUrl = "https://axelkod.eu/icon-512.png";
  sameAs = ["https://www.linkedin.com/company/axelkod", " "]; googleVerification = ?"abc_123"; bingVerification = null;
};

func isErr<T>(r : { #ok : T; #err : Types.Error }, field : Text) : Bool {
  switch (r) { case (#err(#invalid(f))) { f == field }; case (_) { false } };
};

suite("Settings", func() {
  test("contact is cleaned and validated", func() {
    switch (Settings.contact(contact)) {
      case (#ok(c)) { expect.text(c.email).equal("info@axelkod.eu") };
      case (#err(_)) { assert false };
    };
    assert isErr(Settings.contact({ contact with email = "nope" }), "email");
    assert isErr(Settings.contact({ contact with city = "" }), "city");
  });
  test("empty contact email is allowed (hidden on the site)", func() {
    switch (Settings.contact({ contact with email = "" })) { case (#ok(_)) {}; case (#err(_)) { assert false } };
  });
  test("public contact respects show flags", func() {
    let p = Settings.publicContact(contact);
    assert p.phone == ?"031-123 45";
    assert p.street == null and p.postalCode == null;
    assert Settings.publicContact({ contact with email = "" }).email == null;
  });
  test("seo: trailing slash trimmed, blank sameAs dropped", func() {
    switch (Settings.seo(seo)) {
      case (#ok(s)) {
        expect.text(s.sv.canonicalBaseUrl).equal("https://axelkod.eu");
        expect.nat(s.sameAs.size()).equal(1);
      };
      case (#err(_)) { assert false };
    };
  });
  test("seo rejects unsafe values", func() {
    assert isErr(Settings.seo({ seo with en = { seoLang with ogImageUrl = "http://x.se/a.png" } }), "en.ogImageUrl");
    assert isErr(Settings.seo({ seo with googleVerification = ?"x\"><script>" }), "googleVerification");
    assert isErr(Settings.seo({ seo with sv = { seoLang with title = "" } }), "sv.title");
    assert isErr(Settings.seo({ seo with sameAs = ["javascript:alert(1)"] }), "sameAs");
  });
  test("site: retention bounds", func() {
    let site : Types.SiteSettings = { retentionMonths = 12; responseTime = { sv = "Snart"; en = "Soon" } };
    switch (Settings.site(site)) { case (#ok(_)) {}; case (#err(_)) { assert false } };
    assert isErr(Settings.site({ site with retentionMonths = 0 }), "retentionMonths");
    assert isErr(Settings.site({ site with retentionMonths = 61 }), "retentionMonths");
    assert isErr(Settings.site({ site with responseTime = { sv = ""; en = "x" } }), "responseTime.sv");
  });
});
