// Moms: VAT return per period (preview with checks → lock and settle → file → paid),
// EU sales list and VIES checks. The XML and SKV574008 files are built in the browser
// from the stored values (V3, V4).
import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Error "mo:core/Error";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Result "mo:core/Result";
import Set "mo:core/Set";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Prim "mo:⛔";
import Audit "../lib/Audit";
import Canonical "../lib/Canonical";
import Chart "../lib/Chart";
import Dates "../lib/Dates";
import Posting "../lib/Posting";
import Roles "../lib/Roles";
import VatLib "../lib/Vat";
import B "../types/Bank";
import P "../types/Purchases";
import S "../types/Sales";
import V "../types/Vat";
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
  purchases : P.Purchases,
  bank : B.Bank,
  vat : V.Vat,
) {
  func vatCtx() : Posting.Ctx = { chart; config; ledger; files; counters; audit };

  func vatWarnings(from : Types.Date, to : Types.Date, s : Map.Map<Nat, Int>, exact : Map.Map<Nat, Int>) : [V.Warning] {
    let out = Map.empty<Text, Nat>();
    let put = func(code : Text, n : Nat) { if (n > 0) out.add(code, n) };
    // Files not yet used as evidence anywhere (the Inköp inbox).
    let used = Set.empty<Nat>();
    for (v in ledger.vouchers.values()) for (a in v.attachmentIds.values()) used.add(a);
    for (a in files.links.keys()) used.add(a);
    for (a in purchases.used.keys()) used.add(a);
    put("unbookedInbox", files.attachments.keys().filter(func(id : Nat) : Bool = not used.contains(id)).size());
    put("unmatchedBank", bank.txs.values().filter(func(t : B.BankTx) : Bool = t.match == null and t.date >= from and t.date <= to).size());
    var noCode = 0;
    for ((acc, _) in s.entries()) switch (chart.accounts.get(acc)) {
      case (?a) { if (a.kind == #revenue and a.vatCode == null and acc != VatLib.ROUNDING and acc != 3960) noCode += 1 };
      case null {};
    };
    put("revenueWithoutVatCode", noCode);
    let (_, missing, goods, services) = VatLib.eslRows(chart, sales, from, to);
    put("eslMissingVatNr", missing);
    if (goods != (exact.get(35) ?? 0) or services != (exact.get(39) ?? 0)) put("eslDiffers", 1);
    // An earlier date that is not locked: a return before this one may be missing.
    let earlier = chart.fiscalYears.values().any(func(fy : Types.FiscalYear) : Bool = fy.start < from);
    let dayBefore = Dates.addDays(from, -1);
    let lockedBefore = switch (config.lockDate) { case (?d) { d >= dayBefore }; case null { false } };
    if (earlier and not lockedBefore) put("earlierNotLocked", 1);
    out.entries().map(func((code, count) : (Text, Nat)) : V.Warning = { code; count }).toArray();
  };

  public shared query ({ caller }) func vatPreview(from : Types.Date, to : Types.Date) : async Result.Result<V.Preview, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    switch (VatLib.checkPeriod(chart, config.settings.vatPeriod, from, to)) { case (#err(e)) return #err(e); case (#ok) {} };
    switch (vat.returnOf.get(from)) {
      case (?id) {
        let r = vat.returns.get(id) ?? (return #err(#notFound));
        return #ok({ from; to; boxes = r.boxes; exact = r.exact; warnings = []; filed = ?r });
      };
      case null {};
    };
    let s = VatLib.sums(chart, ledger, from, to);
    let exact = VatLib.exactBoxes(chart, s, purchases, from, to);
    let (boxes, ex) = VatLib.finish(exact);
    #ok({ from; to; boxes; exact = ex; warnings = vatWarnings(from, to, s, exact); filed = null });
  };

  public shared query ({ caller }) func listVatReturns() : async Result.Result<[V.VatReturn], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(vat.returns.reverseEntries().map(func((_, r) : (Nat, V.VatReturn)) : V.VatReturn = r).toArray());
  };

  /// Locks the period in one update: stores the boxes and the source hash, posts the
  /// settlement voucher (series M, dated the last day) and moves the lock date there.
  public shared ({ caller }) func lockVatReturn(from : Types.Date, to : Types.Date, note : ?Text) : async Result.Result<V.VatReturn, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    switch (VatLib.checkPeriod(chart, config.settings.vatPeriod, from, to)) { case (#err(e)) return #err(e); case (#ok) {} };
    if (vat.returnOf.containsKey(from)) return #err(#conflict("period"));
    if (Dates.fromTime(Time.now()) <= to) return #err(#invalid("periodNotEnded"));
    let cleanNote = switch (note) {
      case (?n) { let t = n.trim(#char ' '); if (t.size() > VatLib.MAX_NOTE) return #err(#invalid("note")); if (t == "") null else ?t };
      case null null;
    };
    let s = VatLib.sums(chart, ledger, from, to);
    let (boxes, exact) = VatLib.finish(VatLib.exactBoxes(chart, s, purchases, from, to));
    let (voucherCount, voucherHash) = VatLib.sources(chart, ledger, from, to);
    let lines = VatLib.settlementLines(chart, s, VatLib.get(boxes, 49));
    let now = Time.now();
    let id = vat.next;
    let settlementVoucherId = if (lines.size() < 2) null else {
      let vin : Types.VoucherInput = {
        series = VatLib.SERIES; eventDate = to; description = "Momsredovisning " # from # " – " # to;
        lines; attachmentIds = []; counterparty = ?"Skatteverket";
      };
      let fy = switch (Posting.check(vatCtx(), vin)) { case (#ok(fy)) fy; case (#err(e)) return #err(e) };
      ?Posting.post(vatCtx(), fy, vin, #vatReturn(id), caller, now).id;
    };
    vat.next += 1;
    switch (config.lockDate) {
      case (?d) { if (d < to) config.lockDate := ?to };
      case null { config.lockDate := ?to };
    };
    let r : V.VatReturn = {
      id; from; to; boxes; exact; voucherCount; voucherHash; settlementVoucherId; note = cleanNote;
      lockedAt = now; lockedBy = caller; filedAt = null; filedBy = null; receiptRef = null; taxEntryId = null;
    };
    vat.returns.add(id, r);
    vat.returnOf.add(from, id);
    ignore Audit.append(audit, now, caller, "vat.lock", "vatReturn", ?id, #obj([
      ("from", #text(from)), ("to", #text(to)),
      ("boxes", #arr(boxes.map(func(b : V.Box) : Canonical.Value = #arr([#int(b.box), #int(b.amount)])))),
      ("voucherHash", #blob(voucherHash)), ("lockDate", #text(to)),
    ]));
    #ok(r);
  };

  /// Records that the return was submitted in Skatteverket's e-service.
  public shared ({ caller }) func markVatReturnFiled(id : Nat, receiptRef : ?Text) : async Result.Result<V.VatReturn, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let r = vat.returns.get(id) ?? (return #err(#notFound));
    if (r.filedAt != null) return #err(#conflict("filed"));
    let ref = switch (receiptRef) {
      case (?x) { let t = x.trim(#char ' '); if (t.size() > 100) return #err(#invalid("receiptRef")); if (t == "") null else ?t };
      case null null;
    };
    let now = Time.now();
    let saved = { r with filedAt = ?now; filedBy = ?caller; receiptRef = ref };
    vat.returns.add(id, saved);
    ignore Audit.append(audit, now, caller, "vat.filed", "vatReturn", ?id, #obj([("receiptRef", Canonical.opt(ref, Canonical.text))]));
    #ok(saved);
  };

  /// Links the booked tax-account VAT entry (the amount on box 49, debited or credited).
  public shared ({ caller }) func linkVatPayment(id : Nat, taxEntryId : Nat) : async Result.Result<V.VatReturn, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let r = vat.returns.get(id) ?? (return #err(#notFound));
    if (r.taxEntryId != null) return #err(#conflict("paid"));
    let e = bank.tax.get(taxEntryId) ?? (return #err(#notFound));
    if (e.kind != #vat or e.voucherId == null) return #err(#invalid("taxEntryId"));
    if (e.amount != -VatLib.get(r.boxes, 49) * 100) return #err(#invalid("amount"));
    for (x in vat.returns.values()) if (x.taxEntryId == ?taxEntryId) return #err(#conflict("taxEntry"));
    let saved = { r with taxEntryId = ?taxEntryId };
    vat.returns.add(id, saved);
    ignore Audit.append(audit, Time.now(), caller, "vat.paid", "vatReturn", ?id, #obj([("taxEntryId", #int(taxEntryId))]));
    #ok(saved);
  };

  // ── EU sales list ──

  public shared query ({ caller }) func ecSalesPreview(from : Types.Date, to : Types.Date) : async Result.Result<V.EslPreview, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    switch (VatLib.eslPeriod(from, to)) { case (#err(e)) return #err(e); case (#ok(_)) {} };
    switch (vat.eslOf.get(from # "/" # to)) {
      case (?id) { let x = vat.esl.get(id) ?? (return #err(#notFound)); return #ok({ from; to; rows = x.rows; missingVatNr = 0; filed = ?x }) };
      case null {};
    };
    let (rows, missingVatNr, _, _) = VatLib.eslRows(chart, sales, from, to);
    #ok({ from; to; rows; missingVatNr; filed = null });
  };

  public shared query ({ caller }) func listEcSalesLists() : async Result.Result<[V.EcSalesList], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(vat.esl.reverseEntries().map(func((_, r) : (Nat, V.EcSalesList)) : V.EcSalesList = r).toArray());
  };

  /// Freezes the rows that were filed, with the contact details printed on the file.
  public shared ({ caller }) func fileEcSalesList(x : V.EslFileInput) : async Result.Result<V.EcSalesList, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    switch (VatLib.eslPeriod(x.from, x.to)) { case (#err(e)) return #err(e); case (#ok(_)) {} };
    if (Dates.fromTime(Time.now()) <= x.to) return #err(#invalid("periodNotEnded"));
    let key = x.from # "/" # x.to;
    if (vat.eslOf.containsKey(key)) return #err(#conflict("period"));
    let contactName = x.contactName.trim(#char ' ');
    if (contactName == "" or contactName.size() > 35) return #err(#invalid("contactName"));
    let phone = x.phone.trim(#char ' ');
    if (phone.size() < 5 or phone.size() > 17 or not phone.chars().all(func(c : Char) : Bool = (c >= '0' and c <= '9') or c == '-' or c == '+')) return #err(#invalid("phone"));
    let email = switch (x.email) { case (?e) { let t = e.trim(#char ' '); if (t == "") null else if (t.size() > 100 or not t.contains(#char '@')) return #err(#invalid("email")) else ?t }; case null null };
    let receiptRef = switch (x.receiptRef) { case (?r) { let t = r.trim(#char ' '); if (t.size() > 100) return #err(#invalid("receiptRef")); if (t == "") null else ?t }; case null null };
    let (rows, missing, _, _) = VatLib.eslRows(chart, sales, x.from, x.to);
    if (rows.size() == 0) return #err(#invalid("noRows"));
    if (missing > 0) return #err(#invalid("missingVatNr"));
    let now = Time.now();
    let id = vat.next;
    vat.next += 1;
    let saved : V.EcSalesList = { x with contactName; phone; email; receiptRef; id; rows; filedAt = now; filedBy = caller };
    vat.esl.add(id, saved);
    vat.eslOf.add(key, id);
    ignore Audit.append(audit, now, caller, "esl.filed", "ecSalesList", ?id, #obj([
      ("from", #text(x.from)), ("to", #text(x.to)),
      ("rows", #arr(rows.map(func(r : V.EslRow) : Canonical.Value = #arr([#text(r.vatNr), #int(r.goods), #int(r.triangulation), #int(r.services)])))),
    ]));
    #ok(saved);
  };

  // ── VIES (V5) ──

  public shared query ({ caller }) func getVatCheck(vatNr : Text) : async Result.Result<?V.VatCheck, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(vat.checks.get(VatLib.normalizeVatNr(vatNr)));
  };

  /// Keeps only what every replica sees the same way (V5: requestDate differs per call).
  public shared query func viesTransform(arg : V.TransformArg) : async V.HttpResponse {
    let body = switch (arg.response.body.decodeUtf8()) {
      case (?t) { if (arg.response.status == 200) VatLib.viesCanonical(t) ?? "" else "" };
      case null "";
    };
    { status = arg.response.status; headers = []; body = body.encodeUtf8() };
  };

  /// Checks a VAT number in VIES (HTTPS outcall from one node) and stores the answer.
  public shared ({ caller }) func checkVatNumber(vatNr : Text) : async Result.Result<V.VatCheck, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let nr = VatLib.normalizeVatNr(vatNr);
    let body = VatLib.viesBody(nr) ?? (return #err(#invalid("vatNr")));
    let day = Dates.dayNumber(Time.now());
    let used = if (vat.viesUse.0 == day) vat.viesUse.1 else 0;
    if (used >= VatLib.VIES_PER_DAY) return #err(#invalid("viesLimit"));
    vat.viesUse := (day, used + 1);
    let request : V.HttpRequest = {
      url = VatLib.VIES_URL;
      max_response_bytes = ?VatLib.VIES_MAX_BYTES;
      method = #post;
      headers = [{ name = "Content-Type"; value = "application/json" }, { name = "Accept"; value = "application/json" }, { name = "User-Agent"; value = "ic-canister" }];
      body = ?body.encodeUtf8();
      transform = ?{ function = viesTransform; context = ([] : [Nat8]).toBlob() };
      // One node sends it: VIES limits concurrent requests, and the answer is advisory.
      is_replicated = ?false;
    };
    let ic : actor { http_request : V.HttpRequest -> async V.HttpResponse } = actor ("aaaaa-aa");
    let size = (VatLib.VIES_URL.size() + body.size() + 200).toNat64();
    let response = try {
      await (with cycles = Prim.costHttpRequest(size, VatLib.VIES_MAX_BYTES)) ic.http_request(request);
    } catch (e) { return #err(#invalid("vies:" # e.message())) };
    let text = response.body.decodeUtf8() ?? "";
    let parts = text.split(#char '\n').toArray();
    if (response.status != 200 or parts.size() < 3) return #err(#invalid("viesUnavailable"));
    let opt = func(t : Text) : ?Text = if (t == "") null else ?t;
    let check : V.VatCheck = { vatNr = nr; valid = parts[0] == "1"; name = opt(parts[1]); address = opt(parts[2]); checkedAt = Time.now(); checkedBy = caller };
    vat.checks.add(nr, check);
    ignore Audit.append(audit, check.checkedAt, caller, "vat.vies", "vatCheck", null, #obj([("vatNr", #text(nr)), ("valid", #bool(check.valid))]));
    #ok(check);
  };
};
