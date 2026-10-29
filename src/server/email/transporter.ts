import nodemailer, { type SendMailOptions } from "nodemailer";
import { env } from "~/env";
import { appendNoReplyNote } from "~/lib/mail-note";

const DEFAULT_SMTP_PORT = 587;

/** SMTP の接続情報（ユーザー名・パスワード）が設定済みか。未設定だと送信できない。 */
export function isMailConfigured(): boolean {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

/**
 * メール送信用のトランスポート。sendMail の本文（text）の最後に、必ず
 * 「送信専用アドレス」の注意書きを付ける（全ての送信メールで共通）。
 */
export function makeTransporter(): {
  sendMail: (options: SendMailOptions) => Promise<unknown>;
} {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST || "smtp.gmail.com",
    port: env.SMTP_PORT ?? DEFAULT_SMTP_PORT,
    secure: env.SMTP_SECURE ?? false,
    auth: { user: env.SMTP_USER || "", pass: env.SMTP_PASS || "" },
  });
  return {
    sendMail: (options) =>
      transport.sendMail({
        ...options,
        text: appendNoReplyNote(
          typeof options.text === "string" ? options.text : undefined
        ),
      }),
  };
}

/**
 * 差出人。MAIL_FROM があればそれを使う。無ければ SMTP のユーザー（テスト用アドレス）を差出人にする
 * （Gmail などは認証したアドレス以外の差出人を許さないため）。ドメイン取得後は MAIL_FROM を設定して切り替える。
 */
export const MAIL_FROM =
  env.MAIL_FROM ||
  (env.SMTP_USER
    ? `物件管理システム <${env.SMTP_USER}>`
    : "物件管理システム <noreply@construct-pro.jp>");

const MAIL_NOT_CONFIGURED_MESSAGE =
  "メール送信の設定（SMTP）が未設定です。管理者に連絡してください";

/** 送信失敗の原因を、利用者向けの1行メッセージにする（接続情報などの機密は含めない）。 */
export function describeMailError(err: unknown): string {
  if (!isMailConfigured()) {
    return MAIL_NOT_CONFIGURED_MESSAGE;
  }
  const code = (err as { code?: string } | null)?.code;
  const response = (err as { responseCode?: number } | null)?.responseCode;
  if (code === "EAUTH" || response === 535) {
    return "メールサーバーの認証に失敗しました（SMTPのユーザー名・パスワードを確認してください）";
  }
  if (code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ESOCKET") {
    return "メールサーバーに接続できませんでした。時間をおいて再度お試しください";
  }
  if (response === 550 || response === 553 || response === 554) {
    return "メールサーバーに送信を拒否されました（差出人・宛先のアドレスを確認してください）";
  }
  return "メールの送信に失敗しました";
}
