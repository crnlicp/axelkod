// Public contact form: token issue and submit. No email is sent; messages are
// only stored for the admin inbox.
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Queue "mo:core/Queue";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import ContactLib "../lib/Contact";
import FormToken "../lib/FormToken";
import Types "../types";

mixin (messages : Types.Messages, counters : Types.Counters, form : Types.FormState) {
  /// Controller-only: clears the global rate-limit window, e.g. after a bot used up
  /// the daily quota (or between local test runs). Single-use tokens stay recorded.
  public shared ({ caller }) func resetFormLimits() : async Result.Result<(), Types.Error> {
    if (not caller.isController()) return #err(#notAuthorized);
    form.recent.clear();
    #ok(());
  };

  public query func getFormToken(nonce : Text) : async Result.Result<Text, Types.SubmitError> {
    if (form.secret.size() == 0) return #err(#unavailable);
    if (not FormToken.isNonce(nonce)) return #err(#tokenInvalid);
    #ok(FormToken.issue(form.secret, Time.now(), nonce));
  };

  public func submitContact(input : Types.ContactInput, token : Text) : async Result.Result<Nat, Types.SubmitError> {
    if (form.secret.size() == 0) return #err(#unavailable);
    let now = Time.now();
    let issuedAt = switch (FormToken.verify(form.secret, token, now)) {
      case (#ok(t)) { t };
      case (#err(#invalid)) { return #err(#tokenInvalid) };
      case (#err(#tooFast)) { return #err(#tokenTooFast) };
      case (#err(#expired)) { return #err(#tokenExpired) };
    };
    if (form.usedTokens.containsKey(token)) return #err(#tokenUsed);

    // Forget used tokens once they have expired anyway.
    for ((t, at) in form.usedTokens.toArray().values()) {
      if (now - at > FormToken.MAX_AGE_NS) form.usedTokens.remove(t);
    };
    form.usedTokens.add(token, issuedAt);

    // Honeypot filled: pretend success so the bot learns nothing, store nothing.
    if (input.website != "") return #ok(0);

    let clean = switch (ContactLib.clean(input)) {
      case (#ok(c)) { c };
      case (#err(e)) { return #err(e) };
    };
    ContactLib.prune(form.recent, now);
    if (not ContactLib.withinGlobalLimit(form.recent, now)) return #err(#rateLimited);
    if (ContactLib.recentFromEmail(messages, clean.email, now) >= ContactLib.MAX_PER_EMAIL_PER_DAY) return #err(#rateLimited);

    let id = counters.nextMessageId + 1;
    counters.nextMessageId := id;
    messages.add(id, { clean with id; createdAt = now; area = input.area; lang = input.lang; status = #new; adminNote = null });
    form.recent.pushBack(now);
    #ok(id);
  };
};
