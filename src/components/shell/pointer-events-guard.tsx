"use client";

import { useEffect } from "react";

// 開いているダイアログ・メニュー・プルダウンなど（これらが開いている間は、背面をクリック不可にしてよい）
const OPEN_LAYER_SELECTOR =
  '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]';
const CHECK_DELAY_MS = 600;

/**
 * ダイアログを閉じた後に、画面全体が「クリック不可」のまま残る不具合（Radixの body{pointer-events:none} の
 * 取り残し）を自動で直す。重なりが何も開いていないのに body がクリック不可なら、解除する。
 */
export function PointerEventsGuard() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (
          document.body.style.pointerEvents === "none" &&
          !document.querySelector(OPEN_LAYER_SELECTOR)
        ) {
          document.body.style.pointerEvents = "";
        }
      }, CHECK_DELAY_MS);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      attributeFilter: ["style"],
      attributes: true,
      childList: true,
    });
    check();
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);
  return null;
}
