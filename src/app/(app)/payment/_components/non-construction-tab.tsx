"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LoadMore } from "~/components/shared/load-more";
import { MonthNav } from "~/components/shared/month-nav";
import { SummaryCard } from "~/components/shared/summary-card";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import { useCurrentRole } from "~/lib/use-current-role";
import { currentYearMonth } from "~/lib/year-month";
import { api } from "~/trpc/react";
import { MiscPaymentDialogs, useMiscDialogState } from "./misc-payment-dialogs";
import { NonConstructionFilterBar } from "./non-construction-filters";
import {
  buildRows,
  computeSummary,
  isSkippedRow,
  matchesFilters,
  matchesMonth,
  NON_CONSTRUCTION_SORT_OPTIONS,
  type NonConstructionFilters,
  type NonConstructionSummary,
  rowAmount,
  rowCategory,
  rowStatus,
} from "./non-construction-rows";
import {
  NonConstructionTable,
  type RowHandlers,
} from "./non-construction-table";
import { money, STATUS_FILTER_OPTIONS } from "./payment-common";
import { RecurringDefinitionsDialog } from "./recurring-definitions-dialog";
import { useCategoryBlockPaging } from "./use-category-block-paging";
import { useStatusChange } from "./use-status-change";

const INITIAL_FILTERS: NonConstructionFilters = {
  includeNoDue: false,
  keyword: "",
  statusFilter: "すべて",
};

function SummaryCards({ summary }: { summary: NonConstructionSummary }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <SummaryCard
        title="当月支払予定額（手数料込み）"
        value={money(summary.scheduled)}
      />
      <SummaryCard
        title="当月支払実績額（手数料込み）"
        value={money(summary.paid)}
      />
      <SummaryCard title="当月予定件数" value={`${summary.unpaidCount}件`} />
    </div>
  );
}

/**
 * 選択月の定期支払い行（未払い）を先に作って支払IDを付与する。マウント中は月ごとに1回だけ
 * 呼ぶ（成功した月は再実行しない。失敗した月もループを避けるため再試行しない）。
 */
function useEnsureRecurringMonth(month: string, enabled: boolean) {
  const utils = api.useUtils();
  const ensure = api.recurringPayments.ensureMonth.useMutation();
  const requested = useRef(new Set<string>());
  const { mutateAsync } = ensure;

  useEffect(() => {
    // 閲覧専用ロール（税理士・社労士）は書き込みを伴う支払ID付与を呼ばない。
    if (!enabled || requested.current.has(month)) {
      return;
    }
    requested.current.add(month);
    mutateAsync({ month })
      .then(async (res) => {
        if (res.created > 0) {
          await Promise.all([
            utils.recurringPayments.monthView.invalidate(),
            utils.recurringPayments.yearView.invalidate(),
            utils.payments.misc.list.invalidate(),
          ]);
        }
      })
      .catch((err: unknown) => {
        toast.error(
          friendlyErrorMessage(
            err as Parameters<typeof friendlyErrorMessage>[0],
            "支払IDの付与に失敗しました"
          )
        );
      });
  }, [enabled, month, mutateAsync, utils]);
}

/** 工事外タブのデータ取得（案件外支払＋指定月の定期支払い）と一覧化。 */
function useNonConstructionData(month: string) {
  const misc = api.payments.misc.list.useQuery();
  const monthView = api.recurringPayments.monthView.useQuery({
    month,
    includeSkipped: true,
  });
  const rows = useMemo(
    () => buildRows(misc.data ?? [], monthView.data?.rows ?? []),
    [misc.data, monthView.data]
  );
  return {
    isError: misc.isError || monthView.isError,
    isLoading: misc.isLoading || monthView.isLoading,
    refetch: () => Promise.all([misc.refetch(), monthView.refetch()]),
    rows,
  };
}

export function NonConstructionTab() {
  const [month, setMonth] = useState(currentYearMonth);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [managing, setManaging] = useState(false);
  const { isReadOnly, ready } = useCurrentRole();
  useEnsureRecurringMonth(month, ready && !isReadOnly);
  const data = useNonConstructionData(month);
  const dialogs = useMiscDialogState();
  const actions = useStatusChange();

  // 支払い種別マスタは閲覧専用ロール（税理士・社労士）は取得できない。
  // 区分ブロックは行の区分名から作られるため、マスタなしでも表示できる。
  const categories = api.paymentCategories.list.useQuery(undefined, {
    enabled: ready && !isReadOnly,
  });
  const masterNames = useMemo(
    () => (categories.data ?? []).map((c) => c.name),
    [categories.data]
  );
  const filtered = useMemo(
    () => data.rows.filter((r) => matchesFilters(r, filters, month)),
    [data.rows, filters, month]
  );
  // ステータスの候補は、選択月に実在するものだけ（選択中の値は消さない）
  const statusOptions = useMemo(() => {
    const existing = new Set(
      data.rows
        .filter((r) => matchesMonth(r, month, false) && !isSkippedRow(r))
        .map((r) => rowStatus(r))
    );
    return STATUS_FILTER_OPTIONS.filter(
      (s) => s === "すべて" || existing.has(s) || s === filters.statusFilter
    );
  }, [data.rows, month, filters.statusFilter]);
  const summary = useMemo(
    () => computeSummary(data.rows, month),
    [data.rows, month]
  );
  const paged = useCategoryBlockPaging({
    getAmount: rowAmount,
    getCategory: rowCategory,
    masterNames,
    options: NON_CONSTRUCTION_SORT_OPTIONS,
    resetKey: `${filters.statusFilter}|${filters.includeNoDue}|${filters.keyword}|${month}`,
    rows: filtered,
  });

  const [showFee, setShowFee] = useShowFeeColumn();
  const handlers: RowHandlers = {
    readOnly: isReadOnly,
    onEdit: dialogs.openEdit,
    onMiscNotesChange: actions.changeMiscNotes,
    onMiscStatusChange: actions.changeMisc,
    onRecurringStatusChange: actions.changeRecurring,
    showFee,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <MonthNav onChange={setMonth} yearMonth={month} />
        <SummaryCards summary={summary} />
      </div>

      <NonConstructionFilterBar
        filters={filters}
        onChange={setFilters}
        onCreate={dialogs.openCreate}
        onManageRecurring={() => setManaging(true)}
        onShowFeeChange={setShowFee}
        readOnly={isReadOnly}
        showFee={showFee}
        statusOptions={statusOptions}
      />

      <NonConstructionTable
        blocks={paged.blocks}
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

      {!isReadOnly && <MiscPaymentDialogs state={dialogs.state} />}
      {!isReadOnly && (
        <RecurringDefinitionsDialog
          onOpenChange={setManaging}
          open={managing}
        />
      )}
    </div>
  );
}

const SHOW_FEE_STORAGE_KEY = "payment-misc-show-fee";

/** 工事外支払の振込手数料列の表示/非表示（ブラウザに記憶。初期は非表示）。 */
function useShowFeeColumn(): [boolean, (v: boolean) => void] {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(SHOW_FEE_STORAGE_KEY) === "1");
    } catch {
      /* noop：localStorage無効時は非表示のまま */
    }
  }, []);
  const update = (v: boolean) => {
    setShow(v);
    try {
      localStorage.setItem(SHOW_FEE_STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* noop */
    }
  };
  return [show, update];
}
