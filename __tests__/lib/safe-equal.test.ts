import { describe, expect, it } from "vitest";
import { checkBasicAuth } from "~/lib/basic-auth";
import { safeEqual } from "~/lib/safe-equal";

describe("safeEqual", () => {
  it("同じ文字列は一致する", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("日本語", "日本語")).toBe(true);
  });
  it("違う文字列・長さが違う文字列は一致しない", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("abcd", "abc")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
  });
});

const header = (user: string, pass: string) =>
  `Basic ${btoa(`${user}:${pass}`)}`;

describe("checkBasicAuth", () => {
  it("正しいユーザー名・パスワードは ok", () => {
    expect(checkBasicAuth(header("u", "p"), "u", "p")).toBe("ok");
  });
  it("パスワードに ':' が含まれていても、正しければ ok", () => {
    expect(checkBasicAuth(header("u", "p:q"), "u", "p:q")).toBe("ok");
  });
  it("違う値・ヘッダなし・形式不正は denied", () => {
    expect(checkBasicAuth(header("u", "x"), "u", "p")).toBe("denied");
    expect(checkBasicAuth(header("x", "p"), "u", "p")).toBe("denied");
    expect(checkBasicAuth(null, "u", "p")).toBe("denied");
    expect(checkBasicAuth("Bearer abc", "u", "p")).toBe("denied");
    expect(checkBasicAuth("Basic !!!", "u", "p")).toBe("denied");
    expect(checkBasicAuth(`Basic ${btoa("nocolon")}`, "u", "p")).toBe("denied");
  });
  it("ユーザー名・パスワードが未設定なら、既定値で通さず not-configured（全拒否）", () => {
    expect(
      checkBasicAuth(header("winwin", "winwin2026"), undefined, undefined)
    ).toBe("not-configured");
    expect(checkBasicAuth(header("u", "p"), "u", "")).toBe("not-configured");
    expect(checkBasicAuth(header("u", "p"), "", "p")).toBe("not-configured");
  });
});
