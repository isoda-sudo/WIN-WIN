import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { logAudit } from "~/server/audit/log";
import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  authCookieOptions,
  signAuthToken,
} from "~/server/auth/jwt";
import { db } from "~/server/db";
import { invitations, users } from "~/server/db/schema";

export const runtime = "nodejs";

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

const INVITE_ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  accounting: "経理部",
  staff: "一般社員",
};

/** 招待を受諾してアカウント作成（パスワード設定／認証不要） */
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
    return NextResponse.json(
      { error: "招待が見つかりません" },
      { status: 404 }
    );
  }

  const inv = await db.query.invitations.findFirst({
    where: eq(invitations.token, token),
  });
  if (!inv) {
    return NextResponse.json(
      { error: "招待が見つかりません" },
      { status: 404 }
    );
  }
  if (inv.acceptedAt) {
    return NextResponse.json(
      { error: "この招待は既に使用されています" },
      { status: 409 }
    );
  }
  if (inv.expiresAt < new Date()) {
    return NextResponse.json(
      {
        error:
          "招待リンクの有効期限（24時間）が切れています。管理者へ再発行をご依頼ください",
      },
      { status: 410 }
    );
  }
  const dup = await db.query.users.findFirst({
    where: eq(users.email, inv.email),
  });
  if (dup) {
    return NextResponse.json(
      { error: "このメールアドレスは既に登録済みです" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        email: inv.email,
        passwordHash,
        name: inv.name || "",
        role: inv.role,
      })
      .returning();
    if (!created) {
      throw new Error("failed to create user");
    }
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, inv.id));
    return created;
  });

  await logAudit(user.id, "CREATE", "users", user.id, {
    name: user.email,
    changes: [
      `招待からアカウント登録（権限: ${INVITE_ROLE_LABELS[inv.role] || inv.role}）`,
    ],
  });

  const jwtToken = signAuthToken({
    id: user.id,
    email: user.email,
    tv: user.tokenVersion ?? 1,
  });
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  res.cookies.set(
    AUTH_COOKIE_NAME,
    jwtToken,
    authCookieOptions(AUTH_COOKIE_MAX_AGE_SECONDS)
  );
  return res;
}
