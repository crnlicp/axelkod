// Input cleaning and validation, shared by settings setters and the contact form.
import Char "mo:core/Char";
import Iter "mo:core/Iter";
import Text "mo:core/Text";

module {
  /// Removes control characters (newlines too) and trims surrounding whitespace.
  public func singleLine(t : Text) : Text {
    t.map(func c = if (isControl(c)) ' ' else c).trim(#predicate(func c = c.isWhitespace()));
  };

  /// Like singleLine but keeps line breaks (normalised to \n).
  public func multiLine(t : Text) : Text {
    t.replace(#text "\r\n", "\n")
      .flatMap(func c = if (c == '\n') "\n" else if (isControl(c)) "" else c.toText())
      .trim(#predicate(func c = c.isWhitespace()));
  };

  func isControl(c : Char) : Bool {
    let n = c.toNat32();
    n < 0x20 or (n >= 0x7F and n < 0xA0) or n == 0x2028 or n == 0x2029;
  };

  public func lengthIn(t : Text, min : Nat, max : Nat) : Bool {
    let n = t.size();
    n >= min and n <= max;
  };

  /// Pragmatic check: one '@', non-empty local part, dotted domain, no spaces.
  public func isEmail(t : Text) : Bool {
    if (not lengthIn(t, 6, 254) or t.contains(#predicate(func c = c.isWhitespace()))) return false;
    let parts = t.split(#char '@').toArray();
    if (parts.size() != 2) return false;
    let domain = parts[1];
    parts[0].size() > 0 and domain.contains(#char '.') and not domain.startsWith(#char '.') and not domain.endsWith(#char '.');
  };

  public func isHttpsUrl(t : Text) : Bool {
    lengthIn(t, 9, 500) and t.startsWith(#text "https://") and not t.contains(#predicate(func c = c.isWhitespace() or c == '\"' or c == '<' or c == '>'));
  };

  /// Site-verification tokens end up in HTML attributes: letters, digits, '-' and '_' only.
  public func isToken(t : Text) : Bool {
    lengthIn(t, 1, 100) and not t.contains(#predicate(func c = not (c.isAlphabetic() or c.isDigit() or c == '-' or c == '_')));
  };

  /// Cleans an optional single-line field; empty becomes null.
  public func optLine(t : ?Text) : ?Text {
    switch (t) {
      case (?v) { let s = singleLine(v); if (s.isEmpty()) null else ?s };
      case null { null };
    };
  };

  public func optLengthIn(t : ?Text, max : Nat) : Bool {
    switch (t) { case (?v) { v.size() <= max }; case null { true } };
  };
};
