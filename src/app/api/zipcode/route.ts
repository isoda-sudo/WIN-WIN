import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthedUser } from "~/server/auth/session";

export const runtime = "nodejs";

const ZIP_RE = /^\d{7}$/;

interface ZipcloudResult {
  address1: string;
  address2: string;
  address3: string;
}
interface ZipcloudResponse {
  results: ZipcloudResult[] | null;
  status: number;
}

/** 郵便番号（ハイフン任意）から住所を検索する（zipcloud APIをサーバー側で中継）。 */
export async function GET(req: NextRequest) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get("zip") ?? "";
  const zip = raw.replaceAll("-", "").trim();
  if (!ZIP_RE.test(zip)) {
    return NextResponse.json(
      { error: "郵便番号は7桁の数字で指定してください" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`
    );
    if (!res.ok) {
      throw new Error("zipcloud request failed");
    }
    const data = (await res.json()) as ZipcloudResponse;
    const hit = data.results?.[0];
    if (!hit) {
      return NextResponse.json({ address: null });
    }
    return NextResponse.json({
      address: `${hit.address1}${hit.address2}${hit.address3}`,
    });
  } catch {
    return NextResponse.json(
      { error: "住所の検索に失敗しました" },
      { status: 502 }
    );
  }
}
