import { describe, expect, it } from "vitest";
import { buildZenginTransferCsv } from "~/server/csv/zengin-transfer";

// 仕様書「総合振込csv修正内容1103.xlsx」の記載例と同じ並び・内容になること
describe("buildZenginTransferCsv（総合振込csv修正内容1103）", () => {
  const csv = buildZenginTransferCsv(
    [
      {
        vendor: "サンワ",
        amount: 1000,
        vendorRow: {
          bankType: "普通",
          bankNumber: "456789",
          bankHolder: "カ)サンワ",
        } as never,
        bankRef: {
          bankCode: "0009",
          bankKana: "ﾐﾂｲｽﾐﾄﾓ",
          branchCode: "496",
          branchKana: "ｷｮｳﾄ",
        },
      },
    ],
    new Date(2026, 10, 16),
    {
      code: "2618066900",
      name: "ｶ)ｳｲﾝ ｳｲﾝ",
      bankCode: "0009",
      bankKana: "ﾐﾂｲｽﾐﾄﾓ",
      branchCode: "496",
      branchKana: "ｷｮｳﾄ",
      accountType: "1",
      accountNumber: "9843493",
    }
  );

  it("ヘッダー・データ・トレーラー・エンドが記載例どおり", () => {
    expect(csv.split("\r\n")).toEqual([
      "1,21,0,2618066900,ｶ)ｳｲﾝ ｳｲﾝ,1116,0009,ﾐﾂｲｽﾐﾄﾓ,496,ｷｮｳﾄ,1,9843493,",
      "2,0009,ﾐﾂｲｽﾐﾄﾓ,496,ｷｮｳﾄ,0000,1,456789,ｶ)ｻﾝﾜ,1000,0,0000000000,,7,,",
      "8,1,1000,",
      "9,",
      "",
    ]);
  });
});
