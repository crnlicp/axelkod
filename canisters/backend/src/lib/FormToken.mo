// Contact-form token: "<issuedAtNs>.<clientNonce>.<hmac>". Issued by a query (no
// state), checked on submit: signature, minimum age (bots submit instantly),
// maximum age, and single use (tracked by the caller of `verify`).
import Char "mo:core/Char";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Hmac "Hmac";

module {
  public let MIN_AGE_NS : Int = 3_000_000_000; // 3 s
  public let MAX_AGE_NS : Int = 7_200_000_000_000; // 2 h

  public type TokenError = { #invalid; #tooFast; #expired };

  /// Client nonce: 16–64 URL-safe characters, so concurrent visitors get distinct tokens.
  public func isNonce(n : Text) : Bool {
    let size = n.size();
    size >= 16 and size <= 64 and not n.contains(#predicate(func c = not (c.isAlphabetic() or c.isDigit() or c == '-' or c == '_')));
  };

  func sign(secret : Blob, payload : Text) : Text = Hmac.hex(Hmac.hmacSha256(secret, payload.encodeUtf8()));

  public func issue(secret : Blob, now : Int, nonce : Text) : Text {
    let payload = now.toText() # "." # nonce;
    payload # "." # sign(secret, payload);
  };

  /// On success returns the issue time (the token itself is the single-use key).
  public func verify(secret : Blob, token : Text, now : Int) : Result.Result<Int, TokenError> {
    let parts = token.split(#char '.').toArray();
    if (parts.size() != 3 or not isNonce(parts[1])) return #err(#invalid);
    let issuedAt = parts[0].toInt() ?? (return #err(#invalid));
    if (sign(secret, parts[0] # "." # parts[1]) != parts[2]) return #err(#invalid);
    if (now - issuedAt < MIN_AGE_NS) return #err(#tooFast);
    if (now - issuedAt > MAX_AGE_NS) return #err(#expired);
    #ok(issuedAt);
  };
};
