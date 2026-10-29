"use client";

import type { TRPCClientErrorLike } from "@trpc/client";
import { toast } from "sonner";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import type { AppRouter } from "~/server/api/root";
import { api } from "~/trpc/react";
import type {
  MiscReceipt,
  RecurringReceiptMonthRow,
} from "./non-construction-receipts-rows";
import {
  planRecurringReceiptChange,
  RECURRING_RECEIPT_SUCCESS_MESSAGE,
  type RecurringReceiptStatusValue,
  type RecurringReceiptStep,
} from "./non-construction-receipts-status";
import { todayIso } from "./receipt-common";

/** 工事外売上タブの行ステータス変更（工事外売上・定期売上）。選択と同時に保存する。 */
export function useReceiptStatusChange() {
  const utils = api.useUtils();
  const refresh = () =>
    Promise.all([
      utils.recurringReceipts.monthView.invalidate(),
      utils.receipts.misc.list.invalidate(),
    ]);
  const misc = api.receipts.misc.update.useMutation();
  const markReceived = api.recurringReceipts.markReceived.useMutation();
  const markUnreceived = api.recurringReceipts.markUnreceived.useMutation();
  const skip = api.recurringReceipts.skipMonth.useMutation();
  const unskip = api.recurringReceipts.unskipMonth.useMutation();

  const fail = (err: unknown) =>
    toast.error(
      friendlyErrorMessage(
        err as TRPCClientErrorLike<AppRouter>,
        "更新に失敗しました"
      )
    );

  const changeMisc = async (m: MiscReceipt, status: "未入金" | "入金済") => {
    try {
      await misc.mutateAsync({ id: m.id, status });
      toast.success(
        status === "入金済" ? "入金済にしました" : "未入金に戻しました"
      );
    } catch (err) {
      fail(err);
    } finally {
      await refresh();
    }
  };

  const runStep = (step: RecurringReceiptStep, r: RecurringReceiptMonthRow) => {
    const base = { recurringId: r.recurringId, period: r.period };
    switch (step) {
      case "markReceived":
        return markReceived.mutateAsync({ ...base, receivedDate: todayIso() });
      case "markUnreceived":
        return markUnreceived.mutateAsync(base);
      case "skip":
        return skip.mutateAsync(base);
      default:
        return unskip.mutateAsync(base);
    }
  };

  const changeRecurring = async (
    r: RecurringReceiptMonthRow,
    target: RecurringReceiptStatusValue
  ) => {
    const steps = planRecurringReceiptChange(r, target);
    if (steps.length === 0) {
      return;
    }
    try {
      for (const step of steps) {
        await runStep(step, r);
      }
      toast.success(RECURRING_RECEIPT_SUCCESS_MESSAGE[target]);
    } catch (err) {
      fail(err);
    } finally {
      await refresh();
    }
  };

  const changeMiscNotes = async (m: MiscReceipt, notes: string) => {
    try {
      await misc.mutateAsync({ id: m.id, notes });
    } catch (err) {
      fail(err);
    } finally {
      await refresh();
    }
  };

  return { changeMisc, changeMiscNotes, changeRecurring };
}
