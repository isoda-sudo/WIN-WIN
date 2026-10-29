/** 期跨ぎの引渡月変更でコピー元となった案件のステータス（以後は集計対象外）。 */
export const SUPERSEDED_STATUS = "オーダー移行";

export function isSuperseded(status: string | null | undefined): boolean {
  return status === SUPERSEDED_STATUS;
}

/** 置き換え済み（オーダー移行）の案件を除いた案件のみ返す。 */
export function excludeSupersededProjects<T extends { status: string | null }>(
  rows: T[]
): T[] {
  return rows.filter((p) => !isSuperseded(p.status));
}

/** 置き換え済み案件IDの集合を作る。 */
export function supersededProjectIds(
  rows: { id: number; status: string | null }[]
): Set<number> {
  return new Set(rows.filter((p) => isSuperseded(p.status)).map((p) => p.id));
}

/** projectId が置き換え済み案件を指す行（発注・請求書など）を除く。 */
export function excludeBySupersededProject<T extends { projectId: number }>(
  rows: T[],
  supersededIds: Set<number>
): T[] {
  return rows.filter((r) => !supersededIds.has(r.projectId));
}
