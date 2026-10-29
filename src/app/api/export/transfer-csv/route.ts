import { inArray } from "drizzle-orm";
import iconv from "iconv-lite";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { denyUnlessBankAccess } from "~/server/auth/route-guard";
import { resolveAuthedUser } from "~/server/auth/session";
import { buildZenginTransferCsv } from "~/server/csv/zengin-transfer";
import { db } from "~/server/db";
import { vendors } from "~/server/db/schema";

export const runtime = "nodejs";

const bodySchema = z.object({
  items: z.array(
    z.object({
      vendor: z.string(),
      amount: z.number().int().nonnegative().max(1_000_000_000_000),
    })
  ),
  transferDate: z.string().nullish(),
  // true のとき、Excelで開いても先頭の0（口座番号など）が落ちない形で出力する（銀行取込には使わない）
  excelSafe: z.boolean().optional(),
});

function filenameDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * 支払管理（工事支払）の画面表示行を発注先単位で合算し、全銀協 総合振込
 * フォーマット（カンマ区切り変形版）のCSVをShift-JISで返す。集計対象の
 * 選定（フィルタ）は画面側の状態が正なので、フィルタ後の行を items として
 * 受け取り、合算はここ（サーバー側）で行う。
 */
export async function POST(req: NextRequest) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const denied = denyUnlessBankAccess(user);
  if (denied) {
    return denied;
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "不正なリクエストです" },
      { status: 400 }
    );
  }

  const grouped = new Map<string, number>();
  for (const it of parsed.data.items) {
    if (!(it.vendor && it.amount > 0)) {
      continue;
    }
    grouped.set(it.vendor, (grouped.get(it.vendor) ?? 0) + it.amount);
  }
  if (grouped.size === 0) {
    return NextResponse.json(
      { error: "出力対象の支払データがありません" },
      { status: 400 }
    );
  }

  const vendorNames = [...grouped.keys()];
  const vendorRows = await db.query.vendors.findMany({
    where: inArray(vendors.company, vendorNames),
  });
  const vendorByName = new Map(vendorRows.map((v) => [v.company, v]));

  const items = vendorNames.map((name) => ({
    vendor: name,
    amount: grouped.get(name) ?? 0,
    vendorRow: vendorByName.get(name) ?? null,
  }));

  const transferDate = parsed.data.transferDate
    ? new Date(parsed.data.transferDate)
    : new Date();
  const csv = buildZenginTransferCsv(
    items,
    transferDate,
    {},
    {
      excelSafe: parsed.data.excelSafe === true,
    }
  );
  const encoded = iconv.encode(csv, "Shift_JIS");

  return new NextResponse(new Uint8Array(encoded), {
    headers: {
      "Content-Type": "text/csv; charset=Shift_JIS",
      "Content-Disposition": `attachment; filename="sougouhurikomi_${filenameDate(transferDate)}${parsed.data.excelSafe ? "_excel" : ""}.csv"`,
    },
  });
}
