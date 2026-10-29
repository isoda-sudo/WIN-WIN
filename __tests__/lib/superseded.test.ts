import { describe, expect, it } from "vitest";
import {
  excludeBySupersededProject,
  excludeSupersededProjects,
  isSuperseded,
  supersededProjectIds,
} from "~/lib/superseded";

describe("superseded helpers", () => {
  const projs = [
    { id: 1, status: "オーダー移行" },
    { id: 2, status: "受注" },
    { id: 3, status: null },
  ];
  it("isSuperseded", () => {
    expect(isSuperseded("オーダー移行")).toBe(true);
    expect(isSuperseded("受注")).toBe(false);
    expect(isSuperseded(null)).toBe(false);
  });
  it("excludeSupersededProjects keeps null status", () => {
    expect(excludeSupersededProjects(projs).map((p) => p.id)).toEqual([2, 3]);
  });
  it("excludeBySupersededProject drops rows of superseded projects", () => {
    const ids = supersededProjectIds(projs);
    const rows = [{ projectId: 1 }, { projectId: 2 }];
    expect(excludeBySupersededProject(rows, ids)).toEqual([{ projectId: 2 }]);
  });
});
