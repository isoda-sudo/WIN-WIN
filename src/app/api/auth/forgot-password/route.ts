import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { passwordResets, users } from "~/server/db/schema";
import { MAIL_FROM, makeTransporter } from "~/server/email/transporter";

export const runtime = "nodejs";

const RESET_TTL_MS = 60 * 60 * 1000; // 1時間（招待の24時間より短く、より即時性の高い操作のため）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function baseUrl(headers: Headers): string {
  const proto = headers.get("x-forwarded-proto") ?? "https";
  const host = headers.get("host") ?? "";
  return `${proto}://${host}`;
}

/**
 * パスワード再設定メールの送信をリクエストする（認証不要）。
 * メールアドレスの存在有無に関わらず常に同じレスポンスを返す
 * （アカウント有無の探索＝ユーザー列挙を防ぐため）。
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
  } | null;
  const email = body?.email?.trim();

  if (email && EMAIL_RE.test(email)) {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (user && user.status === "active") {
      const token = crypto.randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + RESET_TTL_MS);
      await db.insert(passwordResets).values({
        userId: user.id,
        token,
        expiresAt,
      });
      const resetUrl = `${baseUrl(req.headers)}/reset-password?token=${token}`;

      try {
        await makeTransporter().sendMail({
          from: MAIL_FROM,
          to: user.email,
          subject: "【株式会社WIN WIN】パスワード再設定のご案内",
          text: `${user.name || "ご担当者"} 様

業務管理システムのパスワード再設定のリクエストを受け付けました。
下記URLより新しいパスワードをご設定ください。

${resetUrl}

※本URLの有効期限は発行から1時間です。
※本メールにお心当たりのない場合は、破棄いただきますようお願い申し上げます（パスワードは変更されません）。

──────────────────
株式会社WIN WIN
〒604-0924 京都市中京区一之船入町537-20 FIS御池ビル505号
TEL：075-777-1236
──────────────────`,
        });
      } catch (err) {
        console.error("password reset mail failed", err);
      }

      await logAudit(user.id, "UPDATE", "users", user.id, {
        name: user.email,
        changes: ["パスワード再設定メールを送信"],
      });
    }
  }

  return NextResponse.json({ ok: true });
}
