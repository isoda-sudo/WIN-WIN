import { describe, expect, it } from "vitest";
import {
  escapeCsvValue,
  excelText,
  needsExcelText,
} from "../../src/server/csv/csv-escape";

describe("csv-escape", () => {
  it("先頭が0の数字列と12桁以上の数字列だけを Excel 用に文字列化する", () => {
    expect(needsExcelText("0123456")).toBe(true);
    expect(needsExcelText("0000")).toBe(true);
    expect(needsExcelText("123456789012")).toBe(true);
    expect(needsExcelText("1234567")).toBe(false);
    expect(needsExcelText("12345678901")).toBe(false);
    expect(needsExcelText("WW07-001")).toBe(false);
    expect(needsExcelText("")).toBe(false);
    // 1桁の 0 は Excel でも落ちないのでそのまま（金額 0 などを ="0" にしない）
    expect(needsExcelText("0")).toBe(false);
    expect(escapeCsvValue(0)).toBe("0");
    expect(excelText("0123456")).toBe('="0123456"');
    expect(excelText("2345678")).toBe("2345678");
  });

  it("CSV の1セルを整形する（空・クォート・桁落ち対策）", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
    expect(escapeCsvValue(2_129_500_400)).toBe("2129500400");
    expect(escapeCsvValue("0123456")).toBe('="0123456"');
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
  });
});
