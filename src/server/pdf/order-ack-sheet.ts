import PDFDocument from "pdfkit";
import { calcInvoiceTax } from "~/lib/invoice-tax";
import type { orders, projects, vendors } from "~/server/db/schema";
import { COMPANY, toWareki } from "./company";
import { useJpFont } from "./font";

type OrderRow = typeof orders.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type VendorRow = typeof vendors.$inferSelect;

type OrderAckMode = "order" | "ack";

/** 発注先に振り込む口座情報（発注先マスタ登録値）を注文書に確認用として印字する */
function formatVendorBank(vendor: VendorRow | null): string {
  if (!vendor?.bankNumber) {
    return "未登録（発注先マスタで登録してください）";
  }
  const type = vendor.bankType
    ? `${vendor.bankType}${vendor.bankNumber}`
    : vendor.bankNumber;
  return [vendor.bankName, vendor.bankBranch, type, vendor.bankHolder]
    .filter(Boolean)
    .join("　");
}

interface RenderOrderAckSheetArgs {
  fields: [string, string][];
  vendorAddr: string;
  vendorName: string;
  wareki: { y: number; m: number; d: number } | null;
}

/** 注文書／注文請書（添付テンプレートの項目リスト形式） */
export function renderOrderAckSheet(
  doc: PDFKit.PDFDocument,
  mode: OrderAckMode,
  { vendorName, vendorAddr, fields, wareki }: RenderOrderAckSheetArgs
): void {
  const L = 55;
  const R = 540;
  const W = R - L;
  const pageW = doc.page.width;
  let y = 56;
  const title = mode === "order" ? "注文書" : "注文請書";
  doc
    .fillColor("#000")
    .fontSize(22)
    .text(title, 0, y, { align: "center", characterSpacing: 8, width: pageW });
  doc
    .moveTo(pageW / 2 - 70, y + 30)
    .lineTo(pageW / 2 + 70, y + 30)
    .lineWidth(1)
    .strokeColor("#000")
    .stroke();
  y += 50;
  const recipient = `${mode === "order" ? vendorName || "-" : COMPANY.name}　殿`;
  doc.fontSize(12).text(recipient, L, y);
  y += 24;
  doc.fontSize(9);
  if (mode === "order") {
    doc.text("貴社に対し下記のとおりご注文申し上げます。", L, y);
    y += 13;
    doc.text(
      "なお、工事注文確認の為、注文請書のご返送よろしくお願いいたします。",
      L,
      y
    );
    y += 20;
  } else {
    doc.text("貴社に対し、下記のとおり工事注文お請け致します。", L, y);
    y += 20;
  }
  const wLabel = 165;
  const wVal = W - wLabel;
  const pad = 6;
  for (const [label, val] of fields) {
    const lbl = `□ ${label}`;
    const v = String(val ?? "");
    const lh = doc.fontSize(9).heightOfString(lbl, { width: wLabel - 2 * pad });
    const vh = doc.fontSize(9).heightOfString(v, { width: wVal - 2 * pad });
    const h = Math.max(lh, vh, 16) + 2 * pad;
    doc.lineWidth(0.8).strokeColor("#333");
    doc.rect(L, y, wLabel, h).stroke();
    doc.rect(L + wLabel, y, wVal, h).stroke();
    doc
      .fillColor("#000")
      .fontSize(9)
      .text(lbl, L + pad, y + pad, { width: wLabel - 2 * pad });
    doc.text(v, L + wLabel + pad, y + pad, { width: wVal - 2 * pad });
    y += h;
  }
  y += 24;
  const dateStr =
    mode === "order" && wareki
      ? `令和　${wareki.y}年 ${wareki.m}月　${wareki.d}日`
      : "令和　　　年　　　月　　　日";
  doc.fontSize(10).text(dateStr, L, y);
  y += 26;
  const who = mode === "order" ? "注文者" : "請負者";
  const sx = L + 30;
  const vx = sx + 70;
  doc.fontSize(10).text(who, L, y);
  const addr = mode === "order" ? COMPANY.addrOrder : vendorAddr || "";
  const comp = mode === "order" ? COMPANY.name : vendorName || "";
  const rep = mode === "order" ? COMPANY.rep : "";
  doc.fontSize(9);
  doc.text("住所", sx, y);
  doc.text(addr, vx, y, { width: R - vx - 40 });
  const ah = Math.max(
    doc.heightOfString(addr || " ", { width: R - vx - 40 }),
    14
  );
  y += ah + 8;
  doc.text("会社名", sx, y);
  doc.text(comp, vx, y, { width: R - vx - 40 });
  y += 20;
  doc.text("代表者名", sx, y);
  doc.text(rep, vx, y, { width: 180 });
  doc
    .lineWidth(0.8)
    .strokeColor("#999")
    .rect(R - 36, y - 6, 32, 32)
    .stroke();
  doc
    .fillColor("#999")
    .fontSize(8)
    .text("印", R - 36, y + 4, { width: 32, align: "center" });
  doc.fillColor("#000");
}

export interface OrderAckContent {
  fields: [string, string][];
  vendorAddr: string;
  vendorName: string;
}

/** 注文書・注文請書で共通の項目（工事ID・工事名・請負代金など）と宛先情報を組み立てる。 */
export function buildOrderAckContent(
  order: OrderRow,
  project: ProjectRow | null,
  vendor: VendorRow | null
): OrderAckContent {
  const net = Number(order.decided ?? order.planned ?? order.estimate) || 0;
  const tax = calcInvoiceTax(net);
  const total = net + tax;
  const period =
    order.periodStart || order.periodEnd
      ? `着手予定　${order.periodStart || "-"}　～　完成予定　${order.periodEnd || "-"}`
      : "-";
  const fields: [string, string][] = [
    ["工事ID", order.orderNo || "-"],
    ["担当者", order.assignee || "-"],
    ["工事名", project ? project.name : order.details || "-"],
    ["工事内容", order.category || order.details || "-"],
    ["工事場所", order.site || "-"],
    ["工事期間", period],
    ["検査及び引渡し時期\n　　（施主に対して）", order.handover || "-"],
    [
      "請負代金",
      `￥${total.toLocaleString()}（内消費税額　￥${tax.toLocaleString()}　）`,
    ],
    ["支払条件／支払方法", order.payment || "-"],
    ["お支払口座（ご確認用）", formatVendorBank(vendor)],
  ];
  return {
    fields,
    vendorAddr: vendor?.address || "",
    vendorName: vendor?.company || order.vendor || "-",
  };
}

/** 注文書PDF（1ページ目＝注文書、2ページ目＝注文請書の2ページ構成） */
export function buildPurchaseOrderPDF(
  order: OrderRow,
  project: ProjectRow | null,
  vendor: VendorRow | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    useJpFont(doc);
    const content = buildOrderAckContent(order, project, vendor);
    renderOrderAckSheet(doc, "order", {
      ...content,
      wareki: toWareki(new Date()),
    });
    doc.addPage();
    renderOrderAckSheet(doc, "ack", { ...content, wareki: null });
    doc.end();
  });
}
