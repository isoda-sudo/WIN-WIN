import nodemailer from "nodemailer";
import { env } from "~/env";

const DEFAULT_SMTP_PORT = 587;

export function makeTransporter() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST || "smtp.gmail.com",
    port: env.SMTP_PORT ?? DEFAULT_SMTP_PORT,
    secure: env.SMTP_SECURE ?? false,
    auth: { user: env.SMTP_USER || "", pass: env.SMTP_PASS || "" },
  });
}

export const MAIL_FROM =
  env.MAIL_FROM || "CONSTRUCT_PRO <noreply@construct-pro.jp>";
