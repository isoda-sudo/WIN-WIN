import { describe, expect, it } from "vitest";
import {
  EMPTY_RECURRING_FORM,
  toRecurringInput,
  validateRecurringForm,
} from "../../src/app/(app)/payment/_components/recurring-form";

const base = {
  ...EMPTY_RECURRING_FORM,
  amount: "50000",
  dueDay: "17",
  name: "駐車場",
  startMonth: "2026-01",
};

describe("recurring-form", () => {
  it("頻度は既定で未選択（毎月に勝手にならない）", () => {
    expect(EMPTY_RECURRING_FORM.frequency).toBe("");
    expect(validateRecurringForm(base)).toContain("頻度");
  });

  it("毎月払いは支払月が不要", () => {
    const f = { ...base, frequency: "monthly" as const };
    expect(validateRecurringForm(f)).toBeNull();
    expect(toRecurringInput(f).monthOfYear).toBeNull();
  });

  it("年払いは支払月が必須で、入力に反映される", () => {
    const f = { ...base, frequency: "yearly" as const };
    expect(validateRecurringForm(f)).toContain("支払月");
    const ok = { ...f, monthOfYear: "6" };
    expect(validateRecurringForm(ok)).toBeNull();
    expect(toRecurringInput(ok)).toMatchObject({
      frequency: "yearly",
      monthOfYear: 6,
    });
  });
});
