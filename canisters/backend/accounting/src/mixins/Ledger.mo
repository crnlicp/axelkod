// Drafts, posting and corrections (BFL 5 kap.). There are no edit or delete
// methods for posted vouchers: a mistake is fixed by a correction voucher.
import Iter "mo:core/Iter";
import Array "mo:core/Array";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Audit "../lib/Audit";
import Encode "../lib/Encode";
import Ledger "../lib/Ledger";
import Roles "../lib/Roles";
import Seed "../lib/Seed";
import Types "../types";

mixin (
  roles : Types.Roles,
  config : Types.Config,
  chart : Types.Chart,
  ledger : Types.Ledger,
  files : Types.Files,
  counters : Types.Counters,
  audit : Types.Audit,
) {
  transient let MAX_PAGE = 200;
  transient let MAX_DRAFTS = 1_000;

  func pageOf(it : Iter.Iter<Types.Voucher>, offset : Nat, limit : Nat) : Types.Page<Types.VoucherView> {
    let all = it.toArray();
    let n = Nat.min(limit, MAX_PAGE);
    let items = all.sliceToArray(offset, offset + n).map(func v = Ledger.view(ledger, files, v));
    { items; total = all.size() };
  };

  func doPost(caller : Principal, v : Types.VoucherInput, source : Types.SourceRef, corrects : ?Nat) : Result.Result<Types.Voucher, Types.Error> {
    let fy = switch (Ledger.check(chart, config.lockDate, v, func id = files.attachments.containsKey(id))) {
      case (#ok(fy)) { fy };
      case (#err(e)) { return #err(e) };
    };
    let now = Time.now();
    let voucher = Ledger.post(ledger, fy, counters.nextVoucher, v, source, corrects, caller, now);
    counters.nextVoucher += 1;
    let action = if (corrects == null) "voucher.post" else "voucher.correct";
    ignore Audit.append(audit, now, caller, action, "voucher", ?voucher.id, Encode.voucher(voucher));
    #ok(voucher);
  };

  // ── Drafts (no number until posted) ──

  public shared query ({ caller }) func listDrafts() : async Result.Result<[Types.VoucherDraft], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    #ok(ledger.drafts.values().toArray());
  };

  /// Creates (id = null) or replaces a draft. Only sizes are checked here; the
  /// full rules run when it is posted.
  public shared ({ caller }) func saveDraft(id : ?Nat, v : Types.VoucherInput) : async Result.Result<Types.VoucherDraft, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (v.description.size() > 500) return #err(#invalid("description"));
    if (v.lines.size() > Ledger.MAX_LINES) return #err(#invalid("lines"));
    if (v.attachmentIds.size() > Ledger.MAX_ATTACHMENTS) return #err(#invalid("attachmentIds"));
    let draftId = switch (id) {
      case (?d) { if (not ledger.drafts.containsKey(d)) return #err(#notFound); d };
      case null {
        if (ledger.drafts.size() >= MAX_DRAFTS) return #err(#invalid("tooManyDrafts"));
        let d = counters.nextDraft;
        counters.nextDraft += 1;
        d;
      };
    };
    let now = Time.now();
    let draft = { v with id = draftId; updatedAt = now; updatedBy = caller };
    ledger.drafts.add(draftId, draft);
    ignore Audit.append(audit, now, caller, "draft.save", "draft", ?draftId, Encode.input(v));
    #ok(draft);
  };

  public shared ({ caller }) func deleteDraft(id : Nat) : async Result.Result<(), Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    if (not ledger.drafts.containsKey(id)) return #err(#notFound);
    ledger.drafts.remove(id);
    ignore Audit.append(audit, Time.now(), caller, "draft.delete", "draft", ?id, #null_);
    #ok(());
  };

  // ── Posting ──

  public shared ({ caller }) func postDraft(id : Nat) : async Result.Result<Types.Voucher, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let d = ledger.drafts.get(id) ?? (return #err(#notFound));
    let input : Types.VoucherInput = {
      series = d.series;
      eventDate = d.eventDate;
      description = d.description;
      lines = d.lines;
      attachmentIds = d.attachmentIds;
      counterparty = d.counterparty;
    };
    let r = doPost(caller, input, #manual, null);
    switch (r) { case (#ok(_)) { ledger.drafts.remove(id) }; case (#err(_)) {} };
    r;
  };

  public shared ({ caller }) func postVoucher(v : Types.VoucherInput) : async Result.Result<Types.Voucher, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    doPost(caller, v, #manual, null);
  };

  /// A correction voucher in series C that references the original (5 kap. 5 §).
  /// `lines = null` reverses the original in full.
  public shared ({ caller }) func correctVoucher(id : Nat, eventDate : Types.Date, description : Text, lines : ?[Types.VoucherLine]) : async Result.Result<Types.Voucher, Types.Error> {
    if (not Roles.canBook(roles, caller)) return #err(#notAuthorized);
    let orig = ledger.vouchers.get(id) ?? (return #err(#notFound));
    let input : Types.VoucherInput = {
      series = Seed.CORRECTION_SERIES;
      eventDate;
      description;
      lines = lines ?? Ledger.reversal(orig.lines);
      attachmentIds = [];
      counterparty = orig.counterparty;
    };
    doPost(caller, input, orig.source, ?id);
  };

  // ── Reads ──

  public shared query ({ caller }) func getVoucher(id : Nat) : async Result.Result<Types.VoucherView, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let v = ledger.vouchers.get(id) ?? (return #err(#notFound));
    #ok(Ledger.view(ledger, files, v));
  };

  /// Grundbok: registration order, optionally one series.
  public shared query ({ caller }) func journal(fiscalYearId : Nat, series : ?Text, offset : Nat, limit : Nat) : async Result.Result<Types.Page<Types.VoucherView>, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let it = ledger.vouchers.values().filter(func(v : Types.Voucher) : Bool = v.fiscalYearId == fiscalYearId and (series == null or series == ?v.series));
    #ok(pageOf(it, offset, limit));
  };

  /// Huvudbok input: the vouchers that touch one account, in registration order.
  public shared query ({ caller }) func accountVouchers(fiscalYearId : Nat, account : Nat, offset : Nat, limit : Nat) : async Result.Result<Types.Page<Types.VoucherView>, Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let it = ledger.vouchers.values().filter(func(v : Types.Voucher) : Bool = v.fiscalYearId == fiscalYearId and v.lines.any(func(l : Types.VoucherLine) : Bool = l.account == account));
    #ok(pageOf(it, offset, limit));
  };

  /// Net amount per account and month: the trial balance and reports read this.
  public shared query ({ caller }) func balances(fiscalYearId : Nat) : async Result.Result<[Types.BalanceRow], Types.Error> {
    if (not Roles.canRead(roles, caller)) return #err(#notAuthorized);
    let fy = chart.fiscalYears.get(fiscalYearId) ?? (return #err(#notFound));
    #ok(Ledger.balances(ledger, fy));
  };
};
