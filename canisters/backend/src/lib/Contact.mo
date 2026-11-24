// Contact-form input cleaning, validation and rate limiting.
import Char "mo:core/Char";
import Int "mo:core/Int";
import Map "mo:core/Map";
import Queue "mo:core/Queue";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Types "../types";
import V "Validate";

module {
  public let MAX_PER_HOUR = 20;
  public let MAX_PER_DAY = 100;
  public let MAX_PER_EMAIL_PER_DAY = 3;
  let HOUR_NS : Int = 3_600_000_000_000;
  let DAY_NS : Int = 86_400_000_000_000;

  public type Clean = {
    name : Text;
    email : Text;
    phone : ?Text;
    company : ?Text;
    message : Text;
  };

  func check(ok : Bool, field : Text) : Result.Result<(), Types.SubmitError> = if (ok) #ok(()) else #err(#invalid(field));

  func isPhone(t : Text) : Bool {
    V.lengthIn(t, 5, 40) and not t.contains(#predicate(func c = not (c.isDigit() or c == ' ' or c == '+' or c == '-' or c == '(' or c == ')')));
  };

  public func clean(i : Types.ContactInput) : Result.Result<Clean, Types.SubmitError> {
    let c : Clean = {
      name = V.singleLine(i.name);
      email = V.singleLine(i.email).toLower();
      phone = V.optLine(i.phone);
      company = V.optLine(i.company);
      message = V.multiLine(i.message);
    };
    check(V.lengthIn(c.name, 1, 100), "name")
      .chain(func _ = check(V.isEmail(c.email), "email"))
      .chain(func _ = check(switch (c.phone) { case (?p) { isPhone(p) }; case null { true } }, "phone"))
      .chain(func _ = check(V.optLengthIn(c.company, 100), "company"))
      .chain(func _ = check(V.lengthIn(c.message, 1, 2000), "message"))
      .chain(func _ = check(i.consent, "consent"))
      .mapOk(func _ = c);
  };

  /// Drops timestamps older than a day from the front of the queue.
  public func prune(recent : Queue.Queue<Int>, now : Int) {
    label drop while (true) {
      switch (recent.peekFront()) {
        case (?t) { if (t < now - DAY_NS) ignore recent.popFront() else break drop };
        case null { break drop };
      };
    };
  };

  /// Global limits over accepted submissions (the anonymous caller can't be limited per user).
  public func withinGlobalLimit(recent : Queue.Queue<Int>, now : Int) : Bool {
    var lastHour = 0;
    for (t in recent.values()) { if (t >= now - HOUR_NS) lastHour += 1 };
    recent.size() < MAX_PER_DAY and lastHour < MAX_PER_HOUR;
  };

  /// Messages from this address in the last day (ids grow with time, so scan newest first).
  public func recentFromEmail(messages : Types.Messages, email : Text, now : Int) : Nat {
    var n = 0;
    label scan for ((_, m) in messages.reverseEntries()) {
      if (m.createdAt < now - DAY_NS) break scan;
      if (m.email == email) n += 1;
    };
    n;
  };
};
