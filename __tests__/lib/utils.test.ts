import { describe, expect, it } from "vitest";
import { truncateChars } from "~/lib/utils";

describe("truncateChars", () => {
  it("leaves short text unchanged", () => {
    expect(truncateChars("着手金（30%）", 15)).toBe("着手金（30%）");
  });

  it("truncates text longer than max and appends an ellipsis", () => {
    const text = "着手金（契約金額の30%、税抜き）";
    expect(text.length).toBeGreaterThan(15);
    expect(truncateChars(text, 15)).toBe(`${text.slice(0, 15)}…`);
  });

  it("treats text exactly at the limit as unchanged", () => {
    const text = "123456789012345";
    expect(text.length).toBe(15);
    expect(truncateChars(text, 15)).toBe(text);
  });
});
