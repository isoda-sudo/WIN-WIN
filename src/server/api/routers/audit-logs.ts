import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { visibleHistoryTableNames } from "~/lib/history-access";
import { createTRPCRouter, notViewerProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { auditLogs, users } from "~/server/db/schema";

const PAGE_SIZE = 100;

const filterInput = z.object({
  action: z.string().optional(),
  tableName: z.string().optional(),
});

/** ロールが閲覧できるテーブルだけに絞った対象テーブル名。閲覧不可の明示指定は空になる。 */
function allowedTables(role: string, requested: string | undefined) {
  const allowed = visibleHistoryTableNames(role);
  return requested ? allowed.filter((t) => t === requested) : allowed;
}

export const auditLogsRouter = createTRPCRouter({
  // 監査ログ一覧（新しい順）。cursor（取得済み件数）から100件ずつ返し、画面の「追加読み込み」で全件まで辿れる。
  // ロールが閲覧可能なテーブルだけが対象（経理・一般社員には閲覧権限がない機能の履歴を
  // 出し分けるため）。閲覧不可のtableNameを明示指定した場合は空。viewerはnotViewerProcedureで弾かれる。
  list: notViewerProcedure
    .input(filterInput.extend({ cursor: z.number().int().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const tableNames = allowedTables(ctx.user.role, input.tableName);
      if (tableNames.length === 0) {
        return { nextOffset: null, rows: [], total: 0 };
      }
      const where = and(
        inArray(auditLogs.tableName, tableNames),
        input.action ? eq(auditLogs.action, input.action) : undefined
      );
      const [rows, totalRow] = await Promise.all([
        db
          .select({
            id: auditLogs.id,
            userId: auditLogs.userId,
            action: auditLogs.action,
            tableName: auditLogs.tableName,
            recordId: auditLogs.recordId,
            details: auditLogs.details,
            createdAt: auditLogs.createdAt,
            email: users.email,
          })
          .from(auditLogs)
          .leftJoin(users, eq(auditLogs.userId, users.id))
          .where(where)
          .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
          .limit(PAGE_SIZE)
          .offset(input.cursor),
        db.select({ n: count() }).from(auditLogs).where(where),
      ]);
      const total = Number(totalRow[0]?.n ?? 0);
      const next = input.cursor + rows.length;
      return {
        nextOffset: next < total && rows.length > 0 ? next : null,
        rows,
        total,
      };
    }),

  // 絞り込み候補（履歴に実在する対象画面・操作）。件数に依らず全履歴から求める。
  facets: notViewerProcedure
    .input(z.object({ tableName: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const allowed = allowedTables(ctx.user.role, undefined);
      if (allowed.length === 0) {
        return { actions: [], tableNames: [] };
      }
      const [tables, actions] = await Promise.all([
        db
          .selectDistinct({ v: auditLogs.tableName })
          .from(auditLogs)
          .where(inArray(auditLogs.tableName, allowed)),
        db
          .selectDistinct({ v: auditLogs.action })
          .from(auditLogs)
          .where(
            inArray(
              auditLogs.tableName,
              allowedTables(ctx.user.role, input.tableName)
            )
          ),
      ]);
      return {
        actions: actions.map((a) => a.v).filter((v): v is string => Boolean(v)),
        tableNames: tables
          .map((t) => t.v)
          .filter((v): v is string => Boolean(v)),
      };
    }),
});
