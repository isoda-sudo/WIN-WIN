import { describe, expect, it } from "vitest";
import { projectStatusLabel } from "~/lib/status-styles";

describe("projectStatusLabel", () => {
  it("renames 見積確認中 to 見積もり提出済み", () => {
    expect(projectStatusLabel("見積確認中")).toBe("見積もり提出済み");
  });

  it("renames 受注 to 契約済み", () => {
    expect(projectStatusLabel("受注")).toBe("契約済み");
  });

  it("leaves other statuses unchanged", () => {
    expect(projectStatusLabel("提案中")).toBe("提案中");
    expect(projectStatusLabel("失注")).toBe("失注");
    expect(projectStatusLabel("一部入金済み")).toBe("一部入金済み");
  });

  it("returns a placeholder for empty status", () => {
    expect(projectStatusLabel(null)).toBe("-");
    expect(projectStatusLabel(undefined)).toBe("-");
  });
});
