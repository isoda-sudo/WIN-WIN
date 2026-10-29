/**
 * 編集中の人の最後の操作からこの時間（分）が過ぎたら、他の人が編集できる（画面を開いたままでも）。
 * 画面が落ちた・通信が切れた場合も同じ時間で解除する（別タブに切り替えて作業中のブラウザは
 * 裏の画面の通信を間引くため、短い時間で解除すると、操作中の人から編集権を奪ってしまう）。
 * 画面を閉じたときは、その場で手放す。
 */
export const LOCK_IDLE_TIMEOUT_MINUTES = 15;

const MS_PER_MINUTE = 60 * 1000;

/** この時刻より前の最後の操作（・ハートビート）は「放置」とみなす。 */
export function idleCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - LOCK_IDLE_TIMEOUT_MINUTES * MS_PER_MINUTE);
}

/** この時刻より前のハートビートは「途絶えた」とみなす（最後の操作と同じ15分）。 */
export function heartbeatCutoff(now: Date = new Date()): Date {
  return idleCutoff(now);
}

/**
 * 編集中のロックが有効か。ハートビートも最後の操作も、15分以内のときだけ有効。
 * 最後の操作が未記録の古い行は、ハートビートだけで判定する。
 */
export function isLockAlive(
  held: { activityAt: Date | null; heartbeatAt: Date },
  now: Date = new Date()
): boolean {
  return (
    held.heartbeatAt > heartbeatCutoff(now) &&
    (held.activityAt === null || held.activityAt > idleCutoff(now))
  );
}
