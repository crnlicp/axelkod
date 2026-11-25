// Customers, items and the legal parameters used by sales.
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import C "../lib/Canonical";
import Dates "../lib/Dates";
import Encode "../lib/Encode";
import Invoice "../lib/Invoice";
import Roles "../lib/Roles";
import S "../types/Sales";
import Types "../types";

mixin (roles : Types.Roles, chart : Types.Chart, sales : S.Sales, audit : Types.Audit) {
  transient let MAX_PARTIES = 50_000;

  public shared query ({ caller }) func listCustomers() : async Result.Result<[S.Customer], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(sales.customers.values().toArray());
  };

  /// Creates (id = null) or updates a customer. Issued documents keep their own snapshot.
  public shared ({ caller }) func saveCustomer(id : ?Nat, c : S.CustomerInput) : async Result.Result<S.Customer, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let clean = switch (Invoice.customer(c)) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let cid = switch (id) {
      case (?i) { if (not sales.customers.containsKey(i)) return #err(#notFound); i };
      case null {
        if (sales.customers.size() >= MAX_PARTIES) return #err(#invalid("tooMany"));
        let i = sales.next;
        sales.next += 1;
        i;
      };
    };
    let saved : S.Customer = { clean with id = cid };
    sales.customers.add(cid, saved);
    ignore Audit.append(audit, Time.now(), caller, "customer.save", "customer", ?cid, Encode.customer(clean));
    #ok(saved);
  };

  public shared query ({ caller }) func listItems() : async Result.Result<[S.Item], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(sales.items.values().toArray());
  };

  public shared ({ caller }) func saveItem(id : ?Nat, i : S.ItemInput) : async Result.Result<S.Item, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let clean = switch (Invoice.item(i, chart)) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let iid = switch (id) {
      case (?x) { if (not sales.items.containsKey(x)) return #err(#notFound); x };
      case null {
        if (sales.items.size() >= MAX_PARTIES) return #err(#invalid("tooMany"));
        let x = sales.next;
        sales.next += 1;
        x;
      };
    };
    let saved : S.Item = { clean with id = iid };
    sales.items.add(iid, saved);
    ignore Audit.append(audit, Time.now(), caller, "item.save", "item", ?iid, #obj([("name", #text(clean.name)), ("priceExVat", #int(clean.priceExVat)), ("vatCode", #text(clean.vatCode)), ("account", #int(clean.account))]));
    #ok(saved);
  };

  public shared query ({ caller }) func getParameters() : async Result.Result<S.Parameters, Types.Error> {
    if (not Roles.canSeeSetup(roles, caller)) return #err(#notAuthorized);
    #ok(sales.params);
  };

  /// Owner only; every change is audited with its source.
  public shared ({ caller }) func setParameters(p : S.Parameters) : async Result.Result<(), Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    if (p.source.size() == 0 or p.source.size() > 500) return #err(#invalid("source"));
    if (p.referenceRates.size() > 200) return #err(#invalid("referenceRates"));
    for (r in p.referenceRates.values()) {
      if (not Dates.isValid(r.from) or (not r.from.endsWith(#text "-01-01") and not r.from.endsWith(#text "-07-01"))) return #err(#invalid("referenceRates"));
      if (r.rateBp < -10_000 or r.rateBp > 10_000) return #err(#invalid("referenceRates"));
    };
    if (p.lateInterestMarginBp > 10_000 or p.reminderFee < 0 or p.forseningsersattning < 0 or p.simplifiedInvoiceLimit < 0) return #err(#invalid("parameters"));
    sales.params := p;
    ignore Audit.append(audit, Time.now(), caller, "parameters.set", "parameters", null, #obj([
      ("referenceRates", #arr(p.referenceRates.map(func(r : S.RefRate) : C.Value = #obj([("from", #text(r.from)), ("rateBp", #int(r.rateBp))])))),
      ("lateInterestMarginBp", #int(p.lateInterestMarginBp)), ("reminderFee", #int(p.reminderFee)),
      ("forseningsersattning", #int(p.forseningsersattning)), ("simplifiedInvoiceLimit", #int(p.simplifiedInvoiceLimit)),
      ("ocrLengthDigit", #bool(p.ocrLengthDigit)), ("source", #text(p.source)),
    ]));
    #ok(());
  };
};
