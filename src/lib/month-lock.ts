/**
 * 工事外の支払い予定表の月ごとの確定（ロック）の純粋ロジック。
 * 受注一覧の確定（フィックス）と同じ考え方: 管理者のみ・その月の末日を過ぎてから確定できる。
 * 確定した月（期日の月）の支払いは、編集・ステータス変更・削除ができない。
 */

const YEAR_MONTH_PREFIX_RE = /^(\d{4}-(?:0[1-9]|1[0-2]))/;
const MONTHS_PER_YEAR = 12;

/** 日付（"YYYY-MM-DD"）または年月（"YYYY-MM"）から "YYYY-MM" を取り出す。取れなければ null。 */
export function monthOf(value: string | null | undefined): string | null {
  return YEAR_MONTH_PREFIX_RE.exec((value ?? "").trim())?.[1] ?? null;
}

/** 指定月（YYYY-MM）の末日を過ぎている（現在が翌月以降）かどうか。確定の前提条件。 */
export function isMonthOver(
  yearMonth: string,
  now: { month: number; year: number }
): boolean {
  const m = YEAR_MONTH_PREFIX_RE.exec(yearMonth);
  if (!m) {
    return false;
  }
  const [y, mo] = (m[1] ?? "").split("-").map(Number);
  const nowIdx = now.year * MONTHS_PER_YEAR + now.month - 1;
  const targetIdx = (y ?? 0) * MONTHS_PER_YEAR + (mo ?? 1) - 1;
  return nowIdx > targetIdx;
}

/** 確定済みの月のうち、対象の日付・年月が属するものを1つ返す（無ければ null）。 */
export function findLockedMonth(
  targets: readonly (string | null | undefined)[],
  lockedMonths: ReadonlySet<string>
): string | null {
  for (const t of targets) {
    const ym = monthOf(t);
    if (ym && lockedMonths.has(ym)) {
      return ym;
    }
  }
  return null;
}

export function lockedMonthMessage(yearMonth: string): string {
  return `${yearMonth}は確定済みのため変更できません。管理者が確定を解除してください`;
}
