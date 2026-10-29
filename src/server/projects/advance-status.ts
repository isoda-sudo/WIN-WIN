import { and, eq, isNull, sql } from "drizzle-orm";
import {
  ESTIMATE_SUBMITTED_STATUS,
  projectStatusLabel,
  shouldAutoAdvance,
} from "~/lib/status-styles";

const INVOICE_ISSUED_STATUS = "請求書発行済み";

import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { projects } from "~/server/db/schema";

/**
 * 見積書をダウンロード／メール送信したときに、案件のステータスを「見積書提出済み」
 * （DB値: 見積確認中）へ自動で進める。前進のみで、既に先へ進んでいる案件・失注・
 * オーダー移行は変更しない（shouldAutoAdvance のガード）。
 * 行を FOR UPDATE で読み直し、version を進めて更新する。失敗しても呼び出し元の
 * ダウンロード／送信は止めない（ステータス更新は付随処理のため例外は握りつぶす）。
 */
export function advanceToEstimateSubmitted(
  projectId: number,
  userId: number,
  via: "ダウンロード" | "メール送信" | "格納"
): Promise<boolean> {
  return advanceProjectStatus(
    projectId,
    userId,
    ESTIMATE_SUBMITTED_STATUS,
    `見積書の${via}`
  );
}

/** 請求書をダウンロード／メール送信したときに「請求書発行済み」へ自動で進める（前進のみ）。 */
export function advanceToInvoiceIssued(
  projectId: number,
  userId: number,
  via: "ダウンロード" | "メール送信"
): Promise<boolean> {
  return advanceProjectStatus(
    projectId,
    userId,
    INVOICE_ISSUED_STATUS,
    `請求書の${via}`
  );
}

async function advanceProjectStatus(
  projectId: number,
  userId: number,
  target: string,
  cause: string
): Promise<boolean> {
  try {
    const changed = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          name: projects.name,
          status: projects.status,
          version: projects.version,
        })
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
        .for("update");
      if (!(row && shouldAutoAdvance(row.status, target))) {
        return null;
      }
      await tx
        .update(projects)
        .set({
          status: target,
          version: sql`${projects.version} + 1`,
        })
        .where(eq(projects.id, projectId));
      return row;
    });
    if (!changed) {
      return false;
    }
    await logAudit(userId, "UPDATE", "projects", projectId, {
      name: changed.name ?? undefined,
      changes: [
        `${cause}によりステータスを自動更新: ${projectStatusLabel(changed.status)} → ${projectStatusLabel(target)}`,
      ],
    });
    return true;
  } catch {
    return false;
  }
}
