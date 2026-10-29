"use client";

import { useEffect, useMemo, useState } from "react";
import { LoadMore } from "~/components/shared/load-more";
import {
  ScrollableTableSection,
  TableErrorRow,
} from "~/components/shared/scrollable-table";
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
import { LIST_PAGE_SIZE } from "~/lib/list-sort";
import { api, type RouterOutputs } from "~/trpc/react";

type AuditLog = RouterOutputs["auditLogs"]["list"]["rows"][number];

const TABLE_NAME_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "projects", label: "受注一覧" },
  { value: "orders", label: "工事計画" },
  { value: "customers", label: "顧客マスタ" },
  { value: "vendors", label: "発注先マスタ" },
  { value: "categories", label: "工種マスタ" },
  { value: "banks", label: "銀行マスタ" },
  { value: "invitations", label: "アカウント発行" },
  { value: "company_accounts", label: "自社口座" },
  { value: "transfer_fee_rules", label: "振込手数料ルール" },
  { value: "payment_categories", label: "支払い種別マスタ" },
  { value: "receipt_categories", label: "収入区分マスタ" },
  { value: "misc_payments", label: "工事外支払い" },
  { value: "recurring_payments", label: "定期支払い" },
  { value: "misc_receipts", label: "工事外売上" },
  { value: "recurring_receipts", label: "定期売上" },
  { value: "users", label: "アカウント" },
];

// 表示用ラベルはフィルタ選択肢より広い（invoices/usersはフィルタ対象では
// ないが、種別列の表示は必要。旧app history.html の TABLE_LABEL と同じ）
const TABLE_NAME_LABELS: Record<string, string> = {
  ...Object.fromEntries(TABLE_NAME_OPTIONS.map((o) => [o.value, o.label])),
  invoices: "受注一覧",
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

  const filters = {
    ...(tableName === "all" ? {} : { tableName }),
    ...(action === "all" ? {} : { action }),
  };
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = api.auditLogs.list.useInfiniteQuery(filters, {
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    initialCursor: 0,
  });
  // 絞り込み候補は、履歴に実在する対象画面・操作だけ（選択中の値は消さない）
  const { data: facets } = api.auditLogs.facets.useQuery(
    tableName === "all" ? {} : { tableName }
  );

  const filtered = useMemo<AuditLog[]>(
    () => (data?.pages ?? []).flatMap((p) => p.rows),
    [data]
  );
  const total = data?.pages[0]?.total ?? 0;

  // 画面に出す件数は20件ずつ増やす。読み込み済みを超える分はサーバーから次の100件を取得する。
  const [visible, setVisible] = useState(LIST_PAGE_SIZE);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 絞り込み変更時のリセットが目的
  useEffect(() => {
    setVisible(LIST_PAGE_SIZE);
  }, [tableName, action]);
  useEffect(() => {
    if (visible > filtered.length && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [
    visible,
    filtered.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);
  const shown = Math.min(visible, filtered.length);

  // 対象画面ドロップダウンは、そのロールが閲覧できるtableNameのみ表示する
  // （サーバー側でも同じ判定を行うが、選べない選択肢を出さないため画面側でも絞る）。
  const tableNameOptions = useMemo(() => {
    const used = new Set(facets?.tableNames ?? []);
    return TABLE_NAME_OPTIONS.filter(
      (o) =>
        o.value === "all" ||
        o.value === tableName ||
        (used.has(o.value) &&
          (!me?.role || canViewHistoryTable(me.role, o.value)))
    );
  }, [me?.role, facets, tableName]);
  const actionOptions = useMemo(() => {
    const used = new Set(facets?.actions ?? []);
    return ACTION_OPTIONS.filter(
      (o) => o.value === "all" || o.value === action || used.has(o.value)
    );
  }, [facets, action]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-bold text-2xl">履歴詳細</h1>
        <p className="text-muted-foreground text-sm">
          各画面での作成・更新・削除の操作履歴を確認します
        </p>
      </div>

      <div className="flex flex-nowrap items-end gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap text-muted-foreground text-xs">
            対象画面
          </span>
          <Select onValueChange={setTableName} value={tableName}>
            <SelectTrigger className="h-8 w-36" size="sm">
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
        <div className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap text-muted-foreground text-xs">
            操作
          </span>
          <Select onValueChange={setAction} value={action}>
            <SelectTrigger className="h-8 w-28" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {actionOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">全 {total} 件</p>

      <ScrollableTableSection count={total}>
        <Table className="text-xs [&_td]:px-1 [&_th]:px-1">
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
            {isError && <TableErrorRow colSpan={6} onRetry={() => refetch()} />}
            {!(isLoading || isError) && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={6}
                >
                  履歴がありません
                </TableCell>
              </TableRow>
            )}
            {filtered.slice(0, visible).map((log) => {
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
                            {localizeChange(c)}
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
      <LoadMore
        className="px-1 py-1"
        hasMore={shown < total}
        onMore={() => setVisible((v) => v + LIST_PAGE_SIZE)}
        shown={shown}
        total={total}
      />
    </div>
  );
}

const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  active: "有効",
  deleted: "削除済み",
  suspended: "停止",
};
const STATUS_WORD_RE = /\b(active|suspended|deleted)\b/g;

/** 以前の履歴に英語（active / suspended）のまま残っているアカウントのステータスを、日本語で表示する。 */
function localizeChange(change: string): string {
  return change.startsWith("ステータス変更:")
    ? change.replace(STATUS_WORD_RE, (w) => ACCOUNT_STATUS_LABEL[w] ?? w)
    : change;
}
