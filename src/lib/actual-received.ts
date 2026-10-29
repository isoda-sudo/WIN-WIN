// 実入金額の定義: 全額入金済みの案件は契約金額（projects.amount）、それ以外は0。
// 入金額は手入力せず、入金ステータスから導出する（支払側の actual-paid.ts と同じ考え方）。

import { FULLY_PAID_PROJECT_STATUS } from "~/lib/pay-status";

export function actualReceivedAmount(project: {
  amount: number | null | undefined;
  status: string | null | undefined;
}): number {
  return project.status === FULLY_PAID_PROJECT_STATUS
    ? (project.amount ?? 0)
    : 0;
}
