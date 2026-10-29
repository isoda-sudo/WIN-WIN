import { describe, expect, it } from "vitest";
import {
  escapeCsvValue,
  excelText,
  needsExcelText,
} from "../../src/server/csv/csv-escape";
import { buildZenginTransferCsv } from "../../src/server/csv/zengin-transfer";

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

const vendor = {
  bankBranch: "烏丸支店",
  bankHolder: "ｶﾝｻｲ",
  bankName: "京都銀行",
  bankNumber: "0123456",
  bankType: "普通",
} as unknown as Parameters<
  typeof buildZenginTransferCsv
>[0][number]["vendorRow"];

const items = [{ amount: 130_000, vendor: "関西環境施工", vendorRow: vendor }];
const date = new Date(2026, 0, 9);

describe("zengin excelSafe", () => {
  it("既定（銀行取込用）は口座番号などをそのまま出す", () => {
    const csv = buildZenginTransferCsv(items, date);
    expect(csv).toContain(",0123456,");
    expect(csv).not.toContain('="');
  });

  it("Excel用は先頭が0の口座番号・日付・コードを ='...' 形式にし、金額は変えない", () => {
    const csv = buildZenginTransferCsv(items, date, {}, { excelSafe: true });
    expect(csv).toContain('="0123456"');
    expect(csv).toContain('="0109"');
    expect(csv).toContain('="0000"');
    expect(csv).not.toContain('="0",');
    expect(csv).toContain(",130000,");
    // 銀行取込用との違いは該当セルの表記だけ（行数は同じ）
    expect(csv.split("\r\n").length).toBe(
      buildZenginTransferCsv(items, date).split("\r\n").length
    );
  });
});
