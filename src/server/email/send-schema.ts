import { z } from "zod";
import { MAX_ITEM_PRICE, MAX_ITEM_QTY } from "~/lib/invoice-tax";

const MAX_RECIPIENTS = 10;
const MAX_SUBJECT = 200;
const MAX_BODY = 5000;

/** メール送信APIで共通のTO/CC/件名/本文スキーマ。 */
export const mailFieldsSchema = z.object({
  to: z.array(z.string().email()).min(1).max(MAX_RECIPIENTS),
  cc: z.array(z.string().email()).max(MAX_RECIPIENTS).default([]),
  subject: z.string().min(1).max(MAX_SUBJECT),
  body: z.string().max(MAX_BODY).default(""),
});

const MAX_ITEMS = 200;
const MAX_NUM_STR = 50;
const priceSchema = z.union([
  z.number().min(0).max(MAX_ITEM_PRICE),
  z.string().max(MAX_NUM_STR),
]);
const qtySchema = z.union([
  z.number().min(0).max(MAX_ITEM_QTY),
  z.string().max(MAX_NUM_STR),
]);
const lineItemSchema = z.object({
  name: z.string().max(500).optional(),
  note: z.string().max(1000).optional(),
  price: priceSchema.optional(),
  qty: qtySchema.optional(),
  unit: z.string().max(50).optional(),
});

/** 見積書・請求書の明細（CustomLineItem）。 */
export const customItemsSchema = z
  .array(lineItemSchema)
  .max(MAX_ITEMS)
  .optional();

/** 請求書の送信は保存済みの請求書（invoices.id）だけを対象にする。画面の未保存明細は受け取らない。 */
const MAX_EXTRA_FILES = 5;
// リクエストボディ上限（Vercel 4.5MB）に収めるための追加ファイル1件あたりのbase64上限
const MAX_EXTRA_DATA_URL_CHARS = 4_200_000;

/** 送信画面でその場で追加した添付ファイル（見積書・報告書など）。 */
const extraFileSchema = z.object({
  dataUrl: z.string().startsWith("data:").max(MAX_EXTRA_DATA_URL_CHARS),
  filename: z.string().trim().min(1).max(200),
});

export const invoiceSendSchema = mailFieldsSchema.extend({
  /** 案件の格納書類（工事完了報告書など）のうち、添付するもの。 */
  documentIds: z
    .array(z.number().int().positive())
    .max(MAX_EXTRA_FILES)
    .default([]),
  /** 格納済みの見積書を添付するか。 */
  attachEstimate: z.boolean().default(false),
  extraFiles: z.array(extraFileSchema).max(MAX_EXTRA_FILES).default([]),
  invoiceId: z.number().int().positive(),
});

export const poSendSchema = mailFieldsSchema.extend({
  orderId: z.number().int().positive(),
});

/** zodエラーから利用者向けの1行メッセージを作る。 */
export function formatSendError(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.join(".") || "リクエスト";
  return `入力内容が不正です（${path}: ${issue?.message ?? "不正な値"}）`;
}
