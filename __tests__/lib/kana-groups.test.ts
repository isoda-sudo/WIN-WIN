import { describe, expect, it } from "vitest";
import { kanaRowOf } from "~/lib/kana-groups";

describe("kanaRowOf", () => {
  it("読みの1文字目から行（あ・か・さ…）を返す", () => {
    expect(kanaRowOf("きょうと")).toBe("か");
    expect(kanaRowOf("おおさか")).toBe("あ");
    expect(kanaRowOf("ぎふ")).toBe("か");
    expect(kanaRowOf("ぱ")).toBe("は");
    expect(kanaRowOf("ゃ")).toBe("や");
  });
  it("かな以外は null", () => {
    expect(kanaRowOf("ABC")).toBeNull();
    expect(kanaRowOf("")).toBeNull();
  });
});
