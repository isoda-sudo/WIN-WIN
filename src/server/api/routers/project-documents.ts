import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { PROJECT_DOCUMENT_KINDS } from "~/lib/project-documents";
import {
  createTRPCRouter,
  masterReadableProcedure,
  notViewerProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { projectDocuments, projects } from "~/server/db/schema";

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

// 案件ごとの書類の格納（工事完了報告書など）。複数枚を保管でき、請求書メールの添付に選べる。
export const projectDocumentsRouter = createTRPCRouter({
  list: masterReadableProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(({ input }) =>
      db
        .select({
          filename: projectDocuments.filename,
          id: projectDocuments.id,
          kind: projectDocuments.kind,
          uploadedAt: projectDocuments.uploadedAt,
        })
        .from(projectDocuments)
        .where(eq(projectDocuments.projectId, input.projectId))
        .orderBy(asc(projectDocuments.id))
    ),

  upload: notViewerProcedure
    .input(
      z.object({
        dataUrl: z
          .string()
          .startsWith("data:application/pdf")
          .max(MAX_DATA_URL_CHARS),
        filename: z.string().trim().min(1).max(200),
        kind: z.enum(PROJECT_DOCUMENT_KINDS),
        projectId: z.number().int(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const project = await findProject(input.projectId);
      const [row] = await db
        .insert(projectDocuments)
        .values({ ...input, uploadedBy: ctx.user.id })
        .returning({ id: projectDocuments.id });
      await logAudit(ctx.user.id, "UPDATE", "projects", input.projectId, {
        name: project.name,
        changes: [`報告書を格納（${input.kind}: ${input.filename}）`],
      });
      return { id: row?.id };
    }),

  delete: notViewerProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [doc] = await db
        .select()
        .from(projectDocuments)
        .where(eq(projectDocuments.id, input.id))
        .limit(1);
      if (!doc) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ファイルが見つかりません",
        });
      }
      const project = await findProject(doc.projectId);
      await db
        .delete(projectDocuments)
        .where(eq(projectDocuments.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "projects", doc.projectId, {
        name: project.name,
        changes: [`報告書を削除（${doc.kind}: ${doc.filename}）`],
      });
      return { success: true };
    }),
});
