import { describe, expect, it } from "vitest";
import { isHttpUrl, normalizeWebsite } from "~/lib/safe-url";

describe("isHttpUrl", () => {
  it("http / https のURLだけ true", () => {
    expect(isHttpUrl("https://example.com")).toBe(true);
    expect(isHttpUrl("http://example.com/a?b=1")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,<script>")).toBe(false);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("www.example.com")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});

describe("normalizeWebsite", () => {
  it("空は空のまま", () => {
    expect(normalizeWebsite("")).toBe("");
    expect(normalizeWebsite("   ")).toBe("");
  });
  it("http(s) のURLはそのまま", () => {
    expect(normalizeWebsite("https://example.com")).toBe("https://example.com");
    expect(normalizeWebsite(" http://example.com ")).toBe("http://example.com");
  });
  it("スキームが無ければ https:// を付ける", () => {
    expect(normalizeWebsite("www.example.com")).toBe("https://www.example.com");
    expect(normalizeWebsite("example.co.jp/about")).toBe(
      "https://example.co.jp/about"
    );
  });
  it("javascript: などの危険なスキームは拒否する", () => {
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsite("JavaScript:alert(1)")).toBeNull();
    expect(
      normalizeWebsite("data:text/html,<script>alert(1)</script>")
    ).toBeNull();
    expect(normalizeWebsite("file:///etc/passwd")).toBeNull();
    expect(normalizeWebsite("ftp://example.com")).toBeNull();
  });
});
