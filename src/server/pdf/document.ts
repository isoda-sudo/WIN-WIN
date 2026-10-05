import PDFDocument from "pdfkit";
import type { orders, projects } from "~/server/db/schema";
import { COMPANY, fmtDateJa } from "./company";
import { useJpFont } from "./font";

type OrderRow = typeof orders.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

export interface CustomLineItem {
  name?: string;
  note?: string;
  price?: number | string;
  qty?: number | string;
  unit?: string;
}

interface LineItem {
  amount: number;
  name: string;
  note: string;
  price: number;
  qty: number;
  unit: string;
}

type DocumentKind = "invoice" | "estimate";
export type InvoiceVariant = "sealed" | "unsealed" | "copy";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DUE_DAYS = 30;
const L = 50;
const R = 545;
const W = R - L;
const GRAY = "#6b7280";
const ACCENT = "#7030A0"; // Excelテンプレの紫

/** ダミーの電子印（角印）。社名と押印日（発行日＝本日付）を入れる */
export function drawDummySeal(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  date: Date | null
): void {
  const size = 54;
  const x = cx - size / 2;
  const y = cy - size / 2;
  doc.lineWidth(1.8).strokeColor("#c0392b").rect(x, y, size, size).stroke();
  doc
    .lineWidth(0.6)
    .rect(x + 4, y + 4, size - 8, size - 8)
    .stroke();
  doc.fillColor("#c0392b");
  doc.fontSize(9).text("株式会社", x, y + 10, { width: size, align: "center" });
  doc.fontSize(9).text("WIN WIN", x, y + 22, { width: size, align: "center" });
  const d = date || new Date();
  const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  doc
    .fontSize(7)
    .text(dateStr, x, y + size - 17, { width: size, align: "center" });
  doc.fillColor("#000");
}

// 工事の品目別内訳は出さず、品名＝案件名・金額＝総額の1行のみを表示する（議事録決定事項）
function computeLineItems(
  isInvoice: boolean,
  project: ProjectRow,
  orderRows: OrderRow[],
  customItems: CustomLineItem[] | null | undefined
): LineItem[] {
  if (Array.isArray(customItems) && customItems.length > 0) {
    return customItems.map((it) => {
      const qty = Number(it.qty) || 0;
      const price = Number(it.price) || 0;
      return {
        name: it.name || "",
        qty,
        unit: it.unit || "",
        price,
        amount: qty * price,
        note: it.note || "",
      };
    });
  }
  const amt = (o: OrderRow) =>
    isInvoice
      ? Number(o.decided) || 0
      : Number(o.estimate) || Number(o.planned) || Number(o.decided) || 0;
  const total = orderRows.reduce((s, o) => s + amt(o), 0);
  return [
    {
      name: project.name || "一式",
      qty: 1,
      unit: "式",
      price: total,
      amount: total,
      note: "",
    },
  ];
}

interface HeaderParams {
  isInvoice: boolean;
  no: string;
  now: Date;
  orderRows: OrderRow[];
  project: ProjectRow;
  title: string;
  variant: InvoiceVariant;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseOrderDate(v: string | null | undefined): Date | null {
  if (!v) {
    return null;
  }
  const d = new Date(v.replaceAll("/", "-"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 請求書に印字する工期。案件に紐づく各工事(orders)の期間のうち、
 * 最も早い開始日〜最も遅い終了日を集計して表示する（案件全体の
 * startDate/endDateは見積〜受注全体の見込み期間で実態とズレるため、
 * 実際の工事期間である orders.periodStart/periodEnd を集計する）。
 */
function aggregatePeriod(orderRows: OrderRow[]): string | null {
  const starts = orderRows
    .map((o) => parseOrderDate(o.periodStart))
    .filter((d): d is Date => d !== null);
  const ends = orderRows
    .map((o) => parseOrderDate(o.periodEnd))
    .filter((d): d is Date => d !== null);
  if (starts.length === 0 || ends.length === 0) {
    return null;
  }
  const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
  const maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
  return `${toDateOnly(minStart)}　〜　${toDateOnly(maxEnd)}`;
}

/** タイトル・宛先・自社情報・電子印・件名リードを描画し、続きの描画開始y座標を返す */
function drawDocumentHeader(
  doc: PDFKit.PDFDocument,
  { isInvoice, no, now, orderRows, project, title, variant }: HeaderParams
): number {
  const pageW = doc.page.width;
  let y = 50;
  doc.fillColor(ACCENT).fontSize(22).text(title, 0, y, {
    align: "center",
    characterSpacing: 8,
    width: pageW,
  });
  doc
    .moveTo(pageW / 2 - 78, y + 30)
    .lineTo(pageW / 2 + 78, y + 30)
    .lineWidth(1)
    .strokeColor(ACCENT)
    .stroke();
  doc.fillColor("#000");
  y += 54;
  const client = `${project.clientCompany || project.client || ""}　御中`;
  doc.fontSize(13).text(client, L, y);
  doc
    .moveTo(L, y + 20)
    .lineTo(L + Math.max(doc.widthOfString(client), 170), y + 20)
    .lineWidth(1)
    .strokeColor("#000")
    .stroke();

  let ry = y - 6;
  doc
    .fontSize(8)
    .fillColor("#000")
    .text((isInvoice ? "請求№　" : "見積№　") + no, R - 260, ry, {
      width: 260,
      align: "right",
    });
  ry += 11;
  if (isInvoice) {
    doc.text(`適格請求書発行事業者登録番号　${COMPANY.regNo}`, R - 260, ry, {
      width: 260,
      align: "right",
    });
    ry += 13;
  }
  doc
    .fontSize(11)
    .text(COMPANY.name, R - 250, ry, { width: 250, align: "right" });
  ry += 15;
  if (isInvoice) {
    doc
      .fontSize(8)
      .fillColor(GRAY)
      .text(`（${COMPANY.legalName}）`, R - 250, ry, {
        width: 250,
        align: "right",
      });
    ry += 11;
  }
  doc.fontSize(8).fillColor(GRAY);
  for (const t of [COMPANY.zip, COMPANY.addrInv, COMPANY.tel]) {
    doc.text(t, R - 250, ry, { width: 250, align: "right" });
    ry += 11;
  }
  doc.fillColor("#000");
  if (isInvoice && variant === "sealed") {
    drawDummySeal(doc, R - 28, ry + 25, now);
  }

  y += 48;
  doc.fontSize(9).text(`件名：${project.name || ""}`, L, y);
  y += 15;
  if (isInvoice) {
    const period = aggregatePeriod(orderRows);
    if (period) {
      doc.text(`工期：${period}`, L, y);
      y += 15;
    }
  }
  doc.text(
    isInvoice
      ? "下記のとおり御請求申し上げます。"
      : "下記のとおり御見積申し上げます。",
    L,
    y
  );
  return y + 20;
}

interface TotalsBoxParams {
  due: Date;
  isInvoice: boolean;
  now: Date;
  total: number;
}

/** 合計金額ボックス・日付・（請求書のみ）振込先を描画し、続きの描画開始y座標を返す */
function drawTotalsBox(
  doc: PDFKit.PDFDocument,
  y: number,
  { due, isInvoice, now, total }: TotalsBoxParams
): number {
  const boxW = 250;
  const boxH = 46;
  doc.lineWidth(1.2).strokeColor(ACCENT).rect(L, y, boxW, boxH).stroke();
  doc
    .fontSize(10)
    .fillColor(ACCENT)
    .text(isInvoice ? "合計金額（税込）" : "御見積金額（税込）", L + 8, y + 6);
  doc
    .fontSize(18)
    .fillColor("#000")
    .text(`¥${total.toLocaleString()}`, L + 6, y + 20, {
      width: boxW - 12,
      align: "right",
    });
  doc.fillColor("#000").fontSize(9);
  doc.text(
    (isInvoice ? "請求日：" : "見積日：") + fmtDateJa(now),
    L + boxW + 24,
    y + 8
  );
  doc.text(
    (isInvoice ? "お支払期限：" : "有効期限：") + fmtDateJa(due),
    L + boxW + 24,
    y + 26
  );
  let nextY = y + boxH + 8;
  if (isInvoice) {
    doc
      .fontSize(8)
      .text(
        `[振込先]　${COMPANY.bank}　／　口座番号　${COMPANY.account}　／　口座名義　${COMPANY.accountHolder}`,
        L,
        nextY
      );
    nextY += 12;
    doc.fontSize(7).fillColor(GRAY).text(`※${COMPANY.feeNote}`, L, nextY);
    doc.fillColor("#000");
    nextY += 14;
  } else {
    nextY += 4;
  }
  return nextY;
}

const ITEM_COLS = [
  { k: "name" as const, label: "品　　名", w: 180, align: "left" as const },
  { k: "qty" as const, label: "数量", w: 40, align: "right" as const },
  { k: "unit" as const, label: "単位", w: 35, align: "center" as const },
  { k: "price" as const, label: "単価", w: 80, align: "right" as const },
  { k: "amount" as const, label: "金　額", w: 85, align: "right" as const },
  { k: "note" as const, label: "摘要", w: W - 420, align: "left" as const },
];
const ROW_H = 22;
const PAGE_BREAK_Y = 700;
const TOP_Y = 50;

function drawItemRow(
  doc: PDFKit.PDFDocument,
  y: number,
  vals: Partial<Record<(typeof ITEM_COLS)[number]["k"], string>>,
  headerBg = false
): void {
  let cx = L;
  for (const c of ITEM_COLS) {
    if (headerBg) {
      doc.fillColor(ACCENT).rect(cx, y, c.w, ROW_H).fill();
    }
    doc
      .lineWidth(0.6)
      .strokeColor(headerBg ? ACCENT : "#999")
      .rect(cx, y, c.w, ROW_H)
      .stroke();
    const v = vals[c.k];
    if (v !== undefined && v !== "") {
      doc
        .fillColor(headerBg ? "#fff" : "#000")
        .fontSize(9)
        .text(String(v), cx + 4, y + 6, { width: c.w - 8, align: c.align });
    }
    cx += c.w;
  }
}

/** 明細テーブルを描画し（ページまたぎ含む）、続きの描画開始y座標を返す */
function drawItemsTable(
  doc: PDFKit.PDFDocument,
  y: number,
  items: LineItem[]
): number {
  let cursorY = y;
  drawItemRow(
    doc,
    cursorY,
    Object.fromEntries(ITEM_COLS.map((c) => [c.k, c.label])),
    true
  );
  cursorY += ROW_H;
  const minRows = 1;
  const rowsN = Math.max(items.length, minRows);
  for (let i = 0; i < rowsN; i++) {
    if (cursorY > PAGE_BREAK_Y) {
      doc.addPage();
      cursorY = TOP_Y;
    }
    const it = items[i];
    drawItemRow(
      doc,
      cursorY,
      it
        ? {
            name: it.name,
            qty: String(it.qty),
            unit: it.unit,
            price: `¥${it.price.toLocaleString()}`,
            amount: `¥${it.amount.toLocaleString()}`,
            note: it.note,
          }
        : {}
    );
    cursorY += ROW_H;
  }
  return cursorY;
}

/** 小計／税率／消費税／合計の右寄せブロックを描画し、続きの描画開始y座標を返す */
function drawSummaryBlock(
  doc: PDFKit.PDFDocument,
  y: number,
  { subtotal, tax, total }: { subtotal: number; tax: number; total: number }
): number {
  let cursorY = y + 10;
  const tlX = R - 220;
  const totalRow = (label: string, val: string, bold = false) => {
    doc.lineWidth(bold ? 1 : 0.6).strokeColor(bold ? ACCENT : "#999");
    doc.rect(tlX, cursorY, 120, 20).stroke();
    doc.rect(tlX + 120, cursorY, 100, 20).stroke();
    doc
      .fillColor(bold ? ACCENT : "#000")
      .fontSize(bold ? 11 : 9)
      .text(label, tlX + 6, cursorY + (bold ? 4 : 6));
    doc.fontSize(bold ? 11 : 9).text(val, tlX + 124, cursorY + (bold ? 4 : 6), {
      width: 92,
      align: "right",
    });
    cursorY += 20;
  };
  totalRow("小　　計", `¥${subtotal.toLocaleString()}`);
  totalRow("税率", "10%");
  totalRow("消費税", `¥${tax.toLocaleString()}`);
  totalRow("合　　計", `¥${total.toLocaleString()}`, true);
  return cursorY;
}

export interface FrozenInvoiceValues {
  dueDate: Date;
  invoiceDate: Date;
  subtotal: number;
  tax: number;
  total: number;
}

function buildDocumentPDF(
  kind: DocumentKind,
  project: ProjectRow,
  orderRows: OrderRow[],
  customItems: CustomLineItem[] | null | undefined,
  variant: InvoiceVariant = "sealed",
  invoiceNo?: string,
  frozen?: FrozenInvoiceValues
): Promise<Buffer> {
  const isInvoice = kind === "invoice";
  // 発行済みの請求書を再表示・再ダウンロードする場合は、PDFファイル自体は保存
  // せず、発行時にinvoicesテーブルへ保持した金額・日付（frozen）から都度PDFを
  // 再構成する。ライブプレビュー（未発行のドラフト編集中）はfrozenを渡さず、
  // 現在の発注データ・本日日付から都度計算する（従来通り）。
  const items = frozen
    ? [
        {
          amount: frozen.subtotal,
          name: project.name || "一式",
          note: "",
          price: frozen.subtotal,
          qty: 1,
          unit: "式",
        },
      ]
    : computeLineItems(isInvoice, project, orderRows, customItems);
  const subtotal = frozen
    ? frozen.subtotal
    : items.reduce((s, it) => s + it.amount, 0);
  const tax = frozen ? frozen.tax : Math.floor(subtotal * 0.1);
  const total = frozen ? frozen.total : subtotal + tax;
  const now = frozen?.invoiceDate ?? new Date();
  const due =
    frozen?.dueDate ?? new Date(now.getTime() + DUE_DAYS * MS_PER_DAY);
  const title =
    (isInvoice ? "請　求　書" : "見　積　書") +
    (isInvoice && variant === "copy" ? "（控）" : "");
  // 請求書はDB(invoices.invoice_no)側の正式な番号をそのまま印字する（未確定の場合のみ
  // 案件IDベースの仮番号にフォールバック）。見積書はDB上に永続化される番号を持たない
  // ため、従来通り案件IDベースで生成する。
  const no = isInvoice
    ? (invoiceNo ?? `WW-${String(project.id).padStart(3, "0")}`)
    : `EST-${String(project.id).padStart(3, "0")}`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    useJpFont(doc);

    let y = drawDocumentHeader(doc, {
      isInvoice,
      no,
      now,
      orderRows,
      project,
      title,
      variant,
    });
    y = drawTotalsBox(doc, y, { due, isInvoice, now, total });
    y = drawItemsTable(doc, y, items);
    y = drawSummaryBlock(doc, y, { subtotal, tax, total });

    if (!isInvoice) {
      y += 18;
      doc
        .fillColor(GRAY)
        .fontSize(8)
        .text("※本見積書の有効期限は発行日より30日間です。", L, y);
    }
    doc.end();
  });
}

export function buildInvoicePDF(
  project: ProjectRow,
  orderRows: OrderRow[],
  customItems: CustomLineItem[] | null | undefined,
  variant?: InvoiceVariant,
  invoiceNo?: string,
  frozen?: FrozenInvoiceValues
): Promise<Buffer> {
  return buildDocumentPDF(
    "invoice",
    project,
    orderRows,
    customItems,
    variant,
    invoiceNo,
    frozen
  );
}

export function buildEstimatePDF(
  project: ProjectRow,
  orderRows: OrderRow[],
  customItems?: CustomLineItem[] | null
): Promise<Buffer> {
  return buildDocumentPDF("estimate", project, orderRows, customItems);
}
