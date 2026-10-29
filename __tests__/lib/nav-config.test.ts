import { describe, expect, it } from "vitest";
import { visibleNavHrefs } from "~/components/shell/nav-config";

describe("sidebar visibility", () => {
  it("tax_advisor sees the reporting group (2 analysis links), 受注一覧, 売上管理表, 支払い予定表 only", () => {
    expect(visibleNavHrefs("tax_advisor")).toEqual([
      "/reporting/customers",
      "/reporting/vendors",
      "/projects",
      "/receipts",
      "/payment",
    ]);
  });

  it("viewer keeps masters (customers/vendors/categories) but no history or invite", () => {
    const hrefs = visibleNavHrefs("viewer");
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/reporting/customers",
        "/reporting/vendors",
        "/projects",
        "/customers",
        "/vendors",
        "/categories",
      ])
    );
    expect(hrefs).not.toContain("/history");
    expect(hrefs).not.toContain("/invite");
    expect(hrefs).not.toContain("/receipts");
  });

  it("admin sees everything including 収入区分 and アカウント発行", () => {
    const hrefs = visibleNavHrefs("admin");
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/receipt-categories",
        "/payment-categories",
        "/company-accounts",
        "/history",
        "/invite",
      ])
    );
  });

  it("accounting sees 収入区分 but not アカウント発行", () => {
    const hrefs = visibleNavHrefs("accounting");
    expect(hrefs).toContain("/receipt-categories");
    expect(hrefs).not.toContain("/invite");
  });

  it("staff sees history but not 売上管理表/支払い予定表", () => {
    const hrefs = visibleNavHrefs("staff");
    expect(hrefs).toContain("/history");
    expect(hrefs).not.toContain("/receipts");
    expect(hrefs).not.toContain("/payment");
  });
});
