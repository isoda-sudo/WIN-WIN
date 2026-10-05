import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface AdrIndexError {
  message: string;
}

/** ファイル名から ADR 番号を取り出す正規表現（`NNNN-*.md`）。 */
const ADR_FILE_PATTERN = /^(\d{4})-.+\.md$/;

/** インデックス表のリンク先から先頭の `./` を取り除く正規表現。 */
const LEADING_DOT_SLASH_PATTERN = /^\.\//;

/** インデックス表の1行（`| [0001](./0001-slug.md) | title | status | date |`）。 */
const INDEX_ROW_PATTERN =
  /^\|\s*\[(\d{4})\]\(\.\/([^)]+)\)\s*\|(.+?)\|(.+?)\|(.+?)\|\s*$/;

/** ADR 本文のステータス行（`- **ステータス**: ...`）。 */
const STATUS_LINE_PATTERN = /^-\s*\*\*ステータス\*\*\s*:\s*(.+?)\s*$/m;

/** 許容するステータスの一覧（`置換` のみ ADR 番号を伴う）。 */
const VALID_FIXED_STATUSES = [
  "提案中(Proposed)",
  "承認(Accepted)",
  "廃止(Deprecated)",
];
const SUPERSEDED_STATUS_PATTERN = /^置換\(Superseded by ADR-\d{4}\)$/;
const VALID_STATUS_HINT =
  "提案中(Proposed) / 承認(Accepted) / 廃止(Deprecated) / 置換(Superseded by ADR-NNNN)";

function isValidStatus(status: string): boolean {
  return (
    VALID_FIXED_STATUSES.includes(status) ||
    SUPERSEDED_STATUS_PATTERN.test(status)
  );
}

interface AdrFile {
  /** ファイル名（例: `0001-use-bun.md`）。 */
  fileName: string;
  /** 4桁の ADR 番号（例: `0001`）。 */
  number: string;
  /** 本文に書かれたステータス。見つからなければ null。 */
  status: string | null;
}

interface IndexRow {
  /** リンク先ファイル名（例: `0001-use-bun.md`）。 */
  fileName: string;
  /** 表に書かれた4桁の ADR 番号。 */
  number: string;
  /** ステータス列の値。 */
  status: string;
}

function collectAdrFiles(dir: string): AdrFile[] {
  const files: AdrFile[] = [];
  for (const entry of readdirSync(dir)) {
    const match = entry.match(ADR_FILE_PATTERN);
    if (!match) {
      continue;
    }
    const content = readFileSync(join(dir, entry), "utf8");
    const statusMatch = content.match(STATUS_LINE_PATTERN);
    files.push({
      fileName: entry,
      number: match[1] as string,
      status: statusMatch ? (statusMatch[1] as string) : null,
    });
  }
  return files;
}

function parseIndexRows(readme: string): IndexRow[] {
  const rows: IndexRow[] = [];
  for (const line of readme.split("\n")) {
    const match = line.match(INDEX_ROW_PATTERN);
    if (!match) {
      continue;
    }
    const linkTarget = (match[2] as string).trim();
    rows.push({
      number: match[1] as string,
      fileName: linkTarget.replace(LEADING_DOT_SLASH_PATTERN, ""),
      status: (match[4] as string).trim(),
    });
  }
  return rows;
}

export function checkAdrIndex(dir: string): AdrIndexError[] {
  const errors: AdrIndexError[] = [];

  const adrFiles = collectAdrFiles(dir);
  const readme = readFileSync(join(dir, "README.md"), "utf8");
  const indexRows = parseIndexRows(readme);

  const adrByFileName = new Map(adrFiles.map((adr) => [adr.fileName, adr]));
  const indexByFileName = new Map(indexRows.map((row) => [row.fileName, row]));

  const filesByNumber = new Map<string, string[]>();
  for (const adr of adrFiles) {
    const names = filesByNumber.get(adr.number) ?? [];
    names.push(adr.fileName);
    filesByNumber.set(adr.number, names);
  }
  for (const [number, names] of filesByNumber) {
    if (names.length > 1) {
      errors.push({
        message: `ADR番号 ${number} が複数のファイルに採番されています: ${names.join(", ")}。いずれかを次の未使用番号にリネームして採番衝突を解消してください。`,
      });
    }
  }

  for (const adr of adrFiles) {
    if (!indexByFileName.has(adr.fileName)) {
      errors.push({
        message: `ADRファイル "${adr.fileName}" がREADME.mdのインデックス表に載っていません。「## ADR一覧（インデックス）」の表に、このADRの行を1行追加してください。`,
      });
    }

    if (adr.status === null) {
      errors.push({
        message: `ADRファイル "${adr.fileName}" に「- **ステータス**:」の行が見つかりません。メタ情報セクションにステータス行を追記してください（許容値: ${VALID_STATUS_HINT}）。`,
      });
    }
  }

  for (const row of indexRows) {
    if (!isValidStatus(row.status)) {
      errors.push({
        message: `README.mdのインデックス表の行（ADR-${row.number}）のステータス "${row.status}" は許容されていません。次のいずれかにしてください: ${VALID_STATUS_HINT}。`,
      });
    }

    const adr = adrByFileName.get(row.fileName);
    if (!adr) {
      errors.push({
        message: `README.mdのインデックス表の行（ADR-${row.number}）がリンクするファイル "${row.fileName}" が存在しません。ファイル名のタイポを直すか、該当ADRファイルを追加してください。`,
      });
      continue;
    }

    if (adr.number !== row.number) {
      errors.push({
        message: `README.mdのインデックス表の行の番号 ${row.number} と、リンク先ファイル "${row.fileName}" のADR番号 ${adr.number} が一致しません。表の番号かリンク先のどちらかを修正してください。`,
      });
    }

    // ステータス行の欠落(null)はファイル走査側で報告済みのため、ここでは比較しない
    if (adr.status !== null && adr.status !== row.status) {
      errors.push({
        message: `ADRファイル "${adr.fileName}" 本文のステータス "${adr.status}" と、README.mdのインデックス表のステータス "${row.status}" が一致しません。どちらかを正しい値に揃えてください。`,
      });
    }
  }

  return errors;
}

/** CLI 実行の結果（テストからも検証できるよう純粋に返す）。 */
export interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/**
 * 指定ディレクトリを検査し、CLI として出力すべき内容と終了コードを返す。
 * 問題があれば stderr にまとめ exitCode 1、無ければ stdout に成功メッセージを出し 0。
 */
export function runCli(dir: string): CliResult {
  const errors = checkAdrIndex(dir);
  if (errors.length === 0) {
    const count = collectAdrFiles(dir).length;
    return {
      exitCode: 0,
      stdout: `✔ ADRインデックスは整合しています (${count}件)\n`,
      stderr: "",
    };
  }

  const header = `✖ ADRインデックスに ${errors.length} 件の不整合があります (対象: ${dir})\n`;
  const body = errors.map((error) => `  - ${error.message}`).join("\n");
  return {
    exitCode: 1,
    stdout: "",
    stderr: `${header}${body}\n`,
  };
}

if (import.meta.main) {
  const targetDir = process.argv[2] ?? "docs/adr";
  const result = runCli(targetDir);
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.exitCode);
}
