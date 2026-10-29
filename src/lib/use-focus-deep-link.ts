"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const FOCUS_PARAM = "focus";
const FIND_TIMEOUT_MS = 5000;

const ID_RE = /-(\d+)$/;

/**
 * 通知の「詳細を見る」などの遷移先URL。対象は "project-12" / "order-34" の形式。
 * 対象が1件なら、IDでの検索（q）と年月（month）も付け、画面を開いた時点で1件に絞り込めるようにする
 * （一覧の読み込みを待たずに、対象の行だけを描画できる）。
 */
export function focusHref(
  link: string,
  focus: readonly string[],
  month?: string | null
): string {
  if (focus.length === 0) {
    return link;
  }
  const params = new URLSearchParams({ [FOCUS_PARAM]: focus.join(",") });
  const id = focus.length === 1 ? ID_RE.exec(focus[0] ?? "")?.[1] : undefined;
  if (id) {
    params.set("q", id);
  }
  if (month) {
    params.set("month", month);
  }
  return `${link}?${params.toString()}`;
}

/** 対象が1件のとき、一覧を絞り込む検索語（数字のID）。複数・不明なら空（絞り込まない）。 */
export function focusSearchKeyword(ids: readonly string[]): string {
  return ids.length === 1 ? (ID_RE.exec(ids[0] ?? "")?.[1] ?? "") : "";
}

/** フォーカス指定付きで開かれたときの、初期の検索語（ID）と年月。指定が無ければ null。 */
export function readFocusParams(sp: { get: (k: string) => string | null }): {
  month: string | null;
  q: string | null;
} {
  if (!sp.get(FOCUS_PARAM)) {
    return { month: null, q: null };
  }
  return { month: sp.get("month"), q: sp.get("q") };
}

/**
 * ?focus=... で開かれたとき、一覧の絞り込みをその対象が見える状態に直し（resolve）、
 * 行（data-focus-id）までスクロールする（色の変更・点滅はしない）。データの読み込み完了後に1回だけ動く。
 * 対象が絞り込み・ページ送りで隠れないように、resolve では期・月・状態・キーワードを対象に合わせる。
 */
export function useFocusDeepLink({
  ready,
  resolve,
}: {
  ready: boolean;
  resolve: (ids: string[]) => void;
}) {
  const searchParams = useSearchParams();
  const raw = searchParams.get(FOCUS_PARAM);
  const handled = useRef<string | null>(null);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  useEffect(() => {
    if (!(ready && raw) || handled.current === raw) {
      return;
    }
    handled.current = raw;
    const ids = raw.split(",").filter(Boolean);
    resolveRef.current(ids);

    // 絞り込みの反映後に描画される行を、少し待ちながら探す
    const started = performance.now();
    let frame = 0;
    const find = () => {
      const el = ids
        .map((id) =>
          document.querySelector<HTMLElement>(`[data-focus-id="${id}"]`)
        )
        .find(Boolean);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // 再読み込み・戻るで同じ強調が繰り返されないよう、URLから外す
        const url = new URL(window.location.href);
        for (const k of [FOCUS_PARAM, "q", "month"]) {
          url.searchParams.delete(k);
        }
        window.history.replaceState(null, "", url.toString());
        return;
      }
      if (performance.now() - started < FIND_TIMEOUT_MS) {
        frame = requestAnimationFrame(find);
      }
    };
    frame = requestAnimationFrame(find);
    return () => cancelAnimationFrame(frame);
  }, [ready, raw]);
}
