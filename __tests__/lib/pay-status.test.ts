import { describe, expect, it } from "vitest";
import {
  PAY_STATUS_OPTIONS,
  payStatusToProjectStatus,
  projectStatusToPayStatus,
  resolvePayStatus,
} from "~/lib/pay-status";

describe("PAY_STATUS_OPTIONS", () => {
  it("has exactly 未入金, 分割入金済 and 入金済", () => {
    expect([...PAY_STATUS_OPTIONS]).toEqual(["未入金", "分割入金済", "入金済"]);
  });
});

describe("projectStatusToPayStatus", () => {
  it("maps post-invoice statuses to pay statuses", () => {
    expect(projectStatusToPayStatus("請求書発行済み")).toBe("未入金");
    expect(projectStatusToPayStatus("分割入金済み")).toBe("分割入金済");
    expect(projectStatusToPayStatus("全額入金済み")).toBe("入金済");
  });

  it("returns null for pre-invoice or unknown statuses", () => {
    expect(projectStatusToPayStatus("契約済み")).toBeNull();
    expect(projectStatusToPayStatus("見積確認中")).toBeNull();
    expect(projectStatusToPayStatus(null)).toBeNull();
  });
});

describe("payStatusToProjectStatus", () => {
  it("maps pay statuses back to project statuses", () => {
    expect(payStatusToProjectStatus("未入金")).toBe("請求書発行済み");
    expect(payStatusToProjectStatus("分割入金済")).toBe("分割入金済み");
    expect(payStatusToProjectStatus("入金済")).toBe("全額入金済み");
  });
});

describe("resolvePayStatus", () => {
  it("prefers the project status", () => {
    expect(resolvePayStatus("全額入金済み", false)).toBe("入金済");
    expect(resolvePayStatus("請求書発行済み", false)).toBe("未入金");
  });

  it("treats an issued invoice on an older status as 未入金", () => {
    expect(resolvePayStatus("受注", true)).toBe("未入金");
    expect(resolvePayStatus(null, true)).toBe("未入金");
  });

  it("returns null before the invoice stage", () => {
    expect(resolvePayStatus("受注", false)).toBeNull();
    expect(resolvePayStatus("提案中", false)).toBeNull();
  });
});
