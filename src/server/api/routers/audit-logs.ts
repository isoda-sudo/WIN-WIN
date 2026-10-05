import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { visibleHistoryTableNames } from "~/lib/history-access";
import { createTRPCRouter, notViewerProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { auditLogs, users } from "~/server/db/schema";

const LIST_LIMIT = 100;
const FILTERED_LIST_LIMIT = 50;

export const auditLogsRouter = createTRPCRouter({
  // 監査ログ一覧。table_name未指定ならロールが閲覧可能な全テーブル（直近100件）、
  // 指定時はそのテーブルに絞って直近50件。ロールが閲覧不可のtableNameを明示指定
  // した場合は空配列を返す（経理・一般社員には閲覧権限がない機能の履歴を
  // 出し分けるため）。viewerはnotViewerProcedureで弾かれる。
  // 旧app: GET /api/audit-logs, GET /api/audit-logs/:tableName （admin/accounting限定）
  list: notViewerProcedure
    .input(z.object({ tableName: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const allowedTableNames = visibleHistoryTableNames(ctx.user.role);
      const requestedTableName = input?.tableName;
      const tableNames = requestedTableName
        ? allowedTableNames.filter((t) => t === requestedTableName)
        : allowedTableNames;

      if (tableNames.length === 0) {
        return [];
      }

      const query = db
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
        .where(inArray(auditLogs.tableName, tableNames))
        .orderBy(desc(auditLogs.createdAt));

      return await query.limit(
        requestedTableName ? FILTERED_LIST_LIMIT : LIST_LIMIT
      );
    }),
});
