import { describe, expect, it } from "vitest";
import { redactClientPersonalInfo } from "~/server/projects/redact";

const row = {
  id: 1,
  client: "山田建設",
  clientCompany: "山田建設株式会社",
  clientPhone: "096-000-0000",
  clientEmail: "yamada@example.com",
  clientAddress: "熊本県熊本市",
};

describe("redactClientPersonalInfo", () => {
  it("nulls phone, email and address for tax_advisor and keeps the rest", () => {
    const out = redactClientPersonalInfo("tax_advisor", row);
    expect(out.clientPhone).toBeNull();
    expect(out.clientEmail).toBeNull();
    expect(out.clientAddress).toBeNull();
    expect(out.client).toBe("山田建設");
    expect(out.clientCompany).toBe("山田建設株式会社");
    expect(out.id).toBe(1);
  });

  it("does not mutate the input row", () => {
    redactClientPersonalInfo("tax_advisor", row);
    expect(row.clientPhone).toBe("096-000-0000");
  });

  it("returns the row untouched for other roles", () => {
    for (const role of ["admin", "accounting", "staff", "viewer"]) {
      expect(redactClientPersonalInfo(role, row)).toEqual(row);
    }
  });
});
