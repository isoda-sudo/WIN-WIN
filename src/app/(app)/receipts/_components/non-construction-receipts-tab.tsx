"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LoadMore } from "~/components/shared/load-more";
import { MonthNav } from "~/components/shared/month-nav";
import { SummaryCard } from "~/components/shared/summary-card";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import { useCurrentRole } from "~/lib/use-current-role";
import { useSortedPagedList } from "~/lib/use-sorted-paged-list";
import { currentYearMonth } from "~/lib/year-month";
import { api } from "~/trpc/react";
import {
  MiscReceiptDialogs,
  useMiscReceiptDialogState,
} from "./misc-receipt-dialogs";
import { NonConstructionReceiptFilterBar } from "./non-construction-receipts-filters";
import {
  buildReceiptBlocks,
  buildReceiptRows,
  buildReceiptSortOptions,
  computeBlockStats,
  computeReceiptSummary,
  isSkippedRow,
  matchesMonth,
  matchesReceiptFilters,
  type NonConstructionReceiptFilters,
  type NonConstructionReceiptSummary,
  rowStatus,
} from "./non-construction-receipts-rows";
import {
  NonConstructionReceiptTable,
  type ReceiptRowHandlers,
} from "./non-construction-receipts-table";
import { money, RECEIPT_STATUS_FILTER_OPTIONS } from "./receipt-common";
import { RecurringReceiptDefinitionsDialog } from "./recurring-receipt-definitions-dialog";
import { useReceiptStatusChange } from "./use-receipt-status-change";

const INITIAL_FILTERS: NonConstructionReceiptFilters = {
  includeUndated: false,
  keyword: "",
  statusFilter: "すべて",
};

function SummaryCards({ summary }: { summary: NonConstructionReceiptSummary }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <SummaryCard title="当月入金予定額" value={money(summary.scheduled)} />
      <SummaryCard title="当月入金実績額" value={money(summary.received)} />
      <SummaryCard
        title="当月予定件数"
        value={`${summary.unreceivedCount}件`}
      />
    </div>
  );
}

/**
 * 選択月の定期売上行（未入金）を先に作って売上IDを付与する。マウント中は月ごとに1回だけ
 * 呼ぶ（成功した月は再実行しない。失敗した月もループを避けるため再試行しない）。
 */
function useEnsureRecurringReceiptMonth(month: string, enabled: boolean) {
  const utils = api.useUtils();
  const ensure = api.recurringReceipts.ensureMonth.useMutation();
  const requested = useRef(new Set<string>());
  const { mutateAsync } = ensure;

  useEffect(() => {
    // 閲覧専用ロール（税理士・社労士）は書き込みを伴う売上ID付与を呼ばない。
    if (!enabled || requested.current.has(month)) {
      return;
    }
    requested.current.add(month);
    mutateAsync({ month })
      .then(async (res) => {
        if (res.created > 0) {
          await Promise.all([
            utils.recurringReceipts.monthView.invalidate(),
            utils.receipts.misc.list.invalidate(),
          ]);
        }
      })
      .catch((err: unknown) => {
        toast.error(
          friendlyErrorMessage(
            err as Parameters<typeof friendlyErrorMessage>[0],
            "売上IDの付与に失敗しました"
          )
        );
      });
  }, [enabled, month, mutateAsync, utils]);
}

/** 工事外売上タブのデータ取得（工事外売上＋指定月の定期売上＋区分マスタ）と一覧化。 */
function useNonConstructionReceiptData(month: string, masterEnabled: boolean) {
  const misc = api.receipts.misc.list.useQuery();
  const monthView = api.recurringReceipts.monthView.useQuery({
    month,
    includeSkipped: true,
  });
  // 収入区分マスタは閲覧専用ロール（税理士・社労士）は取得できない（行の区分名で代替）。
  const categories = api.receiptCategories.list.useQuery(undefined, {
    enabled: masterEnabled,
  });
  const rows = useMemo(
    () => buildReceiptRows(misc.data ?? [], monthView.data?.rows ?? []),
    [misc.data, monthView.data]
  );
  // マスタの並び（order → id）。取得失敗・未取得は空（全件が未分類ブロックになる）。
  const masterNames = useMemo(
    () => (categories.data ?? []).map((c) => c.name),
    [categories.data]
  );
  return {
    isError: misc.isError || monthView.isError,
    isLoading: misc.isLoading || monthView.isLoading,
    masterNames,
    refetch: () => Promise.all([misc.refetch(), monthView.refetch()]),
    rows,
  };
}

export function NonConstructionReceiptsTab() {
  const [month, setMonth] = useState(currentYearMonth);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [managing, setManaging] = useState(false);
  const { isReadOnly, ready } = useCurrentRole();
  useEnsureRecurringReceiptMonth(month, ready && !isReadOnly);
  const data = useNonConstructionReceiptData(month, ready && !isReadOnly);
  const dialogs = useMiscReceiptDialogState();
  const actions = useReceiptStatusChange();

  const filtered = useMemo(
    () => data.rows.filter((r) => matchesReceiptFilters(r, filters, month)),
    [data.rows, filters, month]
  );
  // ステータスの候補は、選択月に実在するものだけ（選択中の値は消さない）
  const statusOptions = useMemo(() => {
    const existing = new Set(
      data.rows
        .filter((r) => matchesMonth(r, month, false) && !isSkippedRow(r))
        .map((r) => rowStatus(r))
    );
    return RECEIPT_STATUS_FILTER_OPTIONS.filter(
      (s) => s === "すべて" || existing.has(s) || s === filters.statusFilter
    );
  }, [data.rows, month, filters.statusFilter]);
  const summary = useMemo(
    () => computeReceiptSummary(data.rows, month),
    [data.rows, month]
  );
  const sortOptions = useMemo(
    () => buildReceiptSortOptions(data.masterNames),
    [data.masterNames]
  );
  const paged = useSortedPagedList({
    options: sortOptions,
    resetKey: `${filters.statusFilter}|${filters.includeUndated}|${filters.keyword}|${month}`,
    rows: filtered,
  });
  const blockStats = useMemo(
    () => computeBlockStats(filtered, data.masterNames),
    [filtered, data.masterNames]
  );
  const blocks = useMemo(
    () => buildReceiptBlocks(paged.rows, data.masterNames),
    [paged.rows, data.masterNames]
  );

  // 自社口座マスタは管理者・経理だけが読める（閲覧のみのロールは口座名を出さない）
  const accounts = api.companyAccounts.list.useQuery(undefined, {
    enabled: !isReadOnly,
  });
  const handlers: ReceiptRowHandlers = {
    accountName: (id) =>
      (id == null ? null : accounts.data?.find((a) => a.id === id)?.name) ??
      "-",
    readOnly: isReadOnly,
    onEdit: dialogs.openEdit,
    onMiscNotesChange: actions.changeMiscNotes,
    onMiscStatusChange: actions.changeMisc,
    onRecurringStatusChange: actions.changeRecurring,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <MonthNav onChange={setMonth} yearMonth={month} />
        <SummaryCards summary={summary} />
      </div>

      <NonConstructionReceiptFilterBar
        filters={filters}
        onChange={setFilters}
        onCreate={dialogs.openCreate}
        onManageRecurring={() => setManaging(true)}
        readOnly={isReadOnly}
        statusOptions={statusOptions}
      />

      <NonConstructionReceiptTable
        blockStats={blockStats}
        blocks={blocks}
        count={filtered.length}
        handlers={handlers}
        isError={data.isError}
        isLoading={data.isLoading}
        onRetry={() => data.refetch()}
      />
      <LoadMore
        className="px-1 py-1"
        hasMore={paged.hasMore}
        onMore={paged.loadMore}
        shown={paged.shown}
        total={paged.total}
      />

      {!isReadOnly && <MiscReceiptDialogs state={dialogs.state} />}
      {!isReadOnly && (
        <RecurringReceiptDefinitionsDialog
          onOpenChange={setManaging}
          open={managing}
        />
      )}
    </div>
  );
}
