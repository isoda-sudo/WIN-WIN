import { describe, expect, it } from "vitest";
import { isLockAlive } from "~/lib/edit-lock-expiry";

const NOW = new Date("2026-10-28T10:00:00+09:00");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const SEC = 1000;
const MIN = 60 * SEC;

describe("isLockAlive", () => {
  it("画面が生きていて、最後の操作から15分以内なら有効", () => {
    expect(
      isLockAlive(
        { activityAt: ago(14 * MIN), heartbeatAt: ago(10 * SEC) },
        NOW
      )
    ).toBe(true);
  });
  it("最後の操作から15分を過ぎたら、画面を開いたままでも無効", () => {
    expect(
      isLockAlive({ activityAt: ago(16 * MIN), heartbeatAt: ago(5 * SEC) }, NOW)
    ).toBe(false);
  });
  it("ハートビートが15分途絶えたら（画面が落ちた）無効。60秒の途絶えでは解除しない", () => {
    expect(
      isLockAlive({ activityAt: ago(MIN), heartbeatAt: ago(16 * MIN) }, NOW)
    ).toBe(false);
    expect(
      isLockAlive({ activityAt: ago(MIN), heartbeatAt: ago(61 * SEC) }, NOW)
    ).toBe(true);
  });
  it("最後の操作が未記録の古い行は、ハートビートだけで判定", () => {
    expect(
      isLockAlive({ activityAt: null, heartbeatAt: ago(10 * SEC) }, NOW)
    ).toBe(true);
    expect(
      isLockAlive({ activityAt: null, heartbeatAt: ago(20 * MIN) }, NOW)
    ).toBe(false);
  });
});
