"use client";

import { LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MobileNav } from "~/components/shell/mobile-nav";
import { NotificationBell } from "~/components/shell/notification-bell";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { roleLabel } from "~/lib/roles";

export function AppHeader({ email, role }: { email: string; role: string }) {
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b bg-background ps-2 pe-2 pt-[env(safe-area-inset-top)] md:justify-end md:gap-2 md:px-4">
      <MobileNav role={role} />
      <div className="flex-1 truncate font-bold md:hidden">
        物件管理システム
      </div>
      {role !== "tax_advisor" && <NotificationBell />}
      <div className="flex items-center gap-1 border-l pl-2 md:gap-2 md:pl-3">
        {/* メールアドレスと権限は、スマホでは幅が足りないため出さない（アイコンだけ） */}
        <div className="hidden text-right md:block">
          <p className="font-medium text-sm leading-tight">{email}</p>
          <p className="text-muted-foreground text-xs leading-tight">
            {roleLabel(role)}
          </p>
        </div>
        <Button asChild size="icon" variant="ghost">
          <Link aria-label="セキュリティ設定" href="/security">
            <ShieldCheck className="size-4" />
          </Link>
        </Button>
        <ThemeToggle />
        <Button
          aria-label="ログアウト"
          onClick={logout}
          size="icon"
          variant="ghost"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
