import { describe, expect, it } from "vitest";
import {
  ESTIMATE_SUBMITTED_STATUS,
  MANUAL_STATUS_OPTIONS,
  manualStatusChangeError,
  manualStatusOptionsFor,
  normalizePaymentStatus,
  normalizeReceiptStatus,
  PAYMENT_STATUS_CLASS,
  paymentFilterLabel,
  paymentRowClass,
  paymentStatusLabel,
  projectStatusLabel,
  RECEIPT_STATUS_CLASS,
  receiptRowClass,
  shouldAutoAdvance,
} from "~/lib/status-styles";

describe("projectStatusLabel", () => {
  it("renames 見積確認中 to 見積書提出済み", () => {
    expect(projectStatusLabel("見積確認中")).toBe("見積書提出済み");
  });

  it("renames 受注 to 契約済み", () => {
    expect(projectStatusLabel("受注")).toBe("契約済み");
  });

  it("leaves other statuses unchanged", () => {
    expect(projectStatusLabel("提案中")).toBe("提案中");
    expect(projectStatusLabel("失注")).toBe("失注");
    expect(projectStatusLabel("全額入金済み")).toBe("全額入金済み");
  });

  it("returns a placeholder for empty status", () => {
    expect(projectStatusLabel(null)).toBe("-");
    expect(projectStatusLabel(undefined)).toBe("-");
  });
});

describe("shouldAutoAdvance", () => {
  it("advances forward only", () => {
    expect(shouldAutoAdvance("未対応", "受注")).toBe(true);
    expect(shouldAutoAdvance("受注", "請求書発行済み")).toBe(true);
    expect(shouldAutoAdvance("請求書発行済み", "全額入金済み")).toBe(true);
    // 分割入金済みは、請求書発行済みより先・全額入金済みより前
    expect(shouldAutoAdvance("請求書発行済み", "分割入金済み")).toBe(true);
    expect(shouldAutoAdvance("分割入金済み", "全額入金済み")).toBe(true);
    expect(shouldAutoAdvance("分割入金済み", "請求書発行済み")).toBe(false);
  });

  it("does not move to the same or an earlier status", () => {
    expect(shouldAutoAdvance("受注", "受注")).toBe(false);
    expect(shouldAutoAdvance("全額入金済み", "請求書発行済み")).toBe(false);
    expect(shouldAutoAdvance("請求書発行済み", "受注")).toBe(false);
  });

  it("never auto-transitions from 失注 or オーダー移行", () => {
    expect(shouldAutoAdvance("失注", "受注")).toBe(false);
    expect(shouldAutoAdvance("オーダー移行", "全額入金済み")).toBe(false);
  });

  it("treats empty current status as before the first step", () => {
    expect(shouldAutoAdvance(null, "未対応")).toBe(true);
    expect(shouldAutoAdvance(undefined, "受注")).toBe(true);
  });

  it("returns false for an unknown target", () => {
    expect(shouldAutoAdvance("未対応", "不明")).toBe(false);
  });

  it("treats an unknown current status as before the first step", () => {
    expect(shouldAutoAdvance("謎", "受注")).toBe(true);
  });
});

describe("manual status restriction", () => {
  it("only offers initial-stage statuses while manual", () => {
    expect(manualStatusOptionsFor("提案中")).toEqual(MANUAL_STATUS_OPTIONS);
    expect(manualStatusOptionsFor(null)).toEqual(MANUAL_STATUS_OPTIONS);
  });

  it("locks the dropdown to the current value after contract", () => {
    expect(manualStatusOptionsFor("受注")).toEqual(["受注"]);
    expect(manualStatusOptionsFor("オーダー移行")).toEqual(["オーダー移行"]);
  });

  it("rejects manual moves to or from later stages", () => {
    expect(manualStatusChangeError("提案中", "見積確認中")).toBeNull();
    expect(manualStatusChangeError("提案中", "失注")).toBeNull();
    expect(manualStatusChangeError("提案中", "受注")).toContain("手動");
    expect(manualStatusChangeError("提案中", "全額入金済み")).not.toBeNull();
    expect(manualStatusChangeError("受注", "提案中")).not.toBeNull();
    expect(manualStatusChangeError("全額入金済み", "未対応")).not.toBeNull();
  });

  it("allows unchanged or empty status", () => {
    expect(manualStatusChangeError("受注", "受注")).toBeNull();
    expect(manualStatusChangeError("受注", undefined)).toBeNull();
  });
});

describe("manualStatusChangeError for projects.create / changeDeliveryMonth", () => {
  it("create (current=null) accepts only manual stage statuses or none", () => {
    expect(manualStatusChangeError(null, undefined)).toBeNull();
    expect(manualStatusChangeError(null, null)).toBeNull();
    for (const s of MANUAL_STATUS_OPTIONS) {
      expect(manualStatusChangeError(null, s)).toBeNull();
    }
    expect(manualStatusChangeError(null, "受注")).not.toBeNull();
    expect(manualStatusChangeError(null, "全額入金済み")).not.toBeNull();
    expect(manualStatusChangeError(null, "オーダー移行")).not.toBeNull();
  });

  it("changeDeliveryMonth keeps the original status but cannot rewrite it", () => {
    // 引き継ぎ（入力なし／同値）は許可
    expect(manualStatusChangeError("受注", undefined)).toBeNull();
    expect(manualStatusChangeError("受注", "受注")).toBeNull();
    // 契約済み以降を初期段階へ戻す、初期段階を契約済みへ進める抜け道は不可
    expect(manualStatusChangeError("受注", "提案中")).not.toBeNull();
    expect(manualStatusChangeError("提案中", "受注")).not.toBeNull();
    expect(manualStatusChangeError("提案中", "失注")).toBeNull();
  });
});

describe("paymentStatusLabel", () => {
  it("shows 未払い and the internal 予定 as 未払い", () => {
    expect(paymentStatusLabel("未払い")).toBe("未払い");
    expect(paymentStatusLabel("予定")).toBe("未払い");
    expect(paymentStatusLabel("支払済み")).toBe("支払済み");
  });
});

describe("empty status", () => {
  it("rejects an empty status over an existing one", () => {
    expect(manualStatusChangeError("提案中", "")).not.toBeNull();
    expect(manualStatusChangeError(null, "")).toBeNull();
  });
});

describe("RECEIPT_STATUS_CLASS matches payment schedule colors", () => {
  it("未入金=yellow like 未払い, 入金済=grey like 支払済み", () => {
    expect(RECEIPT_STATUS_CLASS.未入金).toBe(PAYMENT_STATUS_CLASS.予定);
    expect(RECEIPT_STATUS_CLASS.入金済).toBe(PAYMENT_STATUS_CLASS.支払済み);
    expect(RECEIPT_STATUS_CLASS.未入金).toContain("yellow");
    expect(RECEIPT_STATUS_CLASS.入金済).toContain("gray");
  });
});

describe("paymentRowClass", () => {
  it("支払済みの行だけグレーにする", () => {
    expect(paymentRowClass("支払済み")).toContain("bg-muted");
    expect(paymentRowClass("未払い")).toBe("");
    expect(paymentRowClass(null)).toBe("");
  });
});

describe("normalizePaymentStatus", () => {
  it("支払済み以外（空・旧値・予定）は未払いにする", () => {
    expect(normalizePaymentStatus("支払済み")).toBe("支払済み");
    expect(normalizePaymentStatus("未払い")).toBe("未払い");
    expect(normalizePaymentStatus("予定")).toBe("未払い");
    expect(normalizePaymentStatus("部分払い")).toBe("未払い");
    expect(normalizePaymentStatus(null)).toBe("未払い");
    expect(paymentStatusLabel("部分払い")).toBe("未払い");
  });
});

describe("normalizeReceiptStatus", () => {
  it("入金済以外（空・旧値）は未入金にする", () => {
    expect(normalizeReceiptStatus("入金済")).toBe("入金済");
    expect(normalizeReceiptStatus("未入金")).toBe("未入金");
    expect(normalizeReceiptStatus("一部入金")).toBe("未入金");
    expect(normalizeReceiptStatus("")).toBe("未入金");
    expect(normalizeReceiptStatus(null)).toBe("未入金");
    expect(normalizeReceiptStatus(undefined)).toBe("未入金");
  });
});

describe("receiptRowClass", () => {
  it("入金済の行だけグレーにする（paymentRowClass と同じ）", () => {
    expect(receiptRowClass("入金済")).toContain("bg-muted");
    expect(receiptRowClass("入金済")).toBe(paymentRowClass("支払済み"));
    expect(receiptRowClass("未入金")).toBe("");
    expect(receiptRowClass("一部入金")).toBe("");
    expect(receiptRowClass(null)).toBe("");
  });
});

describe("見積書の提出による自動遷移", () => {
  it("未対応・提案中・未設定からは見積書提出済み（見積確認中）へ進む", () => {
    expect(ESTIMATE_SUBMITTED_STATUS).toBe("見積確認中");
    expect(shouldAutoAdvance("未対応", ESTIMATE_SUBMITTED_STATUS)).toBe(true);
    expect(shouldAutoAdvance("提案中", ESTIMATE_SUBMITTED_STATUS)).toBe(true);
    expect(shouldAutoAdvance(null, ESTIMATE_SUBMITTED_STATUS)).toBe(true);
  });

  it("既に提出済み以降・失注・オーダー移行は変更しない", () => {
    for (const s of [
      "見積確認中",
      "受注",
      "請求書発行済み",
      "全額入金済み",
      "失注",
      "オーダー移行",
    ]) {
      expect(shouldAutoAdvance(s, ESTIMATE_SUBMITTED_STATUS)).toBe(false);
    }
  });
});

describe("paymentFilterLabel", () => {
  it("すべては未払いにせず、そのまま表示する", () => {
    expect(paymentFilterLabel("すべて")).toBe("すべて");
    expect(paymentFilterLabel("未払い")).toBe("未払い");
    expect(paymentFilterLabel("支払済み")).toBe("支払済み");
  });
});
