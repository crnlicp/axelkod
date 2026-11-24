import { suite; test; expect } "mo:test";
import V "../src/lib/Validate";

suite("Validate", func() {
  test("singleLine strips control characters and newlines", func() {
    expect.text(V.singleLine("  Anna\u{0}\n Svensson\u{7}  ")).equal("Anna   Svensson");
    expect.text(V.singleLine("a\u{2028}b")).equal("a b");
  });
  test("multiLine keeps newlines, drops other controls", func() {
    expect.text(V.multiLine("Hej\r\nrad två\u{1B}[31m\t!")).equal("Hej\nrad två[31m!");
  });
  test("isEmail", func() {
    expect.bool(V.isEmail("anna@example.se")).isTrue();
    expect.bool(V.isEmail("anna@example")).isFalse();
    expect.bool(V.isEmail("an na@example.se")).isFalse();
    expect.bool(V.isEmail("a@b@c.se")).isFalse();
    expect.bool(V.isEmail("@example.se")).isFalse();
    expect.bool(V.isEmail("anna@.se")).isFalse();
  });
  test("isHttpsUrl", func() {
    expect.bool(V.isHttpsUrl("https://axelkod.eu/og.png")).isTrue();
    expect.bool(V.isHttpsUrl("http://axelkod.eu")).isFalse();
    expect.bool(V.isHttpsUrl("https://x.se/\"onload=")).isFalse();
    expect.bool(V.isHttpsUrl("javascript:alert(1)")).isFalse();
  });
  test("isToken only allows safe characters", func() {
    expect.bool(V.isToken("abc-DEF_123")).isTrue();
    expect.bool(V.isToken("abc\"><script>")).isFalse();
    expect.bool(V.isToken("")).isFalse();
  });
});
