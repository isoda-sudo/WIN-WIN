"use client";

import { useEffect } from "react";

// 他の人が編集中のとき、ダイアログ内で無効にする入力部品
const INPUT_SELECTOR =
  'input, textarea, select, [role="combobox"], [role="checkbox"], [role="switch"], button[type="submit"]';
// 更新・保存・削除・アップロードなど、データを変える操作のボタン（閉じる・プレビュー・ダウンロードなどは残す）
const MUTATING_BUTTON_RE =
  /保存|更新|登録|追加|削除|確定|アップロード|変更|作成|適用|解除|取消|スキップ|発行|反映|承認|復元|戻す|貼り付け|上書き/;

/**
 * 他の人が編集中（locked）のあいだ、ダイアログの中の入力・更新ボタンを無効にする（閲覧のみ）。
 * 中身が後から描画されても追従し、編集中でなくなったら元に戻す。サーバー側でも更新は拒否される。
 */
export function useDisableEditing(root: HTMLElement | null, locked: boolean) {
  useEffect(() => {
    if (!(locked && root)) {
      return;
    }
    const changed = new Set<HTMLElement>();
    const apply = () => {
      for (const el of root.querySelectorAll<HTMLElement>(
        `${INPUT_SELECTOR}, button`
      )) {
        const isButton = el.tagName === "BUTTON";
        const target =
          el.matches(INPUT_SELECTOR) ||
          (isButton && MUTATING_BUTTON_RE.test(el.textContent ?? ""));
        if (
          !target ||
          el.hasAttribute("disabled") ||
          el.closest("[data-allow-locked]")
        ) {
          continue;
        }
        el.setAttribute("disabled", "");
        el.setAttribute("aria-disabled", "true");
        changed.add(el);
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      for (const el of changed) {
        el.removeAttribute("disabled");
        el.removeAttribute("aria-disabled");
      }
    };
  }, [root, locked]);
}
