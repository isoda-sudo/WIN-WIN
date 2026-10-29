// 実支払額の定義: 支払済みの発注明細は確定額（orders.decided）、それ以外は0。

export const ORDER_PAID_STATUS = "支払済み";

export function actualPaidAmount(order: {
  decided: number | null | undefined;
  paymentStatus: string | null | undefined;
}): number {
  return order.paymentStatus === ORDER_PAID_STATUS ? (order.decided ?? 0) : 0;
}
