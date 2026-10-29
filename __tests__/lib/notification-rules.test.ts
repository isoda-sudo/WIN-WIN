import { describe, expect, it } from "vitest";
import {
  contractNotSignedAlerts,
  dayOfNextMonth,
  filterNotificationsForRole,
  invoiceLeakAlerts,
  inWorkPeriod,
  irregularPaymentDateAlerts,
  lockLeakAlerts,
  notificationKey,
  orderNotIssuedAlerts,
  type RuleOrder,
  type RuleProject,
} from "~/lib/notification-rules";

const project = (over: Partial<RuleProject> = {}): RuleProject => ({
  deliveryMonth: "2026-09",
  endDate: "2026-09-30",
  hasContract: false,
  id: 1,
  lockedAt: null,
  name: "A工事",
  startDate: "2026-09-01",
  status: "受注",
  ...over,
});

const order = (over: Partial<RuleOrder> = {}): RuleOrder => ({
  assignee: "山田",
  decided: 1000,
  id: 10,
  paid: false,
  payment: "月末締翌月末払い",
  paymentDate: "2026-10-30",
  periodEnd: "2026-09-30",
  periodStart: "2026-09-01",
  projectId: 1,
  status: "見積確認中",
  vendor: "B建設",
  ...over,
});

describe("日付ヘルパー", () => {
  it("工期に入っているか（終了なしは継続中）", () => {
    expect(inWorkPeriod("2026-09-01", "2026-09-30", "2026-09-15")).toBe(true);
    expect(inWorkPeriod("2026-09-01", "2026-09-30", "2026-10-01")).toBe(false);
    expect(inWorkPeriod("2026-09-01", null, "2027-01-01")).toBe(true);
    expect(inWorkPeriod("2026-10-01", null, "2026-09-15")).toBe(false);
    expect(inWorkPeriod(null, null, "2026-09-15")).toBe(false);
  });
  it("引渡月の翌月の指定日（年またぎ）", () => {
    expect(dayOfNextMonth("2026-09", 1)).toBe("2026-10-01");
    expect(dayOfNextMonth("2026-12", 20)).toBe("2027-01-20");
    expect(dayOfNextMonth(null, 1)).toBeNull();
  });
});

describe("着工前アラート", () => {
  it("工期に入って契約未締結なら通知（工期が終わっても出し続ける）、締結済み・着工前・失注は通知しない", () => {
    expect(contractNotSignedAlerts([project()], "2026-09-10")).toHaveLength(1);
    expect(
      contractNotSignedAlerts([project({ hasContract: true })], "2026-09-10")
    ).toHaveLength(0);
    // 工期終了後（10月）も、契約書が無い間は通知する
    expect(contractNotSignedAlerts([project()], "2026-10-05")).toHaveLength(1);
    // 工期の開始前は通知しない
    expect(contractNotSignedAlerts([project()], "2026-08-31")).toHaveLength(0);
    expect(
      contractNotSignedAlerts([project({ status: "失注" })], "2026-09-10")
    ).toHaveLength(0);
  });
});

describe("未発注アラート", () => {
  const byId = new Map([[1, project()]]);
  it("工期中で注文書未発行／請書未受領の発注を担当者ごとにまとめる", () => {
    const items = orderNotIssuedAlerts(
      [order(), order({ id: 11 })],
      byId,
      new Set([11]),
      "2026-09-10"
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.message).toContain("注文書が未発行（2件）");
    expect(items[0]?.message).toContain("請書が未受領（1件）");
  });
  it("担当者ごとに別の通知になり、キーも担当者ごとに違う", () => {
    const items = orderNotIssuedAlerts(
      [order({ assignee: "山田" }), order({ assignee: "佐藤", id: 11 })],
      byId,
      new Set(),
      "2026-09-10"
    );
    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => notificationKey(i))).size).toBe(2);
  });
  it("発注済みで請書もあれば通知しない／工期外は通知しない", () => {
    expect(
      orderNotIssuedAlerts(
        [order({ status: "発注完了" })],
        byId,
        new Set([10]),
        "2026-09-10"
      )
    ).toHaveLength(0);
    expect(
      orderNotIssuedAlerts([order()], byId, new Set(), "2026-10-05")
    ).toHaveLength(0);
  });
});

describe("契約未締結（日付の形式）", () => {
  it("工期が「2025/7/5」のような / 区切り・桁なしでも判定できる", () => {
    const items = contractNotSignedAlerts(
      [project({ startDate: "2026/9/1", endDate: "2026/9/30" })],
      "2026-09-10"
    );
    expect(items).toHaveLength(1);
  });
});

describe("請求漏れアラート", () => {
  it("引渡月の翌月1日から、受注のまま（請求書未送信）の案件を通知する", () => {
    expect(invoiceLeakAlerts([project()], "2026-09-30")).toHaveLength(0);
    expect(invoiceLeakAlerts([project()], "2026-10-01")).toHaveLength(1);
    expect(
      invoiceLeakAlerts([project({ status: "請求書発行済み" })], "2026-10-05")
    ).toHaveLength(0);
  });
});

describe("イレギュラー変更通知", () => {
  const byId = new Map([[1, project()]]);
  it("通常の期日（引渡月末+翌月末）と違えば通知する", () => {
    expect(
      irregularPaymentDateAlerts([order({ paymentDate: "2026-10-30" })], byId)
    ).toHaveLength(0);
    const items = irregularPaymentDateAlerts(
      [order({ paymentDate: "2026-11-10" })],
      byId
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.message).toContain("2026-11-10");
  });
  it("支払済み・形式外の支払条件・期日なしは対象外", () => {
    expect(
      irregularPaymentDateAlerts(
        [order({ paid: true, paymentDate: "2026-11-10" })],
        byId
      )
    ).toHaveLength(0);
    expect(
      irregularPaymentDateAlerts(
        [order({ payment: "自由記述", paymentDate: "2026-11-10" })],
        byId
      )
    ).toHaveLength(0);
    expect(
      irregularPaymentDateAlerts([order({ paymentDate: null })], byId)
    ).toHaveLength(0);
  });
});

describe("月次確定ロック漏れ", () => {
  it("引渡月の翌月20日を過ぎた（21日以降）未ロックの契約済み案件を月ごとにまとめる", () => {
    const ps = [
      project(),
      project({ id: 2 }),
      project({ id: 3, lockedAt: new Date() }),
    ];
    expect(lockLeakAlerts(ps, "2026-10-19")).toHaveLength(0);
    // 20日当日は「過ぎて」いないので通知しない
    expect(lockLeakAlerts(ps, "2026-10-20")).toHaveLength(0);
    const items = lockLeakAlerts(ps, "2026-10-21");
    expect(items).toHaveLength(1);
    expect(items[0]?.message).toContain("2件");
  });

  it("対象の案件が増えたら、通知のキーが変わる（開封済みのまま隠れない）", () => {
    const one = lockLeakAlerts([project()], "2026-10-21")[0];
    const two = lockLeakAlerts(
      [project(), project({ id: 2 })],
      "2026-10-21"
    )[0];
    expect(one && two && notificationKey(one) !== notificationKey(two)).toBe(
      true
    );
  });
});

describe("対象者の制御", () => {
  const items = [
    { audience: "all" as const },
    { audience: "finance" as const },
  ];
  it("管理者・経理は全件、一般社員・閲覧のみは全員向けだけ、税理士・社労士は無し", () => {
    expect(filterNotificationsForRole(items, "admin")).toHaveLength(2);
    expect(filterNotificationsForRole(items, "accounting")).toHaveLength(2);
    expect(filterNotificationsForRole(items, "staff")).toHaveLength(1);
    expect(filterNotificationsForRole(items, "viewer")).toHaveLength(1);
    expect(filterNotificationsForRole(items, "tax_advisor")).toHaveLength(0);
  });
});
