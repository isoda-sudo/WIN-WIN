import { describe, expect, it } from "vitest";
import {
  canAccessHistory,
  visibleHistoryTableNames,
} from "~/lib/history-access";
import {
  type AppRoute,
  canReadMaster,
  canSeeClientPersonalInfo,
  canSeeUnmaskedBank,
  canViewHistory,
  canWrite,
  isReadOnlyRole,
  isRole,
  PAGE_ROLES,
  pageAccess,
  ROLE_LABELS,
  ROLES,
  roleLabel,
} from "~/lib/roles";

const PAGE_MATRIX: Record<AppRoute, Record<(typeof ROLES)[number], boolean>> = {
  "/projects": {
    admin: true,
    accounting: true,
    staff: true,
    viewer: true,
    tax_advisor: true,
  },
  "/orders-list": {
    admin: true,
    accounting: true,
    staff: true,
    viewer: true,
    tax_advisor: true,
  },
  "/reporting": {
    admin: true,
    accounting: true,
    staff: true,
    viewer: true,
    tax_advisor: true,
  },
  "/receipts": {
    admin: true,
    accounting: true,
    staff: false,
    viewer: false,
    tax_advisor: true,
  },
  "/payment": {
    admin: true,
    accounting: true,
    staff: false,
    viewer: false,
    tax_advisor: true,
  },
  "/customers": {
    admin: true,
    accounting: true,
    staff: true,
    viewer: true,
    tax_advisor: false,
  },
  "/vendors": {
    admin: true,
    accounting: true,
    staff: true,
    viewer: true,
    tax_advisor: false,
  },
  "/banks": {
    admin: true,
    accounting: true,
    staff: true,
    viewer: true,
    tax_advisor: false,
  },
  "/categories": {
    admin: true,
    accounting: true,
    staff: true,
    viewer: true,
    tax_advisor: false,
  },
  "/payment-categories": {
    admin: true,
    accounting: true,
    staff: false,
    viewer: false,
    tax_advisor: false,
  },
  "/receipt-categories": {
    admin: true,
    accounting: true,
    staff: false,
    viewer: false,
    tax_advisor: false,
  },
  "/company-accounts": {
    admin: true,
    accounting: true,
    staff: false,
    viewer: false,
    tax_advisor: false,
  },
  "/history": {
    admin: true,
    accounting: true,
    staff: true,
    viewer: false,
    tax_advisor: false,
  },
  "/invite": {
    admin: true,
    accounting: false,
    staff: false,
    viewer: false,
    tax_advisor: false,
  },
  "/security": {
    admin: true,
    accounting: true,
    staff: true,
    viewer: true,
    tax_advisor: true,
  },
};

describe("role constants", () => {
  it("includes tax_advisor with the 税理士・社労士 label", () => {
    expect(ROLES).toContain("tax_advisor");
    expect(ROLE_LABELS.tax_advisor).toBe("税理士・社労士");
    expect(roleLabel("tax_advisor")).toBe("税理士・社労士");
    expect(roleLabel("legacy")).toBe("legacy");
    expect(isRole("tax_advisor")).toBe(true);
    expect(isRole("user")).toBe(false);
  });
});

describe("page access matrix (roles x pages)", () => {
  for (const route of Object.keys(PAGE_MATRIX) as AppRoute[]) {
    for (const role of ROLES) {
      it(`${role} -> ${route} = ${PAGE_MATRIX[route][role]}`, () => {
        expect(pageAccess(role, route)).toBe(PAGE_MATRIX[route][role]);
      });
    }
  }

  it("covers every route in PAGE_ROLES", () => {
    expect(Object.keys(PAGE_MATRIX).sort()).toEqual(
      Object.keys(PAGE_ROLES).sort()
    );
  });

  it("subpaths inherit the parent route (reporting/customers, reporting/vendors)", () => {
    expect(pageAccess("tax_advisor", "/reporting/customers")).toBe(true);
    expect(pageAccess("tax_advisor", "/reporting/vendors")).toBe(true);
    expect(pageAccess("tax_advisor", "/payment-categories")).toBe(false);
    expect(pageAccess("tax_advisor", "/unknown")).toBe(false);
  });
});

describe("capability matrix", () => {
  it("tax_advisor is read-only, no master, no history, no unmasked bank, no client PII", () => {
    expect(isReadOnlyRole("tax_advisor")).toBe(true);
    expect(canWrite("tax_advisor")).toBe(false);
    expect(canReadMaster("tax_advisor")).toBe(false);
    expect(canViewHistory("tax_advisor")).toBe(false);
    expect(canAccessHistory("tax_advisor")).toBe(false);
    expect(visibleHistoryTableNames("tax_advisor")).toEqual([]);
    expect(canSeeUnmaskedBank("tax_advisor")).toBe(false);
    expect(canSeeClientPersonalInfo("tax_advisor")).toBe(false);
  });

  it("viewer stays read-only but can still read masters (unchanged)", () => {
    expect(isReadOnlyRole("viewer")).toBe(true);
    expect(canWrite("viewer")).toBe(false);
    expect(canReadMaster("viewer")).toBe(true);
    expect(canSeeUnmaskedBank("viewer")).toBe(false);
    expect(canViewHistory("viewer")).toBe(false);
    expect(canSeeClientPersonalInfo("viewer")).toBe(true);
  });

  it("admin/accounting/staff can write; only admin/accounting see unmasked bank", () => {
    for (const role of ["admin", "accounting", "staff"]) {
      expect(canWrite(role)).toBe(true);
      expect(canReadMaster(role)).toBe(true);
      expect(canViewHistory(role)).toBe(true);
    }
    expect(canSeeUnmaskedBank("admin")).toBe(true);
    expect(canSeeUnmaskedBank("accounting")).toBe(true);
    expect(canSeeUnmaskedBank("staff")).toBe(false);
  });

  it("unknown roles can do nothing", () => {
    expect(canWrite("user")).toBe(false);
    expect(canWrite(undefined)).toBe(false);
    expect(canReadMaster("user")).toBe(false);
    expect(canSeeUnmaskedBank(null)).toBe(false);
  });

  it("history screen access agrees with the page matrix", () => {
    for (const role of ROLES) {
      expect(canAccessHistory(role)).toBe(pageAccess(role, "/history"));
      expect(canViewHistory(role)).toBe(canAccessHistory(role));
    }
  });
});
