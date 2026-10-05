import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { orders } from "~/server/db/schema";

const ORDER_NO_DIGITS = 6;

/** 工事ID：注文自身の内部ID（重複の心配がない）をそのまま6桁ゼロ埋めした連番 */
export function workId(orderId: number): string {
  return String(orderId).padStart(ORDER_NO_DIGITS, "0");
}

type OrderRow = typeof orders.$inferSelect;

/** 工事IDが未採番なら、この時点（注文書の発行）で確定・採番する。採番済みならそのまま返す */
export async function ensureOrderNo(order: OrderRow): Promise<string> {
  if (order.orderNo) {
    return order.orderNo;
  }
  const orderNo = workId(order.id);
  await db.update(orders).set({ orderNo }).where(eq(orders.id, order.id));
  order.orderNo = orderNo;
  return orderNo;
}
