"use client";

import {
  ArrowRight,
  Bell,
  BellOff,
  CalendarClock,
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  Lock,
  type LucideIcon,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { focusHref } from "~/lib/use-focus-deep-link";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type Notification = RouterOutputs["dashboard"]["notifications"][number];

const ICONS: Record<string, LucideIcon> = {
  error: CircleAlert,
  lock: Lock,
  receipt_long: ReceiptText,
  schedule: Clock,
};

// 重要度ごとの色（アイコンの丸・左のライン）。未開封のときだけ色を付ける
const INFO_TONE = {
  icon: "bg-muted text-muted-foreground",
};
const LEVEL_TONE: Record<string, { icon: string }> = {
  error: {
    icon: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  info: INFO_TONE,
  warning: {
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
};

type Tab = "all" | "unopened";

function formatDate(date: string | null): string | null {
  if (!date) {
    return null;
  }
  return date.length === 7 ? date.replace("-", "/") : date.replaceAll("-", "/");
}

export function NotificationBell() {
  const utils = api.useUtils();
  const { data } = api.dashboard.notifications.useQuery(undefined, {
    staleTime: 60_000,
  });
  // 開封状態はサーバー（ユーザーごと）に保存される。押した直後は画面側ですぐ反映する。
  const [justOpened, setJustOpened] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>("all");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const open = api.dashboard.openNotifications.useMutation({
    onSettled: () => utils.dashboard.notifications.invalidate(),
  });

  const notifications = data ?? [];
  const isOpened = (n: Notification) => n.opened || justOpened.has(n.key);
  const unopened = notifications.filter((n) => !isOpened(n));
  const unconfirmedAlerts = unopened.filter(
    (n) => n.level === "error" || n.level === "warning"
  );
  const shown = tab === "unopened" ? unopened : notifications;

  const openKeys = (keys: string[]) => {
    if (keys.length === 0) {
      return;
    }
    setJustOpened((prev) => new Set([...prev, ...keys]));
    open.mutate({ keys: keys.slice(0, 1000) });
  };

  return (
    <Popover onOpenChange={setPopoverOpen} open={popoverOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="通知"
          className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          type="button"
        >
          <Bell className="size-5" />
          {unconfirmedAlerts.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-[1.15rem] items-center justify-center rounded-full bg-destructive px-1 font-semibold text-[10px] text-white leading-[1.15rem] ring-2 ring-background">
              {unconfirmedAlerts.length > 99 ? "99+" : unconfirmedAlerts.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[26rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl p-0 shadow-xl"
        sideOffset={10}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
          <h2 className="font-semibold text-base">通知</h2>
          <button
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-primary text-xs transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-40"
            disabled={unopened.length === 0}
            onClick={() => openKeys(unopened.map((n) => n.key))}
            type="button"
          >
            <CheckCheck className="size-3.5" />
            すべて開封済みにする
          </button>
        </div>
        <div className="flex gap-1 px-4 pb-3">
          {(
            [
              ["all", "すべて"],
              [
                "unopened",
                unopened.length > 0 ? `未開封 ${unopened.length}` : "未開封",
              ],
            ] as const
          ).map(([value, label]) => (
            <button
              className={cn(
                "rounded-full px-3 py-1 font-medium text-xs transition-colors",
                tab === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent"
              )}
              key={value}
              onClick={() => setTab(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="max-h-[28rem] overflow-y-auto border-t">
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-muted-foreground">
              <BellOff className="size-8 opacity-50" />
              <p className="text-sm">
                {tab === "unopened"
                  ? "未開封の通知はありません"
                  : "通知はありません"}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {shown.map((n) => (
                <NotificationRow
                  key={n.key}
                  n={n}
                  onNavigate={() => {
                    openKeys([n.key]);
                    setPopoverOpen(false);
                  }}
                  onOpen={() => openKeys([n.key])}
                  opened={isOpened(n)}
                />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  n,
  onNavigate,
  onOpen,
  opened,
}: {
  n: Notification;
  onNavigate: () => void;
  onOpen: () => void;
  opened: boolean;
}) {
  const tone = LEVEL_TONE[n.level] ?? INFO_TONE;
  const Icon = ICONS[n.icon] ?? CircleAlert;
  const date = formatDate(n.date);
  return (
    <li
      className={cn(
        "group relative flex gap-3 px-4 py-3.5 transition-colors",
        // 未開封はメニュー選択時と同じベージュ、開封済みは白
        opened ? "hover:bg-muted/60" : "bg-secondary/15 hover:bg-secondary/25"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
          opened ? "bg-muted text-muted-foreground" : tone.icon
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-[13px] leading-5",
              opened ? "text-muted-foreground" : "font-semibold"
            )}
          >
            {n.title}
          </p>
          {opened ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
              <Check className="size-3" />
              開封済み
            </span>
          ) : (
            <button
              aria-label="開封済みにする"
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-60 transition hover:bg-background hover:text-foreground hover:opacity-100 group-hover:opacity-100"
              onClick={onOpen}
              title="開封済みにする"
              type="button"
            >
              <Check className="size-3.5" />
            </button>
          )}
        </div>
        <p
          className={cn(
            "mt-0.5 text-xs leading-5",
            opened ? "text-muted-foreground/80" : "text-foreground/80"
          )}
        >
          {n.message}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
            {date && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                <CalendarClock className="size-3" />
                {date}
              </span>
            )}
            {n.assignee && <span className="truncate">担当 {n.assignee}</span>}
          </div>
          <Link
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary text-xs transition-colors hover:bg-primary hover:text-primary-foreground"
            href={focusHref(n.link, n.focus, n.focusMonth)}
            onClick={onNavigate}
          >
            詳細を見る
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    </li>
  );
}
