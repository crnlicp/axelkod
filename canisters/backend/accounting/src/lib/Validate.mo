// Company profile and settings validation. Returns cleaned values.
import Char "mo:core/Char";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Dates "Dates";
import Types "../types";

module {
  type R<T> = Result.Result<T, Types.Error>;

  func clean(t : Text) : Text = t.trim(#char ' ');

  func required(t : Text, max : Nat, field : Text) : R<Text> {
    let x = clean(t);
    if (x.size() == 0 or x.size() > max) #err(#invalid(field)) else #ok(x);
  };

  func optional(t : ?Text, max : Nat, field : Text) : R<?Text> {
    switch (t) {
      case null { #ok(null) };
      case (?v) {
        let x = clean(v);
        if (x.size() == 0) #ok(null) else if (x.size() > max) #err(#invalid(field)) else #ok(?x);
      };
    };
  };

  func digitValue(c : Char) : Nat = (c.toNat32() - '0'.toNat32()).toNat();

  func onlyDigits(t : Text) : Text = Text.fromIter(t.chars().filter(func c = c.isDigit()));

  /// Luhn over a digit string (organisationsnummer and bankgiro use it).
  public func luhn(ds : Text) : Bool {
    let cs = ds.toArray();
    var sum = 0;
    var i = cs.size();
    var double = false;
    while (i > 0) {
      i -= 1;
      var d = digitValue(cs[i]);
      if (double) { d *= 2; if (d > 9) d -= 9 };
      sum += d;
      double := not double;
    };
    cs.size() > 0 and sum % 10 == 0;
  };

  /// NNNNNN-NNNN with a valid check digit.
  public func orgNr(t : Text) : Bool {
    let cs = clean(t).toArray();
    if (cs.size() != 11 or cs[6] != '-') return false;
    let ds = onlyDigits(clean(t));
    ds.size() == 10 and luhn(ds);
  };

  /// "SE" + the 10 digits of the org nr + "01".
  public func vatNrFor(org : Text) : Text = "SE" # onlyDigits(org) # "01";

  public func email(t : Text) : Bool {
    let x = clean(t);
    let parts = x.split(#char '@').toArray();
    x.size() <= 254 and parts.size() == 2 and parts[0].size() > 0 and parts[1].contains(#char '.') and not x.contains(#char ' ');
  };

  func upperAlnum(t : Text) : Bool = t.chars().all(func c = c.isDigit() or (c >= 'A' and c <= 'Z'));

  /// ISO 13616 mod-97 check.
  public func iban(t : Text) : Bool {
    let x = Text.fromIter(clean(t).chars().filter(func c = c != ' ')).toUpper();
    let cs = x.toArray();
    if (cs.size() < 15 or cs.size() > 34 or not upperAlnum(x)) return false;
    if (not cs[0].isAlphabetic() or not cs[1].isAlphabetic()) return false;
    var rem = 0;
    let n = cs.size();
    for (i in Nat.range(0, n)) {
      let c = cs[(i + 4) % n];
      if (c.isDigit()) rem := (rem * 10 + digitValue(c)) % 97
      else rem := (rem * 100 + (c.toNat32() - 'A'.toNat32()).toNat() + 10) % 97;
    };
    rem == 1;
  };

  public func bic(t : Text) : Bool {
    let x = clean(t).toUpper();
    (x.size() == 8 or x.size() == 11) and upperAlnum(x);
  };

  /// Bankgiro: 7 or 8 digits shown as NNN-NNNN / NNNN-NNNN, Luhn check digit.
  public func bankgiro(t : Text) : Bool {
    let x = clean(t);
    let ds = onlyDigits(x);
    (ds.size() == 7 or ds.size() == 8) and luhn(ds) and x.chars().all(func c = c.isDigit() or c == '-');
  };

  public func company(c : Types.CompanyProfile) : R<Types.CompanyProfile> {
    let legalName = switch (required(c.legalName, 200, "legalName")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    if (not orgNr(c.orgNr)) return #err(#invalid("orgNr"));
    let org = clean(c.orgNr);
    let vatNr = clean(c.vatNr).toUpper();
    if (vatNr != vatNrFor(org)) return #err(#invalid("vatNr"));
    let registeredOffice = switch (required(c.registeredOffice, 100, "registeredOffice")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let street = switch (required(c.street, 200, "street")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let postalCode = switch (required(c.postalCode, 20, "postalCode")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let city = switch (required(c.city, 100, "city")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let country = clean(c.country).toUpper();
    if (country.size() != 2 or not upperAlnum(country)) return #err(#invalid("country"));
    if (not email(c.email)) return #err(#invalid("email"));
    let phone = switch (optional(c.phone, 40, "phone")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let web = switch (optional(c.web, 200, "web")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let bankgiroV = switch (optional(c.bankgiro, 20, "bankgiro")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    switch (bankgiroV) { case (?b) { if (not bankgiro(b)) return #err(#invalid("bankgiro")) }; case null {} };
    let plusgiro = switch (optional(c.plusgiro, 20, "plusgiro")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let ibanV = switch (optional(c.iban, 50, "iban")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    switch (ibanV) { case (?b) { if (not iban(b)) return #err(#invalid("iban")) }; case null {} };
    let bicV = switch (optional(c.bic, 11, "bic")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    switch (bicV) { case (?b) { if (not bic(b)) return #err(#invalid("bic")) }; case null {} };
    let peppolId = switch (optional(c.peppolId, 60, "peppolId")) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    #ok({
      legalName;
      orgNr = org;
      vatNr;
      registeredOffice;
      street;
      postalCode;
      city;
      country;
      email = clean(c.email);
      phone;
      web;
      bankgiro = bankgiroV;
      plusgiro;
      iban = switch (ibanV) { case (?x) ?x.toUpper(); case null null };
      bic = switch (bicV) { case (?x) ?x.toUpper(); case null null };
      fSkatt = c.fSkatt;
      peppolId;
    });
  };

  public func settings(s : Types.AccountingSettings) : R<Types.AccountingSettings> {
    if (s.invoiceTermsDays > 365) return #err(#invalid("invoiceTermsDays"));
    switch (s.storageNotice) {
      case (?n) {
        if (not Dates.isValid(n.date)) return #err(#invalid("storageNotice.date"));
        let location = clean(n.location);
        if (location.size() == 0 or location.size() > 500) return #err(#invalid("storageNotice.location"));
        #ok({ s with storageNotice = ?{ n with location } });
      };
      case null { #ok(s) };
    };
  };
};
