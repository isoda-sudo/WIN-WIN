import { type NextRequest, NextResponse } from "next/server";
import { REPORTING_ROLES } from "~/lib/roles";
import { getGrowthReportData } from "~/server/api/routers/dashboard";
import { resolveAuthedUser } from "~/server/auth/session";
import { buildGrowthReportPdf } from "~/server/pdf/growth-report";

export const runtime = "nodejs";

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** YYYY-MM 形式だけを通す（それ以外は未指定として扱う）。 */
function validYearMonth(value: string | null): string | undefined {
  return value && YEAR_MONTH_RE.test(value) ? value : undefined;
}

export async function GET(req: NextRequest) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // レポーティングを見られるロールだけ（tRPC 側の reportingProcedure と同じ）
  if (!(REPORTING_ROLES as readonly string[]).includes(user.role ?? "")) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const from = validYearMonth(req.nextUrl.searchParams.get("from"));
  const to = validYearMonth(req.nextUrl.searchParams.get("to"));
  const data = await getGrowthReportData(from, to);
  const pdfBuffer = await buildGrowthReportPdf(data);
  const disposition =
    req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="report-sales-profit.pdf"`,
    },
  });
}
