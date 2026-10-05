import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { projects, receipts } from "~/server/db/schema";

export const runtime = "nodejs";

interface CsvHeader {
  key: string;
  label: string;
}

const CSV_NEEDS_QUOTING_RE = /[",\n]/;
const CSV_QUOTE_RE = /"/g;
const YM_FULL_DATE_RE = /(\d{4})[-/年.\s]*(\d{1,2})/;
const YM_MONTH_ONLY_RE = /^\s*(\d{1,2})\s*月?\s*$/;
const YM_YEAR_RE = /(\d{4})/;
const YM_ISO_DATE_RE = /^(\d{4})-(\d{2})/;

// 旧app server.js の toCSV() を移植。カンマ/ダブルクォート/改行を含む値のみクォートし、
// Excelでの文字化けを避けるためBOMを先頭に付与する。
function escapeCsvValue(v: unknown): string {
  if (v === null || v === undefined) {
    return "";
  }
  const s = String(v);
  return CSV_NEEDS_QUOTING_RE.test(s)
    ? `"${s.replace(CSV_QUOTE_RE, '""')}"`
    : s;
}

function toCsv(rows: Record<string, unknown>[], headers: CsvHeader[]): string {
  const head = headers.map((h) => escapeCsvValue(h.label)).join(",");
  const body = rows
    .map((r) => headers.map((h) => escapeCsvValue(r[h.key])).join(","))
    .join("\n");
  return `﻿${head}\n${body}`;
}

// 旧app server.js の toYM() を移植。対象月度を「YYYY/MM」の年月形式に正規化
// （「6月」等の表記や入金日から補完）。
function toYM(v: unknown, dateStr: unknown): string {
  if (v) {
    const s = String(v);
    let m = s.match(YM_FULL_DATE_RE);
    if (m?.[1] && m[2]) {
      return `${m[1]}/${m[2].padStart(2, "0")}`;
    }
    m = s.match(YM_MONTH_ONLY_RE);
    if (m?.[1] && dateStr) {
      const y = (String(dateStr).match(YM_YEAR_RE) ?? [])[1];
      if (y) {
        return `${y}/${m[1].padStart(2, "0")}`;
      }
    }
  }
  const d = String(dateStr ?? "").match(YM_ISO_DATE_RE);
  if (d) {
    return `${d[1]}/${d[2]}`;
  }
  return (v as string | undefined) ?? "";
}

const EXPORT_TYPES = ["sales", "receipts"] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

function isExportType(value: string): value is ExportType {
  return (EXPORT_TYPES as readonly string[]).includes(value);
}

async function buildSalesCsv(): Promise<string> {
  // 案件数に比例したループ内SELECT（N+1）を避けるため、入金合計は一括GROUP BYで取得する
  const [projectRows, receiptSums] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(asc(projects.id)),
    db
      .select({
        projectId: receipts.projectId,
        total: sql<string>`coalesce(sum(${receipts.amount}), 0)`,
      })
      .from(receipts)
      .groupBy(receipts.projectId),
  ]);

  const receiptSumByProject = new Map<number, number>(
    receiptSums
      .filter((r) => r.projectId !== null)
      .map((r) => [r.projectId as number, Number(r.total) || 0])
  );

  const rows = projectRows.map((p) => {
    const received = receiptSumByProject.get(p.id) ?? 0;
    return {
      project_no: p.projectNo,
      name: p.name,
      client: p.client,
      contract: p.amount,
      received,
      outstanding: (Number(p.amount) || 0) - received,
      status: p.status,
    };
  });

  return toCsv(rows, [
    { key: "project_no", label: "案件ID" },
    { key: "name", label: "工事名" },
    { key: "client", label: "顧客" },
    { key: "contract", label: "請負金額" },
    { key: "received", label: "入金累計" },
    { key: "outstanding", label: "未収金" },
    { key: "status", label: "ステータス" },
  ]);
}

async function buildReceiptsCsv(): Promise<string> {
  const rows = await db
    .select({
      received_date: receipts.receivedDate,
      project_no: projects.projectNo,
      project_name: projects.name,
      amount: receipts.amount,
      month: receipts.month,
      memo: receipts.memo,
    })
    .from(receipts)
    .leftJoin(projects, eq(receipts.projectId, projects.id))
    .orderBy(desc(receipts.receivedDate));

  const csvRows = rows.map((r) => ({
    ...r,
    month: toYM(r.month, r.received_date),
  }));

  return toCsv(csvRows, [
    { key: "received_date", label: "入金日" },
    { key: "project_no", label: "案件ID" },
    { key: "project_name", label: "工事名" },
    { key: "amount", label: "入金額" },
    { key: "month", label: "対象月度" },
    { key: "memo", label: "備考" },
  ]);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { type } = await params;
  if (!isExportType(type)) {
    return NextResponse.json(
      { error: "不正なエクスポート種別です" },
      { status: 400 }
    );
  }

  let csv: string;
  let filename: string;
  if (type === "sales") {
    csv = await buildSalesCsv();
    filename = "sales.csv";
  } else {
    csv = await buildReceiptsCsv();
    filename = "receipts.csv";
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
