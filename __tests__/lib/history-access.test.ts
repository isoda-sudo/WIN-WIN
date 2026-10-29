import { describe, expect, it } from "vitest";
import {
  canAccessHistory,
  canViewHistoryTable,
  visibleHistoryTableNames,
} from "~/lib/history-access";

describe("canAccessHistory", () => {
  it("allows admin, accounting and staff but not viewer or unknown roles", () => {
    expect(canAccessHistory("admin")).toBe(true);
    expect(canAccessHistory("accounting")).toBe(true);
    expect(canAccessHistory("staff")).toBe(true);
    expect(canAccessHistory("viewer")).toBe(false);
    expect(canAccessHistory("")).toBe(false);
  });
});

describe("visibleHistoryTableNames", () => {
  it("admin sees every table", () => {
    expect([...visibleHistoryTableNames("admin")].sort()).toEqual(
      [
        "banks",
        "categories",
        "company_accounts",
        "customers",
        "invitations",
        "invoices",
        "misc_payments",
        "misc_receipts",
        "orders",
        "payment_categories",
        "projects",
        "receipt_categories",
        "recurring_payments",
        "recurring_receipts",
        "transfer_fee_rules",
        "users",
        "vendors",
      ].sort()
    );
  });

  it("accounting sees finance tables but not admin-only ones", () => {
    const names = visibleHistoryTableNames("accounting");
    expect(names).toEqual(
      expect.arrayContaining(["misc_payments", "projects"])
    );
    expect(names).toContain("recurring_payments");
    expect(names).toContain("misc_receipts");
    expect(names).toContain("recurring_receipts");
    for (const hidden of [
      "categories",
      "payment_categories",
      "receipt_categories",
      "company_accounts",
      "transfer_fee_rules",
      "users",
      "invitations",
    ]) {
      expect(names).not.toContain(hidden);
    }
  });

  it("staff sees only the common tables", () => {
    expect([...visibleHistoryTableNames("staff")].sort()).toEqual(
      ["customers", "invoices", "orders", "projects", "vendors"].sort()
    );
  });

  it("viewer and unknown roles see nothing", () => {
    expect(visibleHistoryTableNames("viewer")).toEqual([]);
    expect(visibleHistoryTableNames("guest")).toEqual([]);
  });
});

describe("canViewHistoryTable", () => {
  it("restricts categories to admin", () => {
    expect(canViewHistoryTable("admin", "categories")).toBe(true);
    expect(canViewHistoryTable("accounting", "categories")).toBe(false);
    expect(canViewHistoryTable("staff", "categories")).toBe(false);
  });

  it("denies viewer for every table, even common ones", () => {
    expect(canViewHistoryTable("viewer", "projects")).toBe(false);
  });

  it("denies the removed receipts table", () => {
    expect(canViewHistoryTable("admin", "receipts")).toBe(false);
  });

  it("denies unknown tables", () => {
    expect(canViewHistoryTable("admin", "nonexistent")).toBe(false);
  });

  it("is consistent with visibleHistoryTableNames", () => {
    for (const role of ["admin", "accounting", "staff", "viewer"]) {
      for (const table of visibleHistoryTableNames(role)) {
        expect(canViewHistoryTable(role, table)).toBe(true);
      }
    }
  });
});
