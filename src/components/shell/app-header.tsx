"use client";

import { LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b bg-background px-4">
      {role !== "tax_advisor" && <NotificationBell />}
      <div className="flex items-center gap-2 border-l pl-3">
        <div className="text-right">
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
