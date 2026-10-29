import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import JSZip from "jszip";
import {
  type ArchiveManifestEntry,
  archiveCutoffMonth,
  safeEntryName,
  uniquePath,
} from "~/lib/archive";
import { db } from "~/server/db";
import {
  estimateFiles,
  fileArchives,
  invoiceFiles,
  orderFiles,
  orders,
  projectDocuments,
  projectFiles,
  projects,
} from "~/server/db/schema";
import { recompressPdf } from "./recompress-pdf";

const DATA_URL_PREFIX_RE = /^data:[^;]*;base64,/;
const KIND_LABEL: Record<string, string> = { ack: "請書", invoice: "請求書" };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface SourceFile {
  bytes: Buffer;
  /** 空にする対象 */
  clear: (tx: Tx) => Promise<unknown>;
  filename: string;
  folder: string;
  source: string;
}

function fromDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.replace(DATA_URL_PREFIX_RE, ""), "base64");
}

/** 案件の、まだ本体が残っている書類を集める。 */
async function collectProjectFiles(projectId: number): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  const pfs = await db
    .select()
    .from(projectFiles)
    .where(
      and(
        eq(projectFiles.projectId, projectId),
        isNotNull(projectFiles.dataUrl)
      )
    );
  for (const f of pfs) {
    out.push({
      bytes: fromDataUrl(f.dataUrl ?? ""),
      clear: (tx) =>
        tx
          .update(projectFiles)
          .set({ dataUrl: null })
          .where(
            and(
              eq(projectFiles.projectId, f.projectId),
              eq(projectFiles.kind, f.kind)
            )
          ),
      filename: safeEntryName(f.filename, `${f.kind}.pdf`),
      folder: "契約書",
      source: `project_files:${f.projectId}:${f.kind}`,
    });
  }
  const efs = await db
    .select()
    .from(estimateFiles)
    .where(
      and(
        eq(estimateFiles.projectId, projectId),
        isNotNull(estimateFiles.dataUrl)
      )
    );
  for (const f of efs) {
    out.push({
      bytes: fromDataUrl(f.dataUrl ?? ""),
      clear: (tx) =>
        tx
          .update(estimateFiles)
          .set({ dataUrl: null })
          .where(eq(estimateFiles.id, f.id)),
      filename: safeEntryName(f.filename, "見積書.pdf"),
      folder: "見積書",
      source: `estimate_files:${f.id}`,
    });
  }
  const docs = await db
    .select()
    .from(projectDocuments)
    .where(
      and(
        eq(projectDocuments.projectId, projectId),
        ne(projectDocuments.dataUrl, "")
      )
    );
  for (const f of docs) {
    out.push({
      bytes: fromDataUrl(f.dataUrl),
      // data_url は NOT NULL のため、空文字にする
      clear: (tx) =>
        tx
          .update(projectDocuments)
          .set({ dataUrl: "" })
          .where(eq(projectDocuments.id, f.id)),
      filename: safeEntryName(f.filename, `${f.kind}.pdf`),
      folder: "書類",
      source: `project_documents:${f.id}`,
    });
  }
  const ords = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.projectId, projectId));
  if (ords.length > 0) {
    const ofs = await db
      .select()
      .from(orderFiles)
      .where(
        and(
          inArray(
            orderFiles.orderId,
            ords.map((o) => o.id)
          ),
          isNotNull(orderFiles.dataUrl)
        )
      );
    for (const f of ofs) {
      out.push({
        bytes: fromDataUrl(f.dataUrl ?? ""),
        clear: (tx) =>
          tx
            .update(orderFiles)
            .set({ dataUrl: null })
            .where(
              and(
                eq(orderFiles.orderId, f.orderId),
                eq(orderFiles.kind, f.kind)
              )
            ),
        filename: safeEntryName(
          f.filename,
          `${KIND_LABEL[f.kind] ?? f.kind}.pdf`
        ),
        folder: `発注_${f.orderId}/${KIND_LABEL[f.kind] ?? f.kind}`,
        source: `order_files:${f.orderId}:${f.kind}`,
      });
    }
  }
  const ifs = await db
    .select()
    .from(invoiceFiles)
    .where(
      and(
        eq(invoiceFiles.projectId, projectId),
        sql`(${invoiceFiles.pdf} is not null or ${invoiceFiles.dataUrl} is not null)`
      )
    );
  for (const f of ifs) {
    out.push({
      bytes: f.pdf ?? fromDataUrl(f.dataUrl ?? ""),
      clear: (tx) =>
        tx
          .update(invoiceFiles)
          .set({ dataUrl: null, pdf: null })
          .where(eq(invoiceFiles.id, f.id)),
      filename: safeEntryName(f.filename, `請求書_${f.id}.pdf`),
      folder: "請求書",
      source: `invoice_files:${f.id}`,
    });
  }
  return out;
}

export interface ArchiveRunResult {
  bytesAfter: number;
  bytesBefore: number;
  cutoff: string;
  files: number;
  projects: number;
  /** 時間切れで、次回に持ち越した案件の数 */
  remainingProjects: number;
}

/**
 * 引渡月から5年を過ぎた案件の書類を、PDFの画像を再圧縮して1案件1つのZIPにまとめ、file_archives に保存する。
 * ZIPを保存できたことを確認してから、元の書類の本体だけを空にする（行・ファイル名は残す）。
 * dryRun=true のときは、何も書き換えず、減る量だけを返す。
 */
export async function archiveOldFiles(
  opts: { budgetMs?: number; dryRun?: boolean; now?: Date } = {}
): Promise<ArchiveRunResult> {
  const { budgetMs = 45_000, dryRun = false, now = new Date() } = opts;
  const startedAt = Date.now();
  const cutoff = archiveCutoffMonth(now);
  const targets = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      sql`${projects.deliveryMonth} ~ '^[0-9]{4}-[0-9]{2}$' and ${projects.deliveryMonth} <= ${cutoff}`
    )
    .orderBy(projects.id);

  const result: ArchiveRunResult = {
    bytesAfter: 0,
    bytesBefore: 0,
    cutoff,
    files: 0,
    projects: 0,
    remainingProjects: 0,
  };
  for (let i = 0; i < targets.length; i++) {
    if (Date.now() - startedAt > budgetMs) {
      result.remainingProjects = targets.length - i;
      break;
    }
    const target = targets[i];
    if (!target) {
      continue;
    }
    const files = await collectProjectFiles(target.id);
    if (files.length === 0) {
      continue;
    }
    const zip = new JSZip();
    const used = new Set<string>();
    const manifest: ArchiveManifestEntry[] = [];
    let before = 0;
    let after = 0;
    for (const f of files) {
      const { output } = await recompressPdf(f.bytes);
      const entryPath = uniquePath(`${f.folder}/${f.filename}`, used);
      zip.file(entryPath, output);
      before += f.bytes.length;
      after += output.length;
      manifest.push({
        bytesAfter: output.length,
        bytesBefore: f.bytes.length,
        path: entryPath,
        source: f.source,
      });
    }
    result.files += files.length;
    result.projects += 1;
    result.bytesBefore += before;
    result.bytesAfter += after;
    if (dryRun) {
      continue;
    }
    const zipBuf = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });
    await db.transaction(async (tx: Tx) => {
      const [row] = await tx
        .insert(fileArchives)
        .values({
          projectId: target.id,
          fileCount: files.length,
          bytesBefore: before,
          bytesAfter: zipBuf.length,
          manifest,
          zip: zipBuf,
        })
        .returning({ id: fileArchives.id });
      // 保存できたZIPが、読み戻せて、全ファイルが入っていることを確認してから、元の本体を空にする
      const check = await JSZip.loadAsync(zipBuf);
      if (!row || Object.keys(check.files).length < files.length) {
        throw new Error(`ZIPの検証に失敗しました（案件${target.id}）`);
      }
      for (const f of files) {
        await f.clear(tx);
      }
    });
  }
  return result;
}
