import bcrypt from "bcrypt";
import { and, eq, isNull, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { passwordResets, users } from "~/server/db/schema";

export const runtime = "nodejs";

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

/** 再設定トークンの検証（/reset-password ページから／認証不要） */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ valid: false });
  }
  const reset = await db.query.passwordResets.findFirst({
    where: eq(passwordResets.token, token),
  });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return NextResponse.json({ valid: false });
  }
  return NextResponse.json({ valid: true });
}

/** 新しいパスワードを設定する（認証不要、トークンで本人確認） */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    token?: string;
    password?: string;
  } | null;
  const { token, password } = body ?? {};
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: "パスワードは8文字以上で設定してください" },
      { status: 400 }
    );
  }
  if (!token) {
    return NextResponse.json({ error: "リンクが無効です" }, { status: 404 });
  }

  const reset = await db.query.passwordResets.findFirst({
    where: eq(passwordResets.token, token),
  });
  if (!reset) {
    return NextResponse.json({ error: "リンクが無効です" }, { status: 404 });
  }
  if (reset.usedAt) {
    return NextResponse.json(
      { error: "このリンクは既に使用されています" },
      { status: 409 }
    );
  }
  if (reset.expiresAt < new Date()) {
    return NextResponse.json(
      {
        error:
          "リンクの有効期限（1時間）が切れています。もう一度パスワード再設定をリクエストしてください",
      },
      { status: 410 }
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash,
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.id, reset.userId));
    // このトークンだけでなく、同じユーザーの他の未使用トークンもまとめて無効化する
    await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResets.userId, reset.userId),
          isNull(passwordResets.usedAt)
        )
      );
  });

  await logAudit(reset.userId, "UPDATE", "users", reset.userId, {
    name: `#${reset.userId}`,
    changes: ["パスワードを再設定"],
  });

  return NextResponse.json({ ok: true });
}
