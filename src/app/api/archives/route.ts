import { desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { fileArchives, projects } from "~/server/db/schema";

export const runtime = "nodejs";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const HTML_SPECIAL_RE = /[&<>"]/g;

function esc(v: string): string {
  return v.replace(HTML_SPECIAL_RE, (c) => HTML_ESCAPES[c] ?? c);
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) {
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function fmtDate(d: Date | null): string {
  if (!d) {
    return "-";
  }
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

/** アーカイブ（5年を過ぎた案件の書類ZIP）の一覧と、ダウンロードリンク。管理者のみ。 */
export async function GET(req: NextRequest) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  // zip本体（bytea）は一覧では読まない
  const rows = await db
    .select({
      id: fileArchives.id,
      projectId: fileArchives.projectId,
      projectName: projects.name,
      projectNo: projects.projectNo,
      archivedAt: fileArchives.archivedAt,
      fileCount: fileArchives.fileCount,
      bytesBefore: fileArchives.bytesBefore,
      bytesAfter: fileArchives.bytesAfter,
    })
    .from(fileArchives)
    .leftJoin(projects, eq(projects.id, fileArchives.projectId))
    .orderBy(desc(fileArchives.archivedAt), desc(fileArchives.id));

  const body = rows.length
    ? rows
        .map(
          (r) => `<tr>
<td>${r.id}</td>
<td>${esc(r.projectName ?? "（削除済みの案件）")}<br><small>案件ID: ${esc(r.projectNo || String(r.projectId))}</small></td>
<td>${esc(fmtDate(r.archivedAt))}</td>
<td class="n">${r.fileCount}</td>
<td class="n">${fmtBytes(r.bytesBefore)} → ${fmtBytes(r.bytesAfter)}</td>
<td><a href="/api/archives/${r.id}">ダウンロード</a></td>
</tr>`
        )
        .join("\n")
    : '<tr><td colspan="6">まだアーカイブはありません（毎月15日の夜に、5年を過ぎた案件が対象になります）</td></tr>';

  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>アーカイブ一覧</title>
<style>body{font:14px/1.6 system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse;width:100%;max-width:960px}th,td{border:1px solid #ccc;padding:8px 10px;text-align:left;vertical-align:top}th{background:#f3f3f3}.n{text-align:right;white-space:nowrap}small{color:#666}</style>
</head><body>
<h1>アーカイブ一覧</h1>
<p>引渡月から5年を過ぎた案件の書類を、画像を再圧縮してまとめたZIPです（全${rows.length}件）。</p>
<table><thead><tr><th>ID</th><th>案件</th><th>アーカイブ日時</th><th>ファイル数</th><th>サイズ（圧縮前 → 後）</th><th></th></tr></thead>
<tbody>
${body}
</tbody></table>
</body></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
