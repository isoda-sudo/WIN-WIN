/**
 * 銀行マスタと全銀協データ（zengin-code）の突合検証。
 * - マスタの銀行コードが全銀協に存在し、銀行名が一致するか
 * - 発注先・自社口座に登録済みの支店名が、その銀行の現行支店一覧に存在するか
 * 実行: NODE_ENV=development bun run scripts/verify-banks.ts
 */
import zengin from "zengin-code";
import { db } from "~/server/db";
import { banks, companyAccounts, vendors } from "~/server/db/schema";

// 全銀協の略称（農林中金など）とマスタ名の表記ゆれを吸収する
const norm = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/\s|銀行|支店|出張所|本店|信用金庫|信金|中央金庫|中金/g, "");

const masters = await db.select().from(banks);
let problems = 0;
const byName = new Map<string, string>();
for (const b of masters) {
  if (!b.code) {
    console.log(`[コード未設定] ${b.name}`);
    problems++;
    continue;
  }
  byName.set(b.name, b.code);
  const z = zengin[b.code];
  if (!z) {
    console.log(`[全銀協に無いコード] ${b.name} (${b.code})`);
    problems++;
    continue;
  }
  const same = norm(z.name) === norm(b.name);
  console.log(
    `${same ? "OK  " : "差異"} ${b.code} マスタ=${b.name} 全銀協=${z.name} 支店数=${Object.keys(z.branches).length}`
  );
  if (!same) {
    problems++;
  }
}

function checkBranches(
  label: string,
  rows: {
    bankBranch: string | null;
    bankName: string | null;
    id: number | string;
  }[]
) {
  for (const r of rows) {
    if (!(r.bankName && r.bankBranch)) {
      continue;
    }
    const code = byName.get(r.bankName);
    const z = code ? zengin[code] : undefined;
    if (!z) {
      continue;
    }
    const target = norm(r.bankBranch);
    const found = Object.values(z.branches).some(
      (br) => norm(br.name) === target
    );
    if (!found) {
      console.log(
        `[存在しない支店] ${label}#${r.id} ${r.bankName} ${r.bankBranch}`
      );
      problems++;
    }
  }
}
checkBranches(
  "発注先",
  await db
    .select({
      bankBranch: vendors.bankBranch,
      bankName: vendors.bankName,
      id: vendors.id,
    })
    .from(vendors)
);
checkBranches(
  "自社口座",
  await db
    .select({
      bankBranch: companyAccounts.branchName,
      bankName: companyAccounts.bankName,
      id: companyAccounts.id,
    })
    .from(companyAccounts)
);
console.log(problems === 0 ? "問題なし" : `要確認: ${problems}件`);
process.exit(0);
