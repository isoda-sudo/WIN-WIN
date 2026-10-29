/**
 * schema.ts と実DBの差分を表示する読み取り専用スクリプト。
 * information_schema / pg_indexes / pg_constraint への SELECT のみ。DBは一切変更しない。
 * 接続文字列は表示しない。
 *   bun run scripts/inspect-db-schema.ts
 */
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
// biome-ignore lint/performance/noNamespaceImport: 全テーブルを列挙して差分を取るため
import * as schema from "~/server/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

const tables: PgTable[] = [];
for (const value of Object.values(schema)) {
  try {
    if (typeof value === "object" && value !== null) {
      getTableConfig(value as PgTable);
      tables.push(value as PgTable);
    }
  } catch {
    // not a table
  }
}

const dbCols = await sql<{ table_name: string; column_name: string }[]>`
  select table_name, column_name from information_schema.columns
  where table_schema = 'public'`;
const dbIdx = await sql<{ tablename: string; indexname: string }[]>`
  select tablename, indexname from pg_indexes where schemaname = 'public'`;
const dbCons = await sql<{ table_name: string; conname: string }[]>`
  select c.relname as table_name, k.conname
  from pg_constraint k join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'`;

const colSet = new Set(dbCols.map((r) => `${r.table_name}.${r.column_name}`));
const tableSet = new Set(dbCols.map((r) => r.table_name));
const idxSet = new Set(dbIdx.map((r) => r.indexname));
const conSet = new Set(dbCons.map((r) => r.conname));

const missing: string[] = [];

for (const t of tables) {
  const cfg = getTableConfig(t);
  const exists = tableSet.has(cfg.name);
  if (!exists) {
    missing.push(`TABLE ${cfg.name}`);
  }
  for (const c of cfg.columns) {
    const key = `${cfg.name}.${c.name}`;
    if (exists && !colSet.has(key)) {
      missing.push(`COLUMN ${key}`);
    }
  }
  for (const i of cfg.indexes) {
    const name = i.config.name;
    if (name && !idxSet.has(name)) {
      missing.push(`INDEX ${name} (on ${cfg.name})`);
    }
  }
  for (const ck of cfg.checks) {
    if (!conSet.has(ck.name)) {
      missing.push(`CHECK ${ck.name} (on ${cfg.name})`);
    }
  }
}

// schema.ts に無いのに実DBに残っているテーブル/列（削除予定のもの、または意図的に残すもの）
const schemaTables = new Set(tables.map((t) => getTableConfig(t).name));
const schemaCols = new Set(
  tables.flatMap((t) => {
    const cfg = getTableConfig(t);
    return cfg.columns.map((c) => `${cfg.name}.${c.name}`);
  })
);
const extra: string[] = [];
for (const name of tableSet) {
  if (!schemaTables.has(name)) {
    extra.push(`TABLE ${name}`);
  }
}
for (const key of colSet) {
  const [tableName] = key.split(".");
  if (tableName && schemaTables.has(tableName) && !schemaCols.has(key)) {
    extra.push(`COLUMN ${key}`);
  }
}

console.log(`tables in schema.ts: ${tables.length}`);
console.log(`MISSING in DB (${missing.length}):`);
for (const m of missing) {
  console.log(`  - ${m}`);
}
console.log(`EXTRA in DB (pending removal) (${extra.length}):`);
for (const e of extra) {
  console.log(`  - ${e}`);
}
await sql.end();
