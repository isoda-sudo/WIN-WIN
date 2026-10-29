"use client";

import { Lock } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getEditClientId, setEditScope } from "~/lib/edit-scope";
import { api } from "~/trpc/react";

const HEARTBEAT_MS = 20_000;
/** 画面を操作したとみなすイベント（最後の操作の時刻の計測に使う）。 */
const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "input",
] as const;

/** 他の人が編集中の間 true。配下の一覧テーブル（ScrollableTableSection）の編集操作を無効にする。 */
const EditLockedContext = createContext(false);
export const EditLockedProvider = EditLockedContext.Provider;
export function useEditLocked(): boolean {
  return useContext(EditLockedContext);
}

/**
 * 画面の排他制御。開いた時に編集権を取り、20秒ごとに更新、閉じたら手放す。
 * 最初に開いた1名だけが編集でき、後から開いた人は閲覧のみ（canEdit=false）。
 * 編集者の最後の操作から15分が過ぎたら（画面を開いたままでも）、または編集者の画面が閉じた・60秒応答しない
 * ときは、編集中の表示が消え、閲覧のみだった人が自動で編集できるようになる。
 */
const ACQUIRED_BASE = { error: false, freed: false, ready: true } as const;

/** 閲覧のみの人の状態更新: 編集者が見つからなければ「いなくなった」、いれば名前を更新する。 */
function peekedState<T extends { holder: string | null; freed: boolean }>(
  prev: T,
  holder: string | null
): T {
  return { ...prev, freed: holder === null, holder: holder ?? prev.holder };
}

type PollResult =
  | { holder: string | null; kind: "viewing"; viewer: true }
  | {
      canEdit: boolean;
      holder: string | null;
      kind: "acquired";
      viewer: boolean;
    };

/**
 * 編集権の確認1回分。閲覧のみの人は、編集者の表示だけを更新する。ただし編集者がいなくなった
 * （画面を閉じた・最後の操作から15分）ときは、そのまま編集権を取りに行く。
 */
async function pollLock(input: {
  acquire: (v: {
    clientId: string;
    idleSeconds: number;
    scope: string;
  }) => Promise<{ canEdit: boolean; holder: string | null }>;
  idleSeconds: number;
  peek: (v: {
    clientId: string;
    idleSeconds: number;
    scope: string;
  }) => Promise<{ holder: string | null }>;
  scope: string;
  viewer: boolean;
}): Promise<PollResult> {
  const args = {
    clientId: getEditClientId(),
    idleSeconds: input.idleSeconds,
    scope: input.scope,
  };
  if (input.viewer) {
    const peeked = await input.peek(args);
    if (peeked.holder !== null) {
      return { holder: peeked.holder, kind: "viewing", viewer: true };
    }
  }
  const r = await input.acquire(args);
  return {
    canEdit: r.canEdit,
    holder: r.holder,
    kind: "acquired",
    viewer: !r.canEdit && Boolean(r.holder),
  };
}

export function useEditLock(scope: string) {
  const acquire = api.editLocks.acquire.useMutation();
  const peek = api.editLocks.peek.useMutation();
  const release = api.editLocks.release.useMutation();
  const [state, setState] = useState<{
    canEdit: boolean;
    error: boolean;
    /** 閲覧のみで開いたあと、編集者がいなくなった（再読み込みで編集できる）。 */
    freed: boolean;
    holder: string | null;
    ready: boolean;
  }>({
    canEdit: false,
    error: false,
    freed: false,
    holder: null,
    ready: false,
  });
  const viewerRef = useRef(false);
  const peekRef = useRef(peek.mutateAsync);
  peekRef.current = peek.mutateAsync;
  const acquireRef = useRef(acquire.mutateAsync);
  const releaseRef = useRef(release.mutate);
  acquireRef.current = acquire.mutateAsync;
  releaseRef.current = release.mutate;

  useEffect(() => {
    let stopped = false;
    let lastActivity = Date.now();
    const markActive = () => {
      lastActivity = Date.now();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, markActive, { passive: true });
    }
    const idleSeconds = () =>
      Math.max(0, Math.floor((Date.now() - lastActivity) / 1000));
    setEditScope(scope);
    const tick = async () => {
      try {
        const result = await pollLock({
          acquire: acquireRef.current,
          idleSeconds: idleSeconds(),
          peek: peekRef.current,
          scope,
          viewer: viewerRef.current,
        });
        viewerRef.current = result.viewer;
        if (stopped) {
          return;
        }
        if (result.kind === "viewing") {
          setState((prev) => peekedState(prev, result.holder));
        } else {
          setState({
            ...ACQUIRED_BASE,
            canEdit: result.canEdit,
            holder: result.holder,
          });
        }
      } catch {
        // 通信失敗時は編集権を持たない扱いにする（二重編集を避ける）
        if (!stopped) {
          setState((prev) => ({
            ...prev,
            canEdit: false,
            error: true,
            ready: true,
          }));
        }
      }
    };
    tick();
    const timer = setInterval(tick, HEARTBEAT_MS);
    // 画面を閉じる・再読み込みするときは、その場で編集権を手放す（通常の通信は閉じる際に打ち切られることが
    // あるため、keepalive で確実に送る）。手放せなかった場合も、最後の操作から15分で解除される。
    const onUnload = () => {
      try {
        fetch("/api/trpc/editLocks.release?batch=1", {
          body: JSON.stringify({
            0: {
              json: { clientId: getEditClientId(), idleSeconds: 0, scope },
            },
          }),
          headers: { "content-type": "application/json" },
          keepalive: true,
          method: "POST",
        }).catch(() => undefined);
      } catch {
        // 送れなくても、15分で解除される
      }
    };
    window.addEventListener("pagehide", onUnload);
    return () => {
      stopped = true;
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, markActive);
      }
      setEditScope(null);
      clearInterval(timer);
      window.removeEventListener("pagehide", onUnload);
      releaseRef.current({
        clientId: getEditClientId(),
        idleSeconds: 0,
        scope,
      });
    };
  }, [scope]);

  // 他の人が編集中（または編集権を確認できない）ときは、編集・アップロードを止める
  const locked =
    state.ready &&
    !state.canEdit &&
    (state.holder !== null || state.error || state.freed);
  return { ...state, locked };
}

/** 他の人が編集中のときに出す案内帯。閲覧は自由で、アップロード・更新はできない（順番待ちではない）。 */
export function EditLockBanner({
  freed = false,
  holder,
  locked,
}: {
  freed?: boolean;
  holder: string | null;
  locked: boolean;
}) {
  if (!locked) {
    return null;
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <Lock className="size-4 shrink-0" />
      {bannerText({ freed, holder })}
    </div>
  );
}

function bannerText({
  freed,
  holder,
}: {
  freed: boolean;
  holder: string | null;
}): string {
  if (freed) {
    return "編集していた人が画面を閉じました。再読み込みすると、編集できます。";
  }
  return holder
    ? `現在 ${holder} さんが編集中です。閲覧のみ可能です（アップロード・更新はできません）。`
    : "編集権を取得できませんでした。閲覧のみ可能です。";
}
