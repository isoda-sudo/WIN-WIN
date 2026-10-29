import { describe, expect, it } from "vitest";
import { formatOrderPaymentNo, nextSeqFromExisting } from "~/lib/payment-no";

describe("formatOrderPaymentNo", () => {
  it("pads the sequence to 3 digits", () => {
    expect(formatOrderPaymentNo("WW07-001", 12)).toBe("WW07-001-012");
    expect(formatOrderPaymentNo("WW07-001", 1)).toBe("WW07-001-001");
    expect(formatOrderPaymentNo("WW07-001", 1000)).toBe("WW07-001-1000");
  });
});

describe("nextSeqFromExisting", () => {
  it("returns 1 when nothing exists", () => {
    expect(nextSeqFromExisting([], "WW07-001")).toBe(1);
    expect(nextSeqFromExisting([null, undefined], "WW07-001")).toBe(1);
  });

  it("uses max suffix + 1, not count", () => {
    expect(
      nextSeqFromExisting(["WW07-001-001", "WW07-001-005"], "WW07-001")
    ).toBe(6);
  });

  it("ignores other projects with a similar prefix", () => {
    expect(
      nextSeqFromExisting(["WW07-0010-009", "WW07-001-002"], "WW07-001")
    ).toBe(3);
  });
});
