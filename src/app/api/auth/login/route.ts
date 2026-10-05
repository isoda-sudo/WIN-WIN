import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  authCookieOptions,
  signAuthToken,
} from "~/server/auth/jwt";
import { checkLoginRateLimit } from "~/server/auth/rate-limit";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkLoginRateLimit(ip);
  if (!rl.allowed) {
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
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが正しくありません" },
      { status: 401 }
    );
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが正しくありません" },
      { status: 401 }
    );
  }
  if (user.status === "suspended") {
    return NextResponse.json(
      {
        error:
          "このアカウントは一時停止されています。管理者にお問い合わせください",
      },
      { status: 403 }
    );
  }
  if (user.status === "deleted") {
    return NextResponse.json(
      { error: "このアカウントは削除されています" },
      { status: 403 }
    );
  }

  const token = signAuthToken({
    id: user.id,
    email: user.email,
    tv: user.tokenVersion ?? 1,
  });

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  res.cookies.set(
    AUTH_COOKIE_NAME,
    token,
    authCookieOptions(AUTH_COOKIE_MAX_AGE_SECONDS)
  );
  return res;
}
