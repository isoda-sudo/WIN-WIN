"use client";

import { useMemo, useState } from "react";
import { ScrollableTableSection } from "~/components/shared/scrollable-table";
import { Badge } from "~/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { canViewHistoryTable } from "~/lib/history-access";
import { api } from "~/trpc/react";

const TABLE_NAME_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "projects", label: "受注一覧" },
  { value: "orders", label: "工事計画" },
  { value: "customers", label: "顧客マスタ" },
  { value: "vendors", label: "発注先マスタ" },
  { value: "categories", label: "工種マスタ" },
  { value: "receipts", label: "売上・入金管理" },
  { value: "invitations", label: "アカウント発行" },
];

// 表示用ラベルはフィルタ選択肢より広い（invoices/usersはフィルタ対象では
// ないが、種別列の表示は必要。旧app history.html の TABLE_LABEL と同じ）
const TABLE_NAME_LABELS: Record<string, string> = {
  ...Object.fromEntries(TABLE_NAME_OPTIONS.map((o) => [o.value, o.label])),
  invoices: "受注一覧",
  users: "ログイン",
};

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "CREATE", label: "新規作成" },
  { value: "UPDATE", label: "更新" },
  { value: "DELETE", label: "削除" },
];

interface AuditLogDetails {
  category?: string;
  changes?: string[];
  company?: string;
  email?: string;
  invoiceNo?: string;
  name?: string;
}

function isAuditLogDetails(value: unknown): value is AuditLogDetails {
  return typeof value === "object" && value !== null;
}

function ActionBadge({ action }: { action: string | null }) {
  if (action === "CREATE") {
    return (
      <Badge
        className="border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
        variant="outline"
      >
        新規作成
      </Badge>
    );
  }
  if (action === "UPDATE") {
    return (
      <Badge
        className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
        variant="outline"
      >
        更新
      </Badge>
    );
  }
  if (action === "DELETE") {
    return <Badge variant="destructive">削除</Badge>;
  }
  return <Badge variant="secondary">{action ?? "-"}</Badge>;
}

export default function HistoryPage() {
  const [tableName, setTableName] = useState("all");
  const [action, setAction] = useState("all");
  const { data: me } = api.users.me.useQuery();

  const { data: logs, isLoading } = api.auditLogs.list.useQuery(
    tableName === "all" ? {} : { tableName }
  );

  // 対象画面ドロップダウンは、そのロールが閲覧できるtableNameのみ表示する
  // （サーバー側でも同じ判定を行うが、選べない選択肢を出さないため画面側でも絞る）。
  const tableNameOptions = useMemo(
    () =>
      TABLE_NAME_OPTIONS.filter(
        (o) =>
          o.value === "all" ||
          !me?.role ||
          canViewHistoryTable(me.role, o.value)
      ),
    [me?.role]
  );

  const filtered = useMemo(() => {
    if (!logs) {
      return [];
    }
    if (action === "all") {
      return logs;
    }
    return logs.filter((log) => log.action === action);
  }, [logs, action]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-bold text-2xl">履歴詳細</h1>
        <p className="text-muted-foreground text-sm">
          各画面での作成・更新・削除の操作履歴を確認します
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">対象画面</span>
          <Select onValueChange={setTableName} value={tableName}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tableNameOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">操作</span>
          <Select onValueChange={setAction} value={action}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">全 {filtered.length} 件</p>

      <ScrollableTableSection count={filtered.length}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>日時</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>種別</TableHead>
              <TableHead>対象</TableHead>
              <TableHead>変更内容</TableHead>
              <TableHead>操作者</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`skeleton-${i.toString()}`}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={6}
                >
                  履歴がありません
                </TableCell>
              </TableRow>
            )}
            {filtered.map((log) => {
              const details = isAuditLogDetails(log.details)
                ? log.details
                : undefined;
              const changes = details?.changes ?? [];
              // 旧app（public/history.html）と同じフォールバック順：
              // name → company → category → invoiceNo → email → #id
              const target =
                details?.name ||
                details?.company ||
                details?.category ||
                details?.invoiceNo ||
                details?.email ||
                `#${log.recordId ?? "-"}`;

              return (
                <TableRow key={log.id}>
                  <TableCell className="tabular-nums">
                    {log.createdAt
                      ? new Date(log.createdAt).toLocaleString("ja-JP")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <ActionBadge action={log.action} />
                  </TableCell>
                  <TableCell>
                    {(log.tableName && TABLE_NAME_LABELS[log.tableName]) ||
                      log.tableName ||
                      "-"}
                  </TableCell>
                  <TableCell>{target}</TableCell>
                  <TableCell>
                    {changes.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {changes.map((c, i) => (
                          <span key={`${log.id}-change-${i.toString()}`}>
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "変更なし"
                    )}
                  </TableCell>
                  <TableCell>{log.email ?? "システム"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollableTableSection>
    </div>
  );
}
