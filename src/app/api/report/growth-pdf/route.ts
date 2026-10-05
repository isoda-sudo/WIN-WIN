import { type NextRequest, NextResponse } from "next/server";
import { getGrowthReportData } from "~/server/api/routers/dashboard";
import { resolveAuthedUser } from "~/server/auth/session";
import { buildGrowthReportPdf } from "~/server/pdf/growth-report";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get("from") ?? undefined;
  const to = req.nextUrl.searchParams.get("to") ?? undefined;
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
