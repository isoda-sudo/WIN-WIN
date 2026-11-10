import { describe, expect, it } from "vitest";
import { invoiceDisplayNo, splitSeqLabel } from "~/lib/invoice-display-no";

describe("splitSeqLabel", () => {
  it("1〜5を①〜⑤にする", () => {
    expect([1, 2, 3, 4, 5].map(splitSeqLabel)).toEqual([
      "①",
      "②",
      "③",
      "④",
      "⑤",
    ]);
  });
  it("範囲外は(n)にする", () => {
    expect(splitSeqLabel(6)).toBe("(6)");
    expect(splitSeqLabel(0)).toBe("(0)");
  });
});

describe("invoiceDisplayNo", () => {
  const base = { projectNo: "WW26-001", invoiceNo: "WW26-001-003" };

  it("分割でない請求書は、案件IDそのままを表示する", () => {
    expect(
      invoiceDisplayNo({ ...base, id: 10, isSplit: false, splitIdsAsc: [11] })
    ).toBe("WW26-001");
    expect(
      invoiceDisplayNo({ ...base, id: 10, isSplit: null, splitIdsAsc: [] })
    ).toBe("WW26-001");
  });

  it("分割は、古い順に①〜⑤を末尾に付ける", () => {
    const splitIdsAsc = [11, 14, 20];
    const at = (id: number) =>
      invoiceDisplayNo({ ...base, id, isSplit: true, splitIdsAsc });
    expect(at(11)).toBe("WW26-001①");
    expect(at(14)).toBe("WW26-001②");
    expect(at(20)).toBe("WW26-001③");
  });

  it("案件IDが無いときは、DBの番号を使う", () => {
    expect(
      invoiceDisplayNo({
        id: 1,
        invoiceNo: "WW-5-001",
        isSplit: false,
        projectNo: null,
        splitIdsAsc: [],
      })
    ).toBe("WW-5-001");
  });

  it("分割の一覧に無いidは、枝番を付けずに案件IDを返す", () => {
    expect(
      invoiceDisplayNo({ ...base, id: 99, isSplit: true, splitIdsAsc: [1] })
    ).toBe("WW26-001");
  });
});
