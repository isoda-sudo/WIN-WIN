import { describe, expect, it } from "vitest";
import {
  buildOrderAckContent,
  deliveryMonthLabel,
  orderPeriodLabel,
} from "~/server/pdf/order-ack-sheet";

const emptyOrder = { periodStart: null, periodEnd: null };

describe("orderPeriodLabel", () => {
  it("Given 発注明細の着手・完成が空 When 案件に工期がある Then 案件の工期を使う", () => {
    expect(
      orderPeriodLabel(emptyOrder, {
        startDate: "2026-11-01",
        endDate: "2026-12-20",
      })
    ).toBe("着手予定　2026-11-01　～　完成予定　2026-12-20");
  });

  it("Given 発注明細に着手・完成がある When 案件にも工期がある Then 発注明細を優先する", () => {
    expect(
      orderPeriodLabel(
        { periodStart: "2026-10-01", periodEnd: "2026-10-31" },
        { startDate: "2026-11-01", endDate: "2026-12-20" }
      )
    ).toBe("着手予定　2026-10-01　～　完成予定　2026-10-31");
  });

  it("Given どちらも空 Then ハイフンにする", () => {
    expect(orderPeriodLabel(emptyOrder, null)).toBe("-");
    expect(
      orderPeriodLabel(emptyOrder, { startDate: null, endDate: null })
    ).toBe("-");
  });

  it("Given 片方だけある Then 空の側はハイフンにする", () => {
    expect(
      orderPeriodLabel(emptyOrder, { startDate: "2026-11-01", endDate: null })
    ).toBe("着手予定　2026-11-01　～　完成予定　-");
  });
});

describe("deliveryMonthLabel", () => {
  it("YYYY-MM を「YYYY年M月」にする", () => {
    expect(deliveryMonthLabel("2026-11")).toBe("2026年11月");
    expect(deliveryMonthLabel("2026-03")).toBe("2026年3月");
  });
  it("空・不正な値はハイフンにする", () => {
    expect(deliveryMonthLabel(null)).toBe("-");
    expect(deliveryMonthLabel("")).toBe("-");
    expect(deliveryMonthLabel("来月")).toBe("-");
  });
});

describe("buildOrderAckContent", () => {
  it("引渡し時期は、発注明細が空なら案件の引渡月を使う", () => {
    const order = {
      assignee: null,
      category: null,
      decided: 100,
      details: null,
      estimate: null,
      handover: null,
      orderNo: "A-1",
      payment: null,
      periodEnd: null,
      periodStart: null,
      planned: null,
      site: null,
      vendor: "V",
    } as never;
    const project = {
      deliveryMonth: "2026-12",
      endDate: "2026-12-20",
      name: "P",
      startDate: "2026-11-01",
    } as never;
    const { fields } = buildOrderAckContent(order, project, null);
    const map = new Map(fields.map(([k, v]) => [k.replace(/\s/g, ""), v]));
    expect(map.get("工事期間")).toBe(
      "着手予定　2026-11-01　～　完成予定　2026-12-20"
    );
    expect(
      [...map.entries()].find(([k]) => k.startsWith("検査及び引渡し時期"))?.[1]
    ).toBe("2026年12月");
  });

  it("工事場所は、案件住所を優先し、無ければ発注明細の工事場所を使う", () => {
    const base = {
      decided: 100,
      orderNo: "A-1",
      site: "明細の現場",
      vendor: "V",
    };
    const fieldOf = (order: object, project: object | null) =>
      new Map(
        buildOrderAckContent(order as never, project as never, null).fields
      ).get("工事場所");
    expect(fieldOf(base, { name: "P", siteAddress: "熊本市中央区1-1" })).toBe(
      "熊本市中央区1-1"
    );
    expect(fieldOf(base, { name: "P", siteAddress: null })).toBe("明細の現場");
    expect(fieldOf({ ...base, site: null }, { name: "P" })).toBe("-");
  });
});
