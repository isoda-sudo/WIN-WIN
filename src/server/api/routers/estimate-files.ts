import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, notViewerProcedure } from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { estimateFiles, projects } from "~/server/db/schema";
import { advanceToEstimateSubmitted } from "~/server/projects/advance-status";

/** Vercel のリクエストボディ上限（4.5MB）に収めるための base64 上限（元PDFで約3MB）。 */
const MAX_DATA_URL_CHARS = 4_200_000;

async function findProject(projectId: number) {
  const [row] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "案件が見つかりません" });
  }
  return row;
}

// 見積書は外部で作成したPDFをアップするだけ（システムでは発行しない）。1案件につき1枚。
export const estimateFilesRouter = createTRPCRouter({
  upload: notViewerProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        filename: z.string().trim().min(1).max(200),
        dataUrl: z
          .string()
          .startsWith("data:application/pdf")
          .max(MAX_DATA_URL_CHARS),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const project = await findProject(input.projectId);
      const [existing] = await db
        .select({ id: estimateFiles.id })
        .from(estimateFiles)
        .where(eq(estimateFiles.projectId, input.projectId))
        .limit(1);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "見積書はすでにアップ済みです（1案件につき1枚）。差し替えるときは、削除してからアップしてください",
        });
      }
      const [row] = await db
        .insert(estimateFiles)
        .values({
          projectId: input.projectId,
          filename: input.filename,
          dataUrl: input.dataUrl,
          uploadedBy: ctx.user.id,
        })
        .returning({ id: estimateFiles.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      // 見積書を格納したら、案件のステータスを「見積書提出済み」へ進める（前進のみ）
      await advanceToEstimateSubmitted(input.projectId, ctx.user.id, "格納");
      await logAudit(ctx.user.id, "UPDATE", "projects", input.projectId, {
        name: project.name,
        changes: [`見積書PDFを格納（${input.filename}）`],
      });
      return { id: row.id };
    }),

  delete: notViewerProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [file] = await db
        .select({
          filename: estimateFiles.filename,
          projectId: estimateFiles.projectId,
        })
        .from(estimateFiles)
        .where(eq(estimateFiles.id, input.id))
        .limit(1);
      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ファイルが見つかりません",
        });
      }
      const project = await findProject(file.projectId);
      await db.delete(estimateFiles).where(eq(estimateFiles.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "projects", file.projectId, {
        name: project.name,
        changes: [`見積書PDFを削除（${file.filename ?? "-"}）`],
      });
      return { success: true };
    }),
});
