import { fiscalPeriodOfMonth } from "~/lib/fiscal-period";

/**
 * 受注一覧の表示順: 案件ID「WW{期2桁}-{連番3桁}」を期→連番の数値昇順で並べる。
 * 旧形式（WW-YYYYMM-n など）・未採番は新形式の後ろに、ID の文字列昇順で並べる。
 */
const NEW_PROJECT_NO_RE = /^WW(\d{2})-(\d{3})$/;

export interface ProjectOrderKey {
  id: number;
  projectNo: string | null;
}

function parseNewNo(projectNo: string | null): [number, number] | null {
  const m = projectNo ? NEW_PROJECT_NO_RE.exec(projectNo) : null;
  if (!m) {
    return null;
  }
  return [Number(m[1]), Number(m[2])];
}

function compareLegacy(a: ProjectOrderKey, b: ProjectOrderKey): number {
  const an = a.projectNo ?? "";
  const bn = b.projectNo ?? "";
  if (an !== bn) {
    return an < bn ? -1 : 1;
  }
  return a.id - b.id;
}

export function compareProjectsById(
  a: ProjectOrderKey,
  b: ProjectOrderKey
): number {
  const pa = parseNewNo(a.projectNo);
  const pb = parseNewNo(b.projectNo);
  if (pa && pb) {
    return pa[0] - pb[0] || pa[1] - pb[1] || a.id - b.id;
  }
  if (pa) {
    return -1;
  }
  if (pb) {
    return 1;
  }
  // null は旧形式より後ろ
  if (!a.projectNo && b.projectNo) {
    return 1;
  }
  if (a.projectNo && !b.projectNo) {
    return -1;
  }
  return compareLegacy(a, b);
}

const NUMERIC_ONLY_RE = /^\d+$/;

export interface ProjectSearchKey extends ProjectOrderKey {
  client: string;
  deliveryMonth: string | null;
  name: string;
}

/** 受注一覧の検索語との一致（数字のみ=内部id一致、それ以外=工事名・発注元・案件IDの部分一致）。 */
export function projectMatchesKeyword(
  p: ProjectSearchKey,
  keyword: string
): boolean {
  const kw = keyword.trim();
  if (!kw) {
    return true;
  }
  if (NUMERIC_ONLY_RE.test(kw)) {
    return String(p.id) === kw;
  }
  const lower = kw.toLowerCase();
  return (
    p.name.toLowerCase().includes(lower) ||
    p.client.toLowerCase().includes(lower) ||
    (p.projectNo ?? "").toLowerCase().includes(lower)
  );
}

/**
 * ディープリンク（?q=）の検索語に一致する案件の会計期（決算年）。全案件から探し、
 * 案件IDの完全一致を優先する。見つからない・引渡月が無い場合は null（現在の期のまま）。
 */
export function periodForDeepLink(
  projects: readonly ProjectSearchKey[],
  q: string | null | undefined
): number | null {
  const kw = (q ?? "").trim();
  if (!kw) {
    return null;
  }
  const hits = projects.filter(
    (p) => p.deliveryMonth && projectMatchesKeyword(p, kw)
  );
  const hit = hits.find((p) => p.projectNo === kw) ?? hits[0];
  return hit?.deliveryMonth ? fiscalPeriodOfMonth(hit.deliveryMonth) : null;
}
