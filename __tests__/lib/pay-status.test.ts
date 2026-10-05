import { describe, expect, it } from "vitest";
import {
  fallbackPayStatus,
  payStatusToProjectStatus,
  projectStatusToPayStatus,
} from "~/lib/pay-status";

describe("projectStatusToPayStatus", () => {
  it("maps post-invoice statuses to pay statuses", () => {
    expect(projectStatusToPayStatus("請求書発行済み")).toBe("未入金");
    expect(projectStatusToPayStatus("一部入金済み")).toBe("一部入金");
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
    expect(payStatusToProjectStatus("一部入金")).toBe("一部入金済み");
    expect(payStatusToProjectStatus("入金済")).toBe("全額入金済み");
  });
});

describe("fallbackPayStatus", () => {
  it("returns 入金済 when fully received", () => {
    expect(fallbackPayStatus(1000, 1000)).toBe("入金済");
    expect(fallbackPayStatus(1000, 1500)).toBe("入金済");
  });

  it("returns 一部入金 when partially received", () => {
    expect(fallbackPayStatus(1000, 500)).toBe("一部入金");
  });

  it("returns 未入金 when nothing received", () => {
    expect(fallbackPayStatus(1000, 0)).toBe("未入金");
    expect(fallbackPayStatus(0, 0)).toBe("未入金");
  });
});
