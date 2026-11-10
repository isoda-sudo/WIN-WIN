import { type NextRequest, NextResponse } from "next/server";
import { checkBasicAuth } from "~/lib/basic-auth";

// 本番だけ、全ページにBasic認証をかける（アプリのログインとは別の、入口の鍵）。
// ユーザー名・パスワードは、環境変数 BASIC_AUTH_USER / BASIC_AUTH_PASSWORD で必ず設定する
// （既定値は持たない。未設定のときは、全リクエストを拒否する）。

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const result = checkBasicAuth(
    request.headers.get("authorization"),
    process.env.BASIC_AUTH_USER,
    process.env.BASIC_AUTH_PASSWORD
  );
  if (result === "ok") {
    return NextResponse.next();
  }
  if (result === "not-configured") {
    // 設定漏れで、鍵が無いまま公開されないようにする（全拒否）
    return new NextResponse(
      "BASIC_AUTH_USER / BASIC_AUTH_PASSWORD が設定されていません",
      { status: 503 }
    );
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="CONSTRUCT_PRO", charset="UTF-8"',
    },
  });
}

export const config = {
  // 定期実行（Vercel Cron）は Bearer（CRON_SECRET）で守られているため除外する
  matcher: ["/((?!api/cron/|_next/static|_next/image|favicon.ico).*)"],
};
