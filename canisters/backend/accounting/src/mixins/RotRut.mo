// ROT/RUT (A8): parameters, claim cases from paid invoices, claims (begäran) for
// Skatteverket's e-service, and its decisions with the payout voucher. The XML and
// the decision file are handled in the browser, which holds the decrypted personnummer.
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
import Posting "../lib/Posting";
import Roles "../lib/Roles";
import RotRutLib "../lib/RotRut";
import SalesLib "../lib/Sales";
import R "../types/RotRut";
import S "../types/Sales";
import Types "../types";

mixin (
  roles : Types.Roles,
  config : Types.Config,
  chart : Types.Chart,
  ledger : Types.Ledger,
  files : Types.Files,
  counters : Types.Counters,
  audit : Types.Audit,
  sales : S.Sales,
  rotRut : R.RotRut,
) {
  func husCtx() : Posting.Ctx = { chart; config; ledger; files; counters; audit };
  func husToday() : Types.Date = Dates.fromTime(Time.now());

  func kindTag(k : R.HusKind) : Text = switch (k) { case (#rot) "rot"; case (#rut) "rut" };

  func casesFor(docId : Nat) : [R.HusCase] =
    (rotRut.casesOf.get(docId) ?? []).filterMap(func(i : Nat) : ?R.HusCase = rotRut.cases.get(i));

  public shared query ({ caller }) func getHusParams() : async Result.Result<[R.HusParams], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(rotRut.params);
  };

  public shared ({ caller }) func setHusParams(ps : [R.HusParams]) : async Result.Result<[R.HusParams], Types.Error> {
    if (not Roles.isOwner(roles, caller)) return #err(#notAuthorized);
    if (ps.size() == 0 or ps.size() > 50) return #err(#invalid("params"));
    for (p in ps.values()) switch (RotRutLib.checkParams(p)) { case (#err(e)) return #err(e); case (#ok(_)) {} };
    rotRut.params := ps;
    ignore Audit.append(audit, Time.now(), caller, "rotRut.params", "rotRutParams", null, #arr(ps.map(func(p : R.HusParams) : C.Value = #obj([
      ("from", #text(p.from)), ("rotBp", #int(p.rotBp)), ("rutBp", #int(p.rutBp)), ("rotCap", #int(p.rotCap)), ("totalCap", #int(p.totalCap)),
      ("xml11From", #text(p.xml11From)), ("source", #text(p.source)),
    ]))));
    #ok(ps);
  };

  public shared query ({ caller }) func listHusCases() : async Result.Result<[R.HusCase], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(rotRut.cases.reverseEntries().map(func((_, c) : (Nat, R.HusCase)) : R.HusCase = c).toArray());
  };

  public shared query ({ caller }) func listHusClaims() : async Result.Result<[R.Claim], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(rotRut.claims.reverseEntries().map(func((_, c) : (Nat, R.Claim)) : R.Claim = c).toArray());
  };

  /// Invoices with a deduction and payments that no case covers yet (oldest first).
  public shared query ({ caller }) func listHusReady() : async Result.Result<[R.HusReady], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    var out : [R.HusReady] = [];
    for (d in sales.docs.values()) switch (d.kind, d.snapshot.hus) {
      case (#invoice, ?h) {
        if (SalesLib.credited(sales, d.id) == 0) {
          let claimed = Map.empty<Nat, ()>();
          for (c in casesFor(d.id).values()) if (c.status != #cancelled) for (p in c.paymentIds.values()) claimed.add(p, ());
          var paid : Int = 0;
          var unclaimed : Int = 0;
          for (pid in (sales.paymentsOf.get(d.id) ?? []).values()) switch (sales.payments.get(pid)) {
            case (?p) { paid += p.amount; if (not claimed.containsKey(pid)) unclaimed += p.amount };
            case null {};
          };
          if (unclaimed > 0) out := out.concat([{
            salesDocId = d.id; number = d.number; customerName = d.snapshot.buyer.name; kind = h.kind; deduction = h.deduction;
            payable = SalesLib.total(d); paid; unclaimed; work = h.work.map(func(w : R.HusWork) : Text = w.workType);
          }]);
        };
      };
      case (_, _) {};
    };
    #ok(out);
  };

  /// A case for the invoice's payments not yet claimed: the same share of the deduction as
  /// the share of the customer's part paid (V12). Payments must be electronic and in one year.
  public shared ({ caller }) func createHusCase(input : R.CaseInput) : async Result.Result<R.HusCase, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let d = switch (sales.docs.get(input.salesDocId)) { case (?d) d; case null { return #err(#notFound) } };
    if (d.kind != #invoice) return #err(#invalid("salesDocId"));
    let h = switch (d.snapshot.hus) { case (?h) h; case null { return #err(#invalid("hus")) } };
    if (SalesLib.credited(sales, d.id) != 0) return #err(#conflict("credited"));
    let earlier = casesFor(d.id).filter(func(c : R.HusCase) : Bool = c.status != #cancelled);
    let claimed = Map.empty<Nat, ()>();
    for (c in earlier.values()) for (p in c.paymentIds.values()) claimed.add(p, ());
    var paidBefore : Int = 0;
    var paidNow : Int = 0;
    var latest = "";
    var yr = 0;
    var ids : [Nat] = [];
    for (pid in (sales.paymentsOf.get(d.id) ?? []).values()) switch (sales.payments.get(pid)) {
      case (?p) {
        if (claimed.containsKey(pid)) paidBefore += p.amount else {
          // Electronic payment is required for the deduction (V12).
          if (p.method == #cash) return #err(#invalid("cashPayment"));
          let y = RotRutLib.year(p.date);
          if (yr != 0 and y != yr) return #err(#invalid("paymentYear"));
          yr := y;
          if (p.date > latest) latest := p.date;
          paidNow += p.amount;
          ids := ids.concat([pid]);
        };
      };
      case null {};
    };
    if (ids.size() == 0) return #err(#invalid("noPayments"));
    let calc = switch (RotRutLib.caseAmounts(d.snapshot, paidBefore, paidNow)) { case (#ok(c)) c; case (#err(e)) return #err(e) };
    let hours = switch (RotRutLib.checkHours(h, input.hours)) { case (#ok(x)) x; case (#err(e)) return #err(e) };
    let now = Time.now();
    let id = rotRut.next;
    rotRut.next += 1;
    let c : R.HusCase = {
      id; salesDocId = d.id; invoiceNumber = d.number; kind = h.kind; paymentIds = ids; paymentDate = latest; year = yr;
      labour = calc.labour; paidLabour = calc.paidLabour; requested = calc.requested; material = calc.material; other = calc.other;
      hours; buyerAmounts = calc.buyerAmounts; subcontractor = input.subcontractor; staffingAgency = input.staffingAgency;
      deadline = RotRutLib.deadline(yr); status = #draft; claimId = null; approved = null; decisionRef = null; decisionDate = null;
      voucherId = null; createdAt = now; createdBy = caller;
    };
    rotRut.cases.add(id, c);
    rotRut.casesOf.add(d.id, (rotRut.casesOf.get(d.id) ?? []).concat([id]));
    ignore Audit.append(audit, now, caller, "rotRut.case.create", "rotRutCase", ?id, #obj([
      ("salesDocId", #int(d.id)), ("kind", #tag(kindTag(h.kind), #null_)), ("requested", #int(calc.requested)), ("paymentDate", #text(latest)),
    ]));
    #ok(c);
  };

  public shared ({ caller }) func cancelHusCase(id : Nat) : async Result.Result<R.HusCase, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let c = switch (rotRut.cases.get(id)) { case (?c) c; case null { return #err(#notFound) } };
    if (c.status != #draft) return #err(#conflict("status"));
    let x = { c with status = #cancelled };
    rotRut.cases.add(id, x);
    ignore Audit.append(audit, Time.now(), caller, "rotRut.case.cancel", "rotRutCase", ?id, #null_);
    #ok(x);
  };

  /// A claim (begäran): draft cases of one type and one payment year, up to 100 buyers.
  public shared ({ caller }) func createHusClaim(name : Text, caseIds : [Nat]) : async Result.Result<R.Claim, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let n = switch (RotRutLib.claimName(name)) { case (?n) n; case null { return #err(#invalid("name")) } };
    // The decision file names the claim; a unique name lets it match when an invoice has several cases.
    if (rotRut.claims.values().any(func(c : R.Claim) : Bool = c.name == n)) return #err(#conflict("nameTaken"));
    if (caseIds.size() == 0) return #err(#invalid("caseIds"));
    var kind : ?R.HusKind = null;
    var yr = 0;
    var buyers = 0;
    let seen = Map.empty<Nat, ()>();
    for (i in caseIds.values()) {
      if (seen.containsKey(i)) return #err(#invalid("caseIds"));
      seen.add(i, ());
      let c = switch (rotRut.cases.get(i)) { case (?c) c; case null { return #err(#notFound) } };
      if (c.status != #draft) return #err(#conflict("status"));
      switch (kind) { case (?k) { if (k != c.kind) return #err(#invalid("kind")) }; case null { kind := ?c.kind } };
      if (yr != 0 and c.year != yr) return #err(#invalid("paymentYear"));
      yr := c.year;
      buyers += c.buyerAmounts.size();
    };
    if (buyers > RotRutLib.MAX_BUYERS) return #err(#invalid("tooManyBuyers"));
    let today = husToday();
    let p = switch (RotRutLib.paramsOn(rotRut.params, today)) { case (?p) p; case null { return #err(#invalid("params")) } };
    let now = Time.now();
    let id = rotRut.next;
    rotRut.next += 1;
    let claim : R.Claim = {
      id; kind = kind ?? #rut; year = yr; name = n; caseIds; xmlVersion = if (today >= p.xml11From) "1.1" else "1.0";
      createdAt = now; createdBy = caller; submittedAt = null; submittedDate = null; confirmed = false;
    };
    rotRut.claims.add(id, claim);
    for (i in caseIds.values()) switch (rotRut.cases.get(i)) { case (?c) { rotRut.cases.add(i, { c with status = #claimed; claimId = ?id }) }; case null {} };
    ignore Audit.append(audit, now, caller, "rotRut.claim.create", "rotRutClaim", ?id, #obj([("caseIds", #arr(caseIds.map(func(i : Nat) : C.Value = #int(i)))), ("xmlVersion", #text(claim.xmlVersion))]));
    #ok(claim);
  };

  public shared ({ caller }) func deleteHusClaim(id : Nat) : async Result.Result<(), Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let claim = switch (rotRut.claims.get(id)) { case (?c) c; case null { return #err(#notFound) } };
    if (claim.submittedAt != null) return #err(#conflict("submitted"));
    for (i in claim.caseIds.values()) switch (rotRut.cases.get(i)) { case (?c) { rotRut.cases.add(i, { c with status = #draft; claimId = null }) }; case null {} };
    rotRut.claims.remove(id);
    ignore Audit.append(audit, Time.now(), caller, "rotRut.claim.delete", "rotRutClaim", ?id, #null_);
    #ok(());
  };

  /// From 2027 (XML 1.1) the performer confirms that the data is correct (V12).
  public shared ({ caller }) func markHusClaimSubmitted(id : Nat, date : Types.Date, confirmed : Bool) : async Result.Result<R.Claim, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let claim = switch (rotRut.claims.get(id)) { case (?c) c; case null { return #err(#notFound) } };
    if (claim.submittedAt != null) return #err(#conflict("submitted"));
    if (not Dates.isValid(date) or date > husToday()) return #err(#invalid("date"));
    if (claim.xmlVersion == "1.1" and not confirmed) return #err(#invalid("confirmed"));
    let now = Time.now();
    let x = { claim with submittedAt = ?now; submittedDate = ?date; confirmed };
    rotRut.claims.add(id, x);
    for (i in claim.caseIds.values()) switch (rotRut.cases.get(i)) { case (?c) { rotRut.cases.add(i, { c with status = #submitted }) }; case null {} };
    ignore Audit.append(audit, now, caller, "rotRut.claim.submit", "rotRutClaim", ?id, #obj([("date", #text(date)), ("confirmed", #bool(confirmed))]));
    #ok(x);
  };

  /// Skatteverket's decision for one case (matched in the browser from the decision file).
  public shared ({ caller }) func applyHusDecision(input : R.DecisionInput) : async Result.Result<R.HusCase, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let c = switch (rotRut.cases.get(input.caseId)) { case (?c) c; case null { return #err(#notFound) } };
    if (c.status != #submitted) return #err(#conflict("status"));
    if (input.approved < 0 or input.approved > c.requested or input.approved % 100 != 0) return #err(#invalid("approvedAmount"));
    if (not RotRutLib.validReference(input.reference)) return #err(#invalid("reference"));
    if (not Dates.isValid(input.date) or input.date > husToday()) return #err(#invalid("date"));
    switch (chart.accounts.get(input.bankAccount)) { case (?a) { if (a.kind != #asset or not a.active) return #err(#invalid("bankAccount")) }; case null { return #err(#invalid("bankAccount")) } };
    let d = switch (sales.docs.get(c.salesDocId)) { case (?d) d; case null { return #err(#notFound) } };
    let refused = c.requested - input.approved;
    let lines = if (config.settings.accountingMethod == #cash) {
      if (input.approved == 0) [] else SalesLib.husPayoutLines(d.snapshot, chart, input.approved, input.bankAccount);
    } else RotRutLib.decisionLines(input.approved, c.requested, input.bankAccount);
    let now = Time.now();
    let voucherId = if (lines.size() == 0) null else {
      let vin : Types.VoucherInput = {
        series = SalesLib.SERIES_BANK; eventDate = input.date;
        description = (switch (c.kind) { case (#rot) "Rotavdrag"; case (#rut) "Rutavdrag" }) # ", beslut " # input.reference # ", faktura " # c.invoiceNumber.toText();
        lines; attachmentIds = []; counterparty = ?"Skatteverket";
      };
      let fy = switch (Posting.check(husCtx(), vin)) { case (#ok(fy)) fy; case (#err(e)) return #err(e) };
      ?Posting.post(husCtx(), fy, vin, #rotRut(c.id), caller, now).id;
    };
    if (refused > 0) sales.husAdjust.add(d.id, (sales.husAdjust.get(d.id) ?? 0) + refused);
    let x = { c with status = #decided; approved = ?input.approved; decisionRef = ?input.reference; decisionDate = ?input.date; voucherId };
    rotRut.cases.add(c.id, x);
    ignore Audit.append(audit, now, caller, "rotRut.case.decision", "rotRutCase", ?c.id, #obj([
      ("approved", #int(input.approved)), ("reference", #text(input.reference)), ("date", #text(input.date)), ("bankAccount", #int(input.bankAccount)),
    ]));
    #ok(x);
  };
};
