import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { COMPANY } from "~/server/pdf/company";

// 自社情報（銀行口座等）はCOMPANYを唯一の情報源とする。
// 旧app: GET /api/company-info （authMiddleware配下、全ログインユーザーが閲覧可）
export const companyRouter = createTRPCRouter({
  info: protectedProcedure.query(() => ({
    bank: COMPANY.bank,
    account: COMPANY.account,
    accountHolder: COMPANY.accountHolder,
    feeNote: COMPANY.feeNote,
  })),
});
