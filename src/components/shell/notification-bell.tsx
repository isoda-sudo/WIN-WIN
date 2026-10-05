"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

const LEVEL_STYLES: Record<string, string> = {
  error: "border-l-destructive",
  warning: "border-l-amber-500",
  info: "border-l-muted-foreground",
};

const CONFIRMED_STORAGE_KEY = "notif_confirmed";

function readConfirmed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(CONFIRMED_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function notificationKey(n: {
  title: string;
  keyword: string | null;
  date: string | null;
}) {
  return `${n.title}:${n.keyword ?? ""}:${n.date ?? ""}`;
}

export function NotificationBell() {
  const { data } = api.dashboard.notifications.useQuery(undefined, {
    staleTime: 60_000,
  });
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setConfirmed(readConfirmed());
  }, []);

  const notifications = data ?? [];
  const unconfirmedAlerts = notifications.filter(
    (n) =>
      (n.level === "error" || n.level === "warning") &&
      !confirmed.has(notificationKey(n))
  );

  const confirm = (n: (typeof notifications)[number]) => {
    const next = new Set(confirmed);
    next.add(notificationKey(n));
    setConfirmed(next);
    try {
      window.localStorage.setItem(
        CONFIRMED_STORAGE_KEY,
        JSON.stringify([...next])
      );
    } catch {
      // localStorage unavailable — 既読状態はこのセッション限りになる
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="relative" size="icon" variant="ghost">
          <Bell className="size-5" />
          {unconfirmedAlerts.length > 0 && (
            <Badge
              className="absolute -top-1 -right-1 size-5 justify-center rounded-full p-0 text-[10px]"
              variant="destructive"
            >
              {unconfirmedAlerts.length > 99 ? "99+" : unconfirmedAlerts.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b px-4 py-3 font-semibold text-sm">通知</div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="p-4 text-muted-foreground text-sm">
              通知はありません
            </p>
          ) : (
            notifications.map((n) => (
              <div
                className={cn(
                  "border-b border-l-4 px-4 py-3 last:border-b-0",
                  LEVEL_STYLES[n.level]
                )}
                key={notificationKey(n)}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm">{n.title}</p>
                  {!confirmed.has(notificationKey(n)) && (
                    <button
                      className="shrink-0 text-muted-foreground text-xs hover:text-foreground"
                      onClick={() => confirm(n)}
                      type="button"
                    >
                      確認
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {n.message}
                </p>
                <Link
                  className="mt-1 inline-block text-primary text-xs hover:underline"
                  href={
                    n.keyword
                      ? `${n.link}?q=${encodeURIComponent(n.keyword)}`
                      : n.link
                  }
                >
                  詳細を見る
                </Link>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
