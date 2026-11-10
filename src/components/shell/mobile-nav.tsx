"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SidebarNav } from "~/components/shell/sidebar-nav";
import { Button } from "~/components/ui/button";

/**
 * スマホ（md 未満）用のメニュー。ヘッダーのボタンで、左からメニューを開く。
 * 画面を移動したとき、Esc・背景のタップ・閉じるボタンで閉じる。md 以上は、左の常時表示のメニューを使う。
 */
export function MobileNav({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 画面を移動したら閉じる
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname の変化で閉じるのが目的
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <Button
        aria-expanded={open}
        aria-label="メニューを開く"
        onClick={() => setOpen(true)}
        size="icon"
        variant="ghost"
      >
        <Menu className="size-5" />
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button
            aria-label="メニューを閉じる"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            type="button"
          />
          <aside
            aria-label="メニュー"
            className="relative flex h-dvh w-64 max-w-[80vw] flex-col border-r bg-background shadow-lg"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b ps-4 pe-2 font-bold text-lg">
              物件管理システム
              <Button
                aria-label="メニューを閉じる"
                onClick={() => setOpen(false)}
                size="icon"
                variant="ghost"
              >
                <X className="size-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              <SidebarNav role={role} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
