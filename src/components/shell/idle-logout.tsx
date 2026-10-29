"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 無操作がこの時間（1時間）続いたら自動でログアウトする。 */
export const IDLE_LIMIT_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 30_000;
const WRITE_THROTTLE_MS = 5000;
const STORAGE_KEY = "last_activity_at";
const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
] as const;

function readLastActivity(fallback: number): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) || fallback : fallback;
  } catch {
    return fallback;
  }
}

function writeLastActivity(at: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(at));
  } catch {
    // 保存できない環境ではこのタブ内の記録だけで判定する
  }
}

/**
 * 操作（マウス・キー・スクロール・タッチ）が1時間無いと自動ログアウトし、ログイン画面へ戻す。
 * 最終操作時刻は localStorage で共有するので、複数タブのどれかで操作していれば切れない。
 */
export function IdleLogout() {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    let lastWrite = 0;
    writeLastActivity(last);

    const onActivity = () => {
      const now = Date.now();
      last = now;
      if (now - lastWrite > WRITE_THROTTLE_MS) {
        lastWrite = now;
        writeLastActivity(now);
      }
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    let done = false;
    const timer = setInterval(async () => {
      if (done) {
        return;
      }
      const latest = Math.max(last, readLastActivity(last));
      if (Date.now() - latest < IDLE_LIMIT_MS) {
        return;
      }
      done = true;
      await fetch("/api/auth/logout?idle=1", { method: "POST" }).catch(
        () => null
      );
      router.push("/login?reason=idle");
      router.refresh();
    }, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
    };
  }, [router]);

  return null;
}
