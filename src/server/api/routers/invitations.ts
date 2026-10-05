import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { invitations, users } from "~/server/db/schema";
import { MAIL_FROM, makeTransporter } from "~/server/email/transporter";

const INVITE_ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  accounting: "経理部",
  staff: "一般社員",
};
const VALID_ROLES = new Set(Object.keys(INVITE_ROLE_LABELS));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const INVITATION_LIST_LIMIT = 50;

function baseUrl(headers: Headers): string {
  const proto = headers.get("x-forwarded-proto") ?? "https";
  const host = headers.get("host") ?? "";
  return `${proto}://${host}`;
}

function inviteStatus(inv: {
  acceptedAt: Date | null;
  expiresAt: Date;
}): string {
  if (inv.acceptedAt) {
    return "登録済み";
  }
  if (inv.expiresAt < new Date()) {
    return "期限切れ";
  }
  return "有効";
}

export const invitationsRouter = createTRPCRouter({
  // 招待一覧。24時間を過ぎた未受諾の招待は自動削除する
  list: adminProcedure.query(async () => {
    await db
      .delete(invitations)
      .where(
        and(
          isNull(invitations.acceptedAt),
          lt(invitations.expiresAt, new Date())
        )
      );
    const rows = await db
      .select()
      .from(invitations)
      .orderBy(desc(invitations.createdAt))
      .limit(INVITATION_LIST_LIMIT);
    return rows.map((r) => ({
      ...r,
      roleLabel: INVITE_ROLE_LABELS[r.role] || r.role,
      status: inviteStatus(r),
    }));
  }),

  // 招待を発行（24時間有効）＋招待メール送信。バックエンドは動作するが、UI側の実接続が
  // 決定#3（旧appの「準備中」スタブを再現せず実際に有効化する）の対象そのもの。
  create: adminProcedure
    .input(
      z.object({
        name: z.string().nullish(),
        email: z.string(),
        role: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!EMAIL_RE.test(input.email)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "有効なメールアドレスを入力してください",
        });
      }
      if (!VALID_ROLES.has(input.role)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "権限を選択してください",
        });
      }
      const existing = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "このメールアドレスは既に登録済みです",
        });
      }

      const token = crypto.randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      const [inv] = await db
        .insert(invitations)
        .values({
          email: input.email,
          name: input.name || "",
          role: input.role,
          token,
          expiresAt,
          createdBy: ctx.user.id,
        })
        .returning({ id: invitations.id });
      if (!inv) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      const inviteUrl = `${baseUrl(ctx.headers)}/accept-invite?token=${token}`;

      let emailSent = false;
      let emailError: string | null = null;
      try {
        await makeTransporter().sendMail({
          from: MAIL_FROM,
          to: input.email,
          subject: "【株式会社WIN WIN】アカウント発行のご案内",
          text: `${input.name || "ご担当者"} 様

お世話になっております。株式会社WIN WINでございます。
このたび、業務管理システムのアカウントを発行いたしましたのでご案内申し上げます。

　権限：${INVITE_ROLE_LABELS[input.role]}

下記URLよりパスワードをご設定のうえ、ログインをお願いいたします。
${inviteUrl}

※本URLの有効期限は発行から24時間です。期限を過ぎた場合は、お手数ですが管理者まで再発行をご依頼ください。

本メールにお心当たりのない場合は、破棄いただきますようお願い申し上げます。

──────────────────
株式会社WIN WIN
〒604-0924 京都市中京区一之船入町537-20 FIS御池ビル505号
TEL：075-777-1236
──────────────────`,
        });
        emailSent = true;
      } catch (err) {
        emailError = err instanceof Error ? err.message : String(err);
        console.error("invite mail failed", err);
      }

      await logAudit(ctx.user.id, "CREATE", "invitations", inv.id, {
        name: input.email,
        changes: [
          `アカウント招待を発行（権限: ${INVITE_ROLE_LABELS[input.role]}／24時間有効）`,
        ],
      });
      return { id: inv.id, inviteUrl, expiresAt, emailSent, emailError };
    }),

  revoke: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const inv = await db.query.invitations.findFirst({
        where: eq(invitations.id, input.id),
      });
      await db.delete(invitations).where(eq(invitations.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "invitations", input.id, {
        name: inv ? inv.email : `#${input.id}`,
        changes: ["アカウント招待を取り消し"],
      });
      return { success: true };
    }),
});
