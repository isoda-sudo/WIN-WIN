import { describe, expect, it } from "vitest";
import { compareProjectsById, periodForDeepLink } from "~/lib/project-order";

const p = (id: number, projectNo: string | null) => ({ id, projectNo });
const sortIds = (rows: { id: number; projectNo: string | null }[]) =>
  [...rows].sort(compareProjectsById).map((r) => r.id);

describe("compareProjectsById", () => {
  it("期→連番の数値昇順", () => {
    expect(
      sortIds([
        p(1, "WW07-010"),
        p(2, "WW07-002"),
        p(3, "WW06-999"),
        p(4, "WW08-001"),
      ])
    ).toEqual([3, 2, 1, 4]);
  });

  it("旧形式と null は新形式の後ろ（旧形式はID昇順、null は最後）", () => {
    expect(
      sortIds([
        p(1, null),
        p(2, "WW-202604-2"),
        p(3, "WW07-001"),
        p(4, "WW-202603-1"),
      ])
    ).toEqual([3, 4, 2, 1]);
  });

  it("同一IDは内部idで安定", () => {
    expect(sortIds([p(5, "WW07-001"), p(2, "WW07-001")])).toEqual([2, 5]);
    expect(sortIds([p(5, null), p(2, null)])).toEqual([2, 5]);
  });
});

describe("periodForDeepLink", () => {
  const rows = [
    {
      id: 1,
      projectNo: "WW07-001",
      name: "A邸",
      client: "x",
      deliveryMonth: "2026-09",
    },
    {
      id: 2,
      projectNo: "WW08-001",
      name: "B邸",
      client: "y",
      deliveryMonth: "2027-05",
    },
    {
      id: 3,
      projectNo: "WW08-002",
      name: "C邸",
      client: "y",
      deliveryMonth: null,
    },
  ];
  it("案件IDで該当案件の期（決算年）を返す", () => {
    expect(periodForDeepLink(rows, "WW08-001")).toBe(2028);
    expect(periodForDeepLink(rows, "WW07-001")).toBe(2027);
  });
  it("見つからない・引渡月なし・空は null", () => {
    expect(periodForDeepLink(rows, "zzz")).toBeNull();
    expect(periodForDeepLink(rows, "WW08-002")).toBeNull();
    expect(periodForDeepLink(rows, null)).toBeNull();
  });
});
