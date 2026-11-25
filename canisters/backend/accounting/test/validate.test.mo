import { suite; test; expect } "mo:test";
import V "../src/lib/Validate";
import Types "../src/types";

let company : Types.CompanyProfile = {
  legalName = " Axelkod AB "; orgNr = "556677-8899"; vatNr = "se556677889901"; registeredOffice = "Mölndal";
  street = "Gatan 1"; postalCode = "431 30"; city = "Mölndal"; country = "se"; email = "info@axelkod.eu";
  phone = ?" "; web = null; bankgiro = ?"5050-1055"; plusgiro = null; iban = ?"SE45 5000 0000 0583 9825 7466";
  bic = ?"essesess"; fSkatt = true; peppolId = null;
};

func field(r : { #ok : Types.CompanyProfile; #err : Types.Error }) : Text = switch (r) { case (#err(#invalid(f))) { f }; case (_) { "" } };

suite("Validate", func() {
  test("org nr needs the NNNNNN-NNNN form and a Luhn check digit", func() {
    assert V.orgNr("556677-8899");
    assert not V.orgNr("556677-8898");
    assert not V.orgNr("5566778899");
  });
  test("IBAN mod-97, bankgiro Luhn, BIC length", func() {
    assert V.iban("SE45 5000 0000 0583 9825 7466");
    assert not V.iban("SE46 5000 0000 0583 9825 7466");
    assert V.bankgiro("5050-1055");
    assert not V.bankgiro("5050-1056");
    assert V.bic("ESSESESS");
    assert not V.bic("ESSE");
  });
  test("company profile is cleaned", func() {
    switch (V.company(company)) {
      case (#ok(c)) {
        expect.text(c.legalName).equal("Axelkod AB");
        expect.text(c.vatNr).equal("SE556677889901");
        expect.text(c.country).equal("SE");
        assert c.phone == null;
        assert c.bic == ?"ESSESESS";
      };
      case (#err(_)) { assert false };
    };
  });
  test("VAT nr must match the org nr", func() {
    expect.text(field(V.company({ company with vatNr = "SE556677889801" }))).equal("vatNr");
    expect.text(field(V.company({ company with orgNr = "556677-8898" }))).equal("orgNr");
    expect.text(field(V.company({ company with email = "x" }))).equal("email");
    expect.text(field(V.company({ company with iban = ?"SE00" }))).equal("iban");
  });
});
