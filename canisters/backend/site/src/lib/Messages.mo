// Inbox queries, retention and CSV export.
import Array "mo:core/Array";
import Int "mo:core/Int";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Types "../types";

module {
  /// Average month length in nanoseconds (365.25 / 12 days).
  public let MONTH_NS : Int = 2_629_800_000_000_000;

  public func retentionCutoff(now : Int, months : Nat) : Int = now - months * MONTH_NS;

  public func matches(m : Types.Message, f : Types.MessageFilter) : Bool {
    let statusOk = switch (f.status) { case (?s) { s == m.status }; case null { true } };
    if (not statusOk) return false;
    switch (f.search) {
      case (?raw) {
        let q = raw.trim(#char ' ').toLower();
        if (q == "") return true;
        let hay = [m.name, m.email, m.company ?? "", m.message].values().join("\n").toLower();
        hay.contains(#text q);
      };
      case null { true };
    };
  };

  /// Newest first. `limit` is capped at 100 per page.
  public func page(messages : Types.Messages, f : Types.MessageFilter, p : Types.PageRequest) : Types.MessagePage {
    let limit = Nat.min(p.limit, 100);
    let items = List.empty<Types.Message>();
    var total = 0;
    var unread = 0;
    for ((_, m) in messages.reverseEntries()) {
      if (m.status == #new) unread += 1;
      if (matches(m, f)) {
        if (total >= p.offset and items.size() < limit) items.add(m);
        total += 1;
      };
    };
    { items = items.toArray(); total; unread };
  };

  /// Deletes messages created before `cutoff`; returns how many were removed.
  public func purgeBefore(messages : Types.Messages, cutoff : Int) : Nat {
    let old = List.empty<Nat>();
    // Ids grow with time, so stop at the first message that is new enough.
    label scan for ((id, m) in messages.entries()) {
      if (m.createdAt >= cutoff) break scan;
      old.add(id);
    };
    for (id in old.values()) messages.remove(id);
    old.size();
  };

  // ── CSV ──

  func pad2(n : Int) : Text = if (n < 10) "0" # n.toText() else n.toText();

  /// ISO 8601 UTC timestamp from nanoseconds (civil-from-days, H. Hinnant).
  public func isoUtc(ns : Int) : Text {
    let secs = ns / 1_000_000_000;
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let z = days + 719_468;
    let era = (if (z >= 0) z else z - 146_096) / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if (mp < 10) mp + 3 else mp - 9;
    let y = yoe + era * 400 + (if (m <= 2) 1 else 0);
    y.toText() # "-" # pad2(m) # "-" # pad2(d) # "T" # pad2(rem / 3600) # ":" # pad2((rem % 3600) / 60) # ":" # pad2(rem % 60) # "Z";
  };

  /// Quotes a cell and neutralises spreadsheet formulas (CSV injection).
  public func csvCell(t : Text) : Text {
    let risky = t.startsWith(#char '=') or t.startsWith(#char '+') or t.startsWith(#char '-') or t.startsWith(#char '@') or t.startsWith(#char '\t') or t.startsWith(#char '\r');
    let safe = if (risky) "'" # t else t;
    "\"" # safe.replace(#char '\"', "\"\"") # "\"";
  };

  func areaText(a : Types.Area) : Text = switch (a) {
    case (#parts) { "parts" };
    case (#software) { "software" };
    case (#security) { "security" };
    case (#other) { "other" };
  };

  func statusText(s : Types.Status) : Text = switch (s) {
    case (#new) { "new" };
    case (#read) { "read" };
    case (#handled) { "handled" };
  };

  func langText(l : Types.Lang) : Text = switch (l) { case (#sv) { "sv" }; case (#en) { "en" } };

  public func toCsv(messages : Types.Messages) : Text {
    let rows = List.empty<Text>();
    rows.add("id,createdAt,name,email,phone,company,area,lang,status,message,adminNote");
    for (m in messages.values()) {
      let cells = [
        m.id.toText(), isoUtc(m.createdAt), m.name, m.email, m.phone ?? "", m.company ?? "",
        areaText(m.area), langText(m.lang), statusText(m.status), m.message, m.adminNote ?? "",
      ];
      rows.add(cells.map(csvCell).values().join(","));
    };
    rows.values().join("\r\n") # "\r\n";
  };
};
