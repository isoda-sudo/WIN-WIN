import { describe, expect, it } from "vitest";
import { recalcPaymentDate } from "~/server/projects/carryover";

describe("recalcPaymentDate（期跨ぎコピーの支払期日）", () => {
  it("旧期の支払期日を、新しい引渡月を起算に計算し直す（月末締翌月末払い）", () => {
    expect(
      recalcPaymentDate(
        { payment: "月末締翌月末払い", paymentDate: "2026-10-30" },
        "2027-05"
      )
    ).toBe("2027-06-30");
  });

  it("元が未設定なら未設定のまま", () => {
    expect(
      recalcPaymentDate(
        { payment: "月末締翌月末払い", paymentDate: null },
        "2027-05"
      )
    ).toBeNull();
  });

  it("引渡月が無ければ元の日付のまま", () => {
    expect(
      recalcPaymentDate(
        { payment: "月末締翌月末払い", paymentDate: "2026-10-30" },
        null
      )
    ).toBe("2026-10-30");
  });
});
