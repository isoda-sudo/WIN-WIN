import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { respondAfterPassword } from "~/server/auth/login-response";
import { isLoginBlocked, recordLoginFailure } from "~/server/auth/rate-limit";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isLoginBlocked(ip).blocked) {
    return NextResponse.json(
      {
        error:
          "ログイン試行回数が多すぎます。しばらく待ってから再度お試しください",
      },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = body?.email;
  const password = body?.password;
  if (!(email && password)) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードを入力してください" },
      { status: 400 }
    );
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!user) {
    recordLoginFailure(ip);
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが正しくありません" },
      { status: 401 }
    );
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    recordLoginFailure(ip);
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが正しくありません" },
      { status: 401 }
    );
  }
  // 停止中（以前の「削除」で削除済みになったものを含む）はログインできない
  if (user.status === "suspended" || user.status === "deleted") {
    return NextResponse.json(
      {
        error: "このアカウントは停止されています。管理者にお問い合わせください",
      },
      { status: 403 }
    );
  }

  return respondAfterPassword(user);
}
