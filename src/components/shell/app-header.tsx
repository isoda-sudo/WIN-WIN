"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { NotificationBell } from "~/components/shell/notification-bell";
import { Button } from "~/components/ui/button";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  accounting: "経理部",
  staff: "一般社員",
};

export function AppHeader({ email, role }: { email: string; role: string }) {
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b bg-background px-4">
      <NotificationBell />
      <div className="flex items-center gap-2 border-l pl-3">
        <div className="text-right">
          <p className="font-medium text-sm leading-tight">{email}</p>
          <p className="text-muted-foreground text-xs leading-tight">
            {ROLE_LABELS[role] ?? role}
          </p>
        </div>
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
