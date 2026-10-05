import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { checkAdrIndex, runCli } from "../../scripts/check-adr-index";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { force: true, recursive: true });
  }
  tempDirs.length = 0;
});

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), "check-adr-index-"));
  tempDirs.push(dir);
  return dir;
}

function adrBody({
  number,
  title,
  status,
}: {
  number: string;
  title: string;
  status: string;
}) {
  return `# ADR-${number}: ${title}

## メタ情報

- **ステータス**: ${status}
- **日付**: 2026-07-03
- **決定者**: テンプレートメンテナー
`;
}

interface IndexRow {
  date: string;
  number: string;
  slug: string;
  status: string;
  title: string;
}

function buildReadme(rows: IndexRow[]) {
  const header = `# Architecture Decision Records (ADR)

## ADR一覧（インデックス）

| 番号 | タイトル | ステータス | 日付 |
| --- | --- | --- | --- |
`;
  const body = rows
    .map(
      (row) =>
        `| [${row.number}](./${row.number}-${row.slug}.md) | ${row.title} | ${row.status} | ${row.date} |`
    )
    .join("\n");
  return `${header}${body}\n`;
}

describe("checkAdrIndex", () => {
  test("Given all ADR files are listed in the index with matching statuses When checking Then no errors are returned", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0001-use-bun.md"),
      adrBody({ number: "0001", title: "Bun採用", status: "承認(Accepted)" })
    );
    writeFileSync(
      join(dir, "0002-use-trpc.md"),
      adrBody({ number: "0002", title: "tRPC採用", status: "提案中(Proposed)" })
    );
    writeFileSync(
      join(dir, "README.md"),
      buildReadme([
        {
          number: "0001",
          slug: "use-bun",
          title: "Bun採用",
          status: "承認(Accepted)",
          date: "2026-07-03",
        },
        {
          number: "0002",
          slug: "use-trpc",
          title: "tRPC採用",
          status: "提案中(Proposed)",
          date: "2026-07-03",
        },
      ])
    );

    // When
    const errors = checkAdrIndex(dir);

    // Then
    expect(errors).toEqual([]);
  });

  test("Given an ADR file that is missing from the index table When checking Then it reports the missing row with the file name", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0001-use-bun.md"),
      adrBody({ number: "0001", title: "Bun採用", status: "承認(Accepted)" })
    );
    writeFileSync(
      join(dir, "0002-use-trpc.md"),
      adrBody({ number: "0002", title: "tRPC採用", status: "承認(Accepted)" })
    );
    writeFileSync(
      join(dir, "README.md"),
      buildReadme([
        {
          number: "0001",
          slug: "use-bun",
          title: "Bun採用",
          status: "承認(Accepted)",
          date: "2026-07-03",
        },
      ])
    );

    // When
    const errors = checkAdrIndex(dir);

    // Then
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("0002-use-trpc.md");
    expect(errors[0]?.message).toContain("インデックス");
  });

  test("Given an index row that points to a non-existent file When checking Then it reports the broken link", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0001-use-bun.md"),
      adrBody({ number: "0001", title: "Bun採用", status: "承認(Accepted)" })
    );
    writeFileSync(
      join(dir, "README.md"),
      buildReadme([
        {
          number: "0001",
          slug: "use-bun",
          title: "Bun採用",
          status: "承認(Accepted)",
          date: "2026-07-03",
        },
        {
          number: "0002",
          slug: "ghost-decision",
          title: "存在しない決定",
          status: "承認(Accepted)",
          date: "2026-07-03",
        },
      ])
    );

    // When
    const errors = checkAdrIndex(dir);

    // Then
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("0002-ghost-decision.md");
    expect(errors[0]?.message).toContain("存在しません");
  });

  test("Given an ADR body status that differs from the index status When checking Then it reports the mismatch with both values", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0001-use-bun.md"),
      adrBody({ number: "0001", title: "Bun採用", status: "承認(Accepted)" })
    );
    writeFileSync(
      join(dir, "README.md"),
      buildReadme([
        {
          number: "0001",
          slug: "use-bun",
          title: "Bun採用",
          status: "提案中(Proposed)",
          date: "2026-07-03",
        },
      ])
    );

    // When
    const errors = checkAdrIndex(dir);

    // Then
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("0001-use-bun.md");
    expect(errors[0]?.message).toContain("承認(Accepted)");
    expect(errors[0]?.message).toContain("提案中(Proposed)");
  });

  test("Given an index status that is not one of the four defined kinds When checking Then it reports the invalid status", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0001-use-bun.md"),
      adrBody({ number: "0001", title: "Bun採用", status: "却下" })
    );
    writeFileSync(
      join(dir, "README.md"),
      buildReadme([
        {
          number: "0001",
          slug: "use-bun",
          title: "Bun採用",
          status: "却下",
          date: "2026-07-03",
        },
      ])
    );

    // When
    const errors = checkAdrIndex(dir);

    // Then
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("却下");
    expect(errors[0]?.message).toContain("提案中(Proposed)");
    expect(errors[0]?.message).toContain("承認(Accepted)");
  });

  test("Given a valid Superseded status with an ADR number When checking Then no invalid-status error is reported", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0001-use-bun.md"),
      adrBody({
        number: "0001",
        title: "Bun採用",
        status: "置換(Superseded by ADR-0005)",
      })
    );
    writeFileSync(
      join(dir, "README.md"),
      buildReadme([
        {
          number: "0001",
          slug: "use-bun",
          title: "Bun採用",
          status: "置換(Superseded by ADR-0005)",
          date: "2026-07-03",
        },
      ])
    );

    // When
    const errors = checkAdrIndex(dir);

    // Then
    expect(errors).toEqual([]);
  });

  test("Given two ADR files sharing the same number When checking Then it reports the numbering collision with both file names", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0002-use-trpc.md"),
      adrBody({ number: "0002", title: "tRPC採用", status: "承認(Accepted)" })
    );
    writeFileSync(
      join(dir, "0002-use-graphql.md"),
      adrBody({
        number: "0002",
        title: "GraphQL採用",
        status: "承認(Accepted)",
      })
    );
    writeFileSync(
      join(dir, "README.md"),
      buildReadme([
        {
          number: "0002",
          slug: "use-trpc",
          title: "tRPC採用",
          status: "承認(Accepted)",
          date: "2026-07-03",
        },
        {
          number: "0002",
          slug: "use-graphql",
          title: "GraphQL採用",
          status: "承認(Accepted)",
          date: "2026-07-03",
        },
      ])
    );

    // When
    const errors = checkAdrIndex(dir);

    // Then
    const collisionError = errors.find((error) =>
      error.message.includes("採番")
    );
    expect(collisionError).toBeDefined();
    expect(collisionError?.message).toContain("0002");
    expect(collisionError?.message).toContain("0002-use-trpc.md");
    expect(collisionError?.message).toContain("0002-use-graphql.md");
  });

  test("Given an index row whose displayed number differs from the linked file's number When checking Then it reports the number mismatch", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0005-use-foo.md"),
      adrBody({ number: "0005", title: "Foo採用", status: "承認(Accepted)" })
    );
    // 表の番号(0006)とリンク先ファイルの番号(0005)が食い違う行を手書きで用意する
    writeFileSync(
      join(dir, "README.md"),
      `# Architecture Decision Records (ADR)

## ADR一覧（インデックス）

| 番号 | タイトル | ステータス | 日付 |
| --- | --- | --- | --- |
| [0006](./0005-use-foo.md) | Foo採用 | 承認(Accepted) | 2026-07-03 |
`
    );

    // When
    const errors = checkAdrIndex(dir);

    // Then
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("0005-use-foo.md");
    expect(errors[0]?.message).toContain("0006");
    expect(errors[0]?.message).toContain("0005");
  });

  test("Given an ADR file without a status line When checking Then it reports the missing status metadata", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0001-use-bun.md"),
      `# ADR-0001: Bun採用

## メタ情報

- **日付**: 2026-07-03
- **決定者**: テンプレートメンテナー
`
    );
    writeFileSync(
      join(dir, "README.md"),
      buildReadme([
        {
          number: "0001",
          slug: "use-bun",
          title: "Bun採用",
          status: "承認(Accepted)",
          date: "2026-07-03",
        },
      ])
    );

    // When
    const errors = checkAdrIndex(dir);

    // Then
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("0001-use-bun.md");
    expect(errors[0]?.message).toContain("ステータス");
  });

  test("Given template.md and README.md exist alongside ADR files When checking Then they are not treated as ADR files", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0001-use-bun.md"),
      adrBody({ number: "0001", title: "Bun採用", status: "承認(Accepted)" })
    );
    writeFileSync(
      join(dir, "template.md"),
      adrBody({
        number: "NNNN",
        title: "<タイトル>",
        status: "提案中(Proposed)",
      })
    );
    writeFileSync(
      join(dir, "README.md"),
      buildReadme([
        {
          number: "0001",
          slug: "use-bun",
          title: "Bun採用",
          status: "承認(Accepted)",
          date: "2026-07-03",
        },
      ])
    );

    // When
    const errors = checkAdrIndex(dir);

    // Then
    expect(errors).toEqual([]);
  });
});

describe("runCli", () => {
  test("Given a consistent ADR directory When running the CLI Then it exits 0 with a success message including the count", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0001-use-bun.md"),
      adrBody({ number: "0001", title: "Bun採用", status: "承認(Accepted)" })
    );
    writeFileSync(
      join(dir, "README.md"),
      buildReadme([
        {
          number: "0001",
          slug: "use-bun",
          title: "Bun採用",
          status: "承認(Accepted)",
          date: "2026-07-03",
        },
      ])
    );

    // When
    const result = runCli(dir);

    // Then
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("✔ ADRインデックスは整合しています");
    expect(result.stdout).toContain("(1件)");
    expect(result.stderr).toBe("");
  });

  test("Given an inconsistent ADR directory When running the CLI Then it exits 1 and writes the errors to stderr", () => {
    // Given
    const dir = createTempDir();
    writeFileSync(
      join(dir, "0001-use-bun.md"),
      adrBody({ number: "0001", title: "Bun採用", status: "承認(Accepted)" })
    );
    writeFileSync(
      join(dir, "0002-use-trpc.md"),
      adrBody({ number: "0002", title: "tRPC採用", status: "承認(Accepted)" })
    );
    writeFileSync(
      join(dir, "README.md"),
      buildReadme([
        {
          number: "0001",
          slug: "use-bun",
          title: "Bun採用",
          status: "承認(Accepted)",
          date: "2026-07-03",
        },
      ])
    );

    // When
    const result = runCli(dir);

    // Then
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("0002-use-trpc.md");
  });
});
