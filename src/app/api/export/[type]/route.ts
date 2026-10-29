import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { actualReceivedAmount } from "~/lib/actual-received";
import { jstDateString } from "~/lib/paid-at";
import { SUPERSEDED_STATUS } from "~/lib/superseded";
import { resolveAuthedUser } from "~/server/auth/session";
import { escapeCsvValue } from "~/server/csv/csv-escape";
import { db } from "~/server/db";
import { orders, projects } from "~/server/db/schema";

export const runtime = "nodejs";

interface CsvHeader {
  key: string;
  label: string;
}

// 旧app server.js の toCsv() を移植。カンマ/ダブルクォート/改行を含む値のみクォートし、
// Excelでの文字化けを避けるためBOMを先頭に付与する。先頭が0の数字列などはExcelで桁が落ちない形にする。
function toCsv(rows: Record<string, unknown>[], headers: CsvHeader[]): string {
  const head = headers.map((h) => escapeCsvValue(h.label)).join(",");
  const body = rows
    .map((r) => headers.map((h) => escapeCsvValue(r[h.key])).join(","))
    .join("\n");
  return `﻿${head}\n${body}`;
}

const EXPORT_TYPES = ["sales", "plan", "payments"] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

function isExportType(value: string): value is ExportType {
  return (EXPORT_TYPES as readonly string[]).includes(value);
}

async function buildSalesCsv(): Promise<string> {
  // 入金額は手入力せず、入金ステータス（projects.status）から導出する（入金済 → 契約金額、それ以外 → 0）
  const projectRows = await db
    .select()
    .from(projects)
    // オーダー移行（コピー元）案件は、コピー先と二重計上になるため除く
    .where(
      and(
        isNull(projects.deletedAt),
        sql`${projects.status} is distinct from ${SUPERSEDED_STATUS}`
      )
    )
    .orderBy(asc(projects.id));

  const rows = projectRows.map((p) => ({
    project_no: p.projectNo,
    name: p.name,
    client: p.client,
    contract: p.amount,
    received: actualReceivedAmount(p),
    paid_date: jstDateString(p.paidAt),
    status: p.status,
  }));

  return toCsv(rows, [
    { key: "project_no", label: "案件ID" },
    { key: "name", label: "工事名" },
    { key: "client", label: "顧客" },
    { key: "contract", label: "請負金額" },
    { key: "received", label: "入金額" },
    { key: "paid_date", label: "入金日" },
    { key: "status", label: "ステータス" },
  ]);
}

/** 発注（工事計画）と案件を結合して返す。削除済み案件の発注は除く。projectId 指定でその案件だけ。 */
async function loadOrderRows(projectId: number | null) {
  const rows = await db
    .select({ order: orders, project: projects })
    .from(orders)
    .innerJoin(projects, eq(orders.projectId, projects.id))
    .where(
      and(
        isNull(projects.deletedAt),
        sql`${projects.status} is distinct from ${SUPERSEDED_STATUS}`
      )
    )
    .orderBy(asc(projects.id), asc(orders.id));
  return projectId ? rows.filter((r) => r.project.id === projectId) : rows;
}

async function buildPlanCsv(projectId: number | null): Promise<string> {
  const rows = (await loadOrderRows(projectId)).map(
    ({ order: o, project: p }) => ({
      project_no: p.projectNo,
      name: p.name,
      client: p.client,
      category: o.category,
      vendor: o.vendor,
      estimate: o.estimate,
      planned: o.planned,
      decided: o.decided,
      status: o.status,
      start: o.periodStart,
      end: o.periodEnd,
      assignee: o.assignee,
      order_no: o.orderNo,
    })
  );
  return toCsv(rows, [
    { key: "project_no", label: "案件ID" },
    { key: "name", label: "工事名" },
    { key: "client", label: "顧客" },
    { key: "category", label: "工種" },
    { key: "vendor", label: "発注先" },
    { key: "estimate", label: "見積金額" },
    { key: "planned", label: "予定金額" },
    { key: "decided", label: "決定金額" },
    { key: "status", label: "発注ステータス" },
    { key: "start", label: "着手予定" },
    { key: "end", label: "完成予定" },
    { key: "assignee", label: "担当者" },
    { key: "order_no", label: "発注番号" },
  ]);
}

async function buildPaymentsCsv(): Promise<string> {
  const rows = (await loadOrderRows(null)).map(({ order: o, project: p }) => ({
    payment_no: o.paymentNo,
    project_no: p.projectNo,
    name: p.name,
    category: o.category,
    vendor: o.vendor,
    decided: o.decided,
    fee: o.transferFee,
    terms: o.payment,
    due: o.paymentDate,
    status: o.paymentStatus,
    paid_on: o.paidOn,
    notes: o.paymentNotes,
  }));
  return toCsv(rows, [
    { key: "payment_no", label: "支払番号" },
    { key: "project_no", label: "案件ID" },
    { key: "name", label: "工事名" },
    { key: "category", label: "工種" },
    { key: "vendor", label: "発注先" },
    { key: "decided", label: "支払金額" },
    { key: "fee", label: "振込手数料" },
    { key: "terms", label: "支払条件" },
    { key: "due", label: "支払予定日" },
    { key: "status", label: "支払ステータス" },
    { key: "paid_on", label: "支払日" },
    { key: "notes", label: "備考" },
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

  const projectIdParam = Number(req.nextUrl.searchParams.get("projectId"));
  const projectId =
    Number.isInteger(projectIdParam) && projectIdParam > 0
      ? projectIdParam
      : null;
  const builders: Record<ExportType, () => Promise<string>> = {
    sales: buildSalesCsv,
    plan: () => buildPlanCsv(projectId),
    payments: buildPaymentsCsv,
  };
  const csv = await builders[type]();

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}.csv"`,
    },
  });
}
