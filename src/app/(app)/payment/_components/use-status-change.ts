"use client";

import type { TRPCClientErrorLike } from "@trpc/client";
import { toast } from "sonner";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import type { AppRouter } from "~/server/api/root";
import { api } from "~/trpc/react";
import type { MiscPayment, RecurringMonthRow } from "./non-construction-rows";
import {
  planRecurringChange,
  RECURRING_SUCCESS_MESSAGE,
  type RecurringStatusValue,
  type RecurringStep,
} from "./non-construction-status";
import { todayIso } from "./payment-common";

/** 工事外タブの行ステータス変更（案件外支払・定期支払い）。選択と同時に保存する。 */
export function useStatusChange() {
  const utils = api.useUtils();
  const refresh = () =>
    Promise.all([
      utils.recurringPayments.monthView.invalidate(),
      utils.recurringPayments.yearView.invalidate(),
      utils.payments.misc.list.invalidate(),
    ]);
  const misc = api.payments.misc.update.useMutation();
  const markPaid = api.recurringPayments.markPaid.useMutation();
  const markPlanned = api.recurringPayments.markPlanned.useMutation();
  const skip = api.recurringPayments.skipMonth.useMutation();
  const unskip = api.recurringPayments.unskipMonth.useMutation();

  const fail = (err: unknown) =>
    toast.error(
      friendlyErrorMessage(
        err as TRPCClientErrorLike<AppRouter>,
        "更新に失敗しました"
      )
    );

  const changeMisc = async (m: MiscPayment, status: string) => {
    try {
      await misc.mutateAsync({ id: m.id, status });
      toast.success(
        status === "支払済み" ? "支払済みにしました" : "未払いに戻しました"
      );
    } catch (err) {
      fail(err);
    } finally {
      await refresh();
    }
  };

  const runStep = (step: RecurringStep, r: RecurringMonthRow) => {
    const base = { recurringId: r.recurringId, period: r.period };
    switch (step) {
      case "markPaid":
        return markPaid.mutateAsync({ ...base, paidDate: todayIso() });
      case "markPlanned":
        return markPlanned.mutateAsync(base);
      case "skip":
        return skip.mutateAsync(base);
      default:
        return unskip.mutateAsync(base);
    }
  };

  const changeRecurring = async (
    r: RecurringMonthRow,
    target: RecurringStatusValue
  ) => {
    const steps = planRecurringChange(r, target);
    if (steps.length === 0) {
      return;
    }
    try {
      for (const step of steps) {
        await runStep(step, r);
      }
      toast.success(RECURRING_SUCCESS_MESSAGE[target]);
    } catch (err) {
      fail(err);
    } finally {
      await refresh();
    }
  };

  const changeMiscNotes = async (m: MiscPayment, notes: string) => {
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
