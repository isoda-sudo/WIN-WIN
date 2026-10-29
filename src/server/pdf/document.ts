import path from "node:path";
import PDFDocument from "pdfkit";
import { calcInvoiceTax } from "~/lib/invoice-tax";
import type { orders, projects } from "~/server/db/schema";
import { COMPANY, fmtDateJa } from "./company";
import { useJpFont } from "./font";
import {
  DEFAULT_INVOICE_BANK,
  type InvoiceBank,
  resolveInvoiceBank,
} from "./invoice-bank";

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DUE_DAYS = 30;
const PT_PER_MM = 72 / 25.4;

// A4印刷のレイアウト定数（pt）。下余白は12mm確保し、本文が下端に触れないようにする（大きすぎるとの指摘で20mmから縮小）。
const PAGE_MARGIN_TOP = 26;
const PAGE_MARGIN_SIDE = 34;
const PAGE_MARGIN_BOTTOM = Math.ceil(12 * PT_PER_MM);
const A4_HEIGHT = 841.89;
/** 描画してよい最下端のy座標（これより下には何も描かない） */
export const CONTENT_BOTTOM_Y = A4_HEIGHT - PAGE_MARGIN_BOTTOM;
export const BOTTOM_MARGIN_PT = PAGE_MARGIN_BOTTOM;

// フォント階層: 見出し > 小見出し > 本文(9〜10pt) > 注記
const FONT_TITLE = 22;
const FONT_TOTAL = 18;
const FONT_CLIENT = 13;
const FONT_HEADING = 10;
const FONT_BODY = 10;
const FONT_NOTE = 8;
const FONT_RIGHT = 10.5;
const FONT_RIGHT_NAME = 13;

const L = 34;
const R = 561;
const W = R - L;
const GRAY = "#6b7280";
const GRAY_DARK = "#374151";
const ACCENT = "#7030A0"; // Excelテンプレの紫

const SEAL_IMAGE_PATH = path.join(process.cwd(), "assets", "company-seal.png");
const SEAL_SIZE = 64;

/** 社印（角印）の画像（assets/company-seal.png）を、中心 (cx, cy) に描く。 */
export function drawCompanySeal(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number
): void {
  try {
    doc.image(SEAL_IMAGE_PATH, cx - SEAL_SIZE / 2, cy - SEAL_SIZE / 2, {
      width: SEAL_SIZE,
    });
  } catch (err) {
    // 画像が読めなくても帳票の出力は止めない（社印だけ省く）
    console.error("company seal load failed", err);
  }
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
    Number(o.estimate) || Number(o.planned) || Number(o.decided) || 0;
  // 請求書の既定金額は契約金額（projects.amount）。見積書は発注の見積額から。
  const total = isInvoice
    ? Number(project.amount) || 0
    : orderRows.reduce((s, o) => s + amt(o), 0);
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
  orderRows: OrderRow[];
  project: ProjectRow;
  title: string;
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
  { isInvoice, no, orderRows, project, title }: HeaderParams
): number {
  const pageW = doc.page.width;
  let y = 28;
  doc.fillColor(ACCENT).fontSize(FONT_TITLE).text(title, 0, y, {
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
  doc.fontSize(FONT_CLIENT).text(client, L, y);
  doc
    .moveTo(L, y + 20)
    .lineTo(L + Math.max(doc.widthOfString(client), 170), y + 20)
    .lineWidth(1)
    .strokeColor("#000")
    .stroke();

  // 右上の発行者ブロック。文字は大きめ・行間は広めにして、読み取りやすくする
  const RIGHT_W = 320;
  const RIGHT_X = R - RIGHT_W;
  let ry = y - 10;
  doc
    .fontSize(FONT_RIGHT)
    .fillColor("#000")
    .text((isInvoice ? "請求№　" : "見積№　") + no, RIGHT_X, ry, {
      width: RIGHT_W,
      align: "right",
    });
  ry += 18;
  if (isInvoice) {
    doc.text(`適格請求書発行事業者登録番号　${COMPANY.regNo}`, RIGHT_X, ry, {
      width: RIGHT_W,
      align: "right",
    });
    ry += 20;
  }
  // 発行者名は1回だけ印字する（「（株式会社ウィン）」の併記は削除済み）
  doc
    .fontSize(FONT_RIGHT_NAME)
    .text(COMPANY.name, RIGHT_X, ry, { width: RIGHT_W, align: "right" });
  ry += 24;
  doc.fontSize(FONT_RIGHT).fillColor(GRAY_DARK);
  for (const t of [COMPANY.zip, COMPANY.addrInv, COMPANY.tel]) {
    doc.text(t, RIGHT_X, ry, { width: RIGHT_W, align: "right" });
    ry += 17;
  }
  doc.fillColor("#000");
  if (isInvoice) {
    drawCompanySeal(doc, R - 32, ry + 34);
  }

  y += 54;
  doc.fontSize(FONT_BODY).text(`件名：${project.name || ""}`, L, y);
  y += 20;
  if (isInvoice) {
    const period = aggregatePeriod(orderRows);
    if (period) {
      doc.text(`工期：${period}`, L, y);
      y += 20;
    }
  }
  doc.text(
    isInvoice
      ? "下記のとおり御請求申し上げます。"
      : "下記のとおり御見積申し上げます。",
    L,
    y
  );
  return y + 24;
}

interface TotalsBoxParams {
  bank: InvoiceBank;
  due: Date;
  isInvoice: boolean;
  now: Date;
  total: number;
}

/** 合計金額ボックス・日付・（請求書のみ）振込先を描画し、続きの描画開始y座標を返す */
function drawTotalsBox(
  doc: PDFKit.PDFDocument,
  y: number,
  { bank, due, isInvoice, now, total }: TotalsBoxParams
): number {
  const boxW = 250;
  const boxH = 42;
  doc.lineWidth(1.2).strokeColor(ACCENT).rect(L, y, boxW, boxH).stroke();
  doc
    .fontSize(FONT_HEADING)
    .fillColor(ACCENT)
    .text(isInvoice ? "合計金額（税込）" : "御見積金額（税込）", L + 8, y + 6);
  doc
    .fontSize(FONT_TOTAL)
    .fillColor("#000")
    .text(`¥${total.toLocaleString()}`, L + 6, y + 20, {
      width: boxW - 12,
      align: "right",
    });
  doc.fillColor("#000").fontSize(FONT_BODY);
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
  let nextY = y + boxH + 14;
  if (isInvoice) {
    doc
      .fontSize(FONT_BODY)
      .text(
        `[振込先]　${bank.bank}　／　口座番号　${bank.account}　／　口座名義　${bank.holder}`,
        L,
        nextY
      );
    nextY += 18;
    doc
      .fontSize(FONT_NOTE)
      .fillColor(GRAY)
      .text(`※${COMPANY.feeNote}`, L, nextY);
    doc.fillColor("#000");
    nextY += 20;
  } else {
    nextY += 4;
  }
  return nextY;
}

const ITEM_COLS = [
  { k: "name" as const, label: "品　　名", w: 140, align: "left" as const },
  { k: "qty" as const, label: "数量", w: 36, align: "right" as const },
  { k: "unit" as const, label: "単位", w: 32, align: "center" as const },
  { k: "price" as const, label: "単価", w: 96, align: "right" as const },
  { k: "amount" as const, label: "金　額", w: 96, align: "right" as const },
  { k: "note" as const, label: "摘要", w: W - 400, align: "left" as const },
];
/** 明細1行の最小高さ。摘要・品名が折り返す場合は文字数に応じて行が伸びる */
/** 明細欄の最小行数。入力が少ないときの2行目以降は空白行にする。 */
const MIN_ITEM_ROWS = 5;
const BLANK_ROW_H = 28;
const ROW_H = 56;
/** 明細表の見出し行の高さ（明細行より低くする） */
const HEADER_ROW_H = 36;
const CELL_PAD_Y = 5;
const TOP_Y = 28;
const SUMMARY_ROW_H = 36;
const SUMMARY_ROWS = 4;
/** 小計ブロック（上余白10＋4行）の高さ */
const SUMMARY_BLOCK_H = 20 + SUMMARY_ROW_H * SUMMARY_ROWS;
/** 見積書の末尾注記の高さ（余白18＋1行） */
const ESTIMATE_NOTE_H = 30;

type ItemCellValues = Partial<Record<(typeof ITEM_COLS)[number]["k"], string>>;

function heightOf(doc: PDFKit.PDFDocument, width: number, text: string) {
  doc.fontSize(FONT_BODY);
  return doc.heightOfString(text, { width });
}

/** 折り返しを考慮した行の高さ（最小 minH）。 */
function measureItemRow(
  doc: PDFKit.PDFDocument,
  vals: ItemCellValues,
  minH = ROW_H
): number {
  doc.fontSize(FONT_BODY);
  let h = minH;
  for (const c of ITEM_COLS) {
    const v = vals[c.k];
    if (v) {
      h = Math.max(
        h,
        doc.heightOfString(String(v), { width: c.w - 8 }) + CELL_PAD_Y * 2
      );
    }
  }
  return Math.ceil(h);
}

/** 1行を描画し、その行の高さを返す。 */
function drawItemRow(
  doc: PDFKit.PDFDocument,
  y: number,
  vals: ItemCellValues,
  headerBg = false,
  minH = ROW_H
): number {
  const rowH = measureItemRow(doc, vals, minH);
  let cx = L;
  for (const c of ITEM_COLS) {
    if (headerBg) {
      doc.fillColor(ACCENT).rect(cx, y, c.w, rowH).fill();
    }
    doc
      .lineWidth(0.6)
      .strokeColor(headerBg ? ACCENT : "#999")
      .rect(cx, y, c.w, rowH)
      .stroke();
    const v = vals[c.k];
    if (v !== undefined && v !== "") {
      doc
        .fillColor(headerBg ? "#fff" : "#000")
        .fontSize(FONT_BODY)
        .text(
          String(v),
          cx + 4,
          y + (rowH - heightOf(doc, c.w - 8, String(v))) / 2,
          { align: c.align, width: c.w - 8 }
        );
    }
    cx += c.w;
  }
  return rowH;
}

/** 明細テーブルを描画し（ページまたぎ含む）、続きの描画開始y座標を返す */
function drawItemsTable(
  doc: PDFKit.PDFDocument,
  y: number,
  items: LineItem[],
  trailingH: number
): number {
  const headerVals = Object.fromEntries(ITEM_COLS.map((c) => [c.k, c.label]));
  let cursorY = y;
  cursorY += drawItemRow(doc, cursorY, headerVals, true, HEADER_ROW_H);
  // 明細は入力行数ぶん自動で増える。入力が少ないときは、帳票らしく2行目以降を空白行で埋める。
  const rowsN = Math.max(items.length, MIN_ITEM_ROWS);
  for (let i = 0; i < rowsN; i++) {
    const it = items[i];
    const minH = it ? ROW_H : BLANK_ROW_H;
    const vals: ItemCellValues = it
      ? {
          name: it.name,
          qty: String(it.qty),
          unit: it.unit,
          price: `¥${it.price.toLocaleString()}`,
          amount: `¥${it.amount.toLocaleString()}`,
          note: it.note,
        }
      : {};
    // 最終行は続く小計ブロックまで下余白内に収まる場合だけ同じページに置く
    const needed =
      measureItemRow(doc, vals, minH) + (i === rowsN - 1 ? trailingH : 0);
    if (cursorY + needed > CONTENT_BOTTOM_Y) {
      doc.addPage();
      cursorY = TOP_Y;
      cursorY += drawItemRow(doc, cursorY, headerVals, true, HEADER_ROW_H);
    }
    cursorY += drawItemRow(doc, cursorY, vals, false, minH);
  }
  return cursorY;
}

/** 小計／税率／消費税／合計の右寄せブロックを描画し、続きの描画開始y座標を返す */
function drawSummaryBlock(
  doc: PDFKit.PDFDocument,
  y: number,
  { subtotal, tax, total }: { subtotal: number; tax: number; total: number }
): number {
  let cursorY = y + 20;
  const tlX = R - 220;
  const totalRow = (label: string, val: string, bold = false) => {
    doc.lineWidth(bold ? 1 : 0.6).strokeColor(bold ? ACCENT : "#999");
    doc.rect(tlX, cursorY, 120, SUMMARY_ROW_H).stroke();
    doc.rect(tlX + 120, cursorY, 100, SUMMARY_ROW_H).stroke();
    const size = bold ? FONT_HEADING + 1 : FONT_BODY;
    doc
      .fillColor(bold ? ACCENT : "#000")
      .fontSize(size)
      .text(label, tlX + 6, cursorY + (bold ? 11 : 13));
    doc.fontSize(size).text(val, tlX + 124, cursorY + (bold ? 11 : 13), {
      width: 92,
      align: "right",
    });
    cursorY += SUMMARY_ROW_H;
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
  /** 発行時に保存した明細行。無ければ（旧データ）契約金額1行で再構成する */
  items?: CustomLineItem[] | null;
  subtotal: number;
  tax: number;
  total: number;
}

/** 明細行を決める。発行済み（frozen）は保存した明細、無ければ契約金額1行。 */
function resolveItems(
  isInvoice: boolean,
  project: ProjectRow,
  orderRows: OrderRow[],
  customItems: CustomLineItem[] | null | undefined,
  frozen: FrozenInvoiceValues | undefined
): LineItem[] {
  if (!frozen) {
    return computeLineItems(isInvoice, project, orderRows, customItems);
  }
  if (frozen.items && frozen.items.length > 0) {
    return computeLineItems(isInvoice, project, orderRows, frozen.items);
  }
  return [
    {
      amount: frozen.subtotal,
      name: project.name || "一式",
      note: "",
      price: frozen.subtotal,
      qty: 1,
      unit: "式",
    },
  ];
}

function buildDocumentPDF(
  kind: DocumentKind,
  project: ProjectRow,
  orderRows: OrderRow[],
  customItems: CustomLineItem[] | null | undefined,
  invoiceNo?: string,
  frozen?: FrozenInvoiceValues,
  bank: InvoiceBank = DEFAULT_INVOICE_BANK
): Promise<Buffer> {
  const isInvoice = kind === "invoice";
  // 発行済みの請求書を再表示・再ダウンロードする場合は、PDFファイル自体は保存
  // せず、発行時にinvoicesテーブルへ保持した金額・日付（frozen）から都度PDFを
  // 再構成する。ライブプレビュー（未発行のドラフト編集中）はfrozenを渡さず、
  // 現在の発注データ・本日日付から都度計算する（従来通り）。
  const items = resolveItems(
    isInvoice,
    project,
    orderRows,
    customItems,
    frozen
  );
  const subtotal = frozen
    ? frozen.subtotal
    : items.reduce((s, it) => s + it.amount, 0);
  const tax = frozen ? frozen.tax : calcInvoiceTax(subtotal);
  const total = frozen ? frozen.total : subtotal + tax;
  const now = frozen?.invoiceDate ?? new Date();
  const due =
    frozen?.dueDate ?? new Date(now.getTime() + DUE_DAYS * MS_PER_DAY);
  const title = isInvoice ? "請　求　書" : "見　積　書";
  // 請求書はDB(invoices.invoice_no)側の正式な番号をそのまま印字する（未確定の場合のみ
  // 案件IDベースの仮番号にフォールバック）。見積書はDB上に永続化される番号を持たない
  // ため、従来通り案件IDベースで生成する。
  const no = isInvoice
    ? (invoiceNo ?? `WW-${String(project.id).padStart(3, "0")}`)
    : `EST-${String(project.id).padStart(3, "0")}`;

  /** 指定の用紙サイズで1回描画する。最終のy座標とページ数も返す（1ページに収まる場合の用紙高さ調整に使う）。 */
  const renderPdf = (
    size: "A4" | [number, number],
    bottomMargin = PAGE_MARGIN_BOTTOM
  ): Promise<{ buf: Buffer; endY: number; pages: number }> =>
    new Promise((resolve, reject) => {
      let endY = 0;
      let pages = 1;
      const doc = new PDFDocument({
        bufferPages: true,
        margins: {
          bottom: bottomMargin,
          left: PAGE_MARGIN_SIDE,
          right: PAGE_MARGIN_SIDE,
          top: PAGE_MARGIN_TOP,
        },
        size,
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve({ buf: Buffer.concat(chunks), endY, pages }));
      doc.on("error", reject);
      useJpFont(doc);

      let y = drawDocumentHeader(doc, {
        isInvoice,
        no,
        orderRows,
        project,
        title,
      });
      y = drawTotalsBox(doc, y, { bank, due, isInvoice, now, total });
      y = drawItemsTable(
        doc,
        y,
        items,
        SUMMARY_BLOCK_H + (isInvoice ? 0 : ESTIMATE_NOTE_H)
      );
      y = drawSummaryBlock(doc, y, { subtotal, tax, total });

      if (!isInvoice) {
        y += 18;
        doc
          .fillColor(GRAY)
          .fontSize(FONT_NOTE)
          .text("※本見積書の有効期限は発行日より30日間です。", L, y);
        y += FONT_NOTE + 2;
      }
      endY = y;
      pages = doc.bufferedPageRange().count;
      doc.end();
    });

  // 用紙は常にA4。
  return renderPdf("A4").then((r) => r.buf);
}

export async function buildInvoicePDF(
  project: ProjectRow,
  orderRows: OrderRow[],
  customItems: CustomLineItem[] | null | undefined,
  invoiceNo?: string,
  frozen?: FrozenInvoiceValues
): Promise<Buffer> {
  // 振込先は案件の入金先（自社口座マスタ）から引く。未選択なら既定の口座。
  const bank = await resolveInvoiceBank(project.companyAccountId);
  return buildDocumentPDF(
    "invoice",
    project,
    orderRows,
    customItems,
    invoiceNo,
    frozen,
    bank
  );
}
