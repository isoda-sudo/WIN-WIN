import { describe, expect, it } from "vitest";
import {
  archiveCutoffMonth,
  isArchivable,
  safeEntryName,
  uniquePath,
} from "~/lib/archive";

describe("archiveCutoffMonth", () => {
  it("日本時間の年月から5年前を返す", () => {
    expect(archiveCutoffMonth(new Date("2026-10-15T14:00:00Z"))).toBe(
      "2021-10"
    );
  });
  it("UTCでは前日でも、日本時間で翌月なら翌月として数える", () => {
    expect(archiveCutoffMonth(new Date("2026-10-31T15:30:00Z"))).toBe(
      "2021-11"
    );
  });
  it("年数を変えられる", () => {
    expect(archiveCutoffMonth(new Date("2026-01-10T00:00:00Z"), 7)).toBe(
      "2019-01"
    );
  });
});

describe("isArchivable", () => {
  it("引渡月がカットオフ以前なら対象（当月を含む）", () => {
    expect(isArchivable("2021-10", "2021-10")).toBe(true);
    expect(isArchivable("2020-03", "2021-10")).toBe(true);
  });
  it("カットオフより後は対象外", () => {
    expect(isArchivable("2021-11", "2021-10")).toBe(false);
  });
  it("引渡月が無い・形式が違う案件は対象にしない", () => {
    expect(isArchivable(null, "2021-10")).toBe(false);
    expect(isArchivable("", "2021-10")).toBe(false);
    expect(isArchivable("2021/10", "2021-10")).toBe(false);
  });
});

describe("safeEntryName / uniquePath", () => {
  it("パスに使えない文字を置き換える", () => {
    expect(safeEntryName("a/b:c*.pdf", "x.pdf")).toBe("a_b_c_.pdf");
  });
  it("空なら代わりの名前にする", () => {
    expect(safeEntryName("  ", "x.pdf")).toBe("x.pdf");
    expect(safeEntryName(null, "x.pdf")).toBe("x.pdf");
  });
  it("同じパスには連番を付ける", () => {
    const used = new Set<string>();
    expect(uniquePath("請求書/a.pdf", used)).toBe("請求書/a.pdf");
    expect(uniquePath("請求書/a.pdf", used)).toBe("請求書/a_2.pdf");
    expect(uniquePath("請求書/a.pdf", used)).toBe("請求書/a_3.pdf");
  });
});
