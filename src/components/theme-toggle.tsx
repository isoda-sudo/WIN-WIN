"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";

/** ライト／ダークの切り替え（ヘッダー用のアイコンボタン）。 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // サーバー描画との不一致を避けるため、マウント後にアイコンを決める
  useEffect(() => {
    setMounted(true);
  }, []);

  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      aria-label={dark ? "ライトモードにする" : "ダークモードにする"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      size="icon"
      title={dark ? "ライトモードにする" : "ダークモードにする"}
      variant="ghost"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
