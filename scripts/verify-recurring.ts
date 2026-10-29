/**
 * 定期支払いの動作検証（ローカル開発サーバーに対して実行）。
 * 約50件の定義を API 経由で登録し、月別・年別の展開が正しいかを確認し、最後に全て削除（論理削除）する。
 * 使い方: BASE=http://localhost:3013 EMAIL=... PASSWORD=... bun scripts/verify-recurring.ts
 * 注意: 共有DBに「[検証]」で始まる定義を一時的に作る。実行後に削除するが、監査ログは残る。
 */

const BASE = process.env.BASE ?? "http://localhost:3013";
const EMAIL = process.env.EMAIL ?? "";
const PASSWORD = process.env.PASSWORD ?? "";
// 名称の接頭辞。KEEP=1 のときは検証後に削除せず、テストデータとして残す。
const PREFIX = process.env.PREFIX ?? "[検証]";
const KEEP = process.env.KEEP === "1";

let cookie = "";

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`login failed ${res.status}`);
  }
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

async function call<T>(
  path: string,
  input: unknown,
  method: "GET" | "POST"
): Promise<T> {
  const url =
    method === "GET"
      ? `${BASE}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
      : `${BASE}/api/trpc/${path}`;
  const res = await fetch(url, {
    body: method === "POST" ? JSON.stringify({ json: input }) : undefined,
    headers: { "content-type": "application/json", cookie },
    method,
  });
  const body = (await res.json()) as {
    error?: { json?: { message?: string } };
    result?: { data?: { json?: T } };
  };
  if (!res.ok) {
    throw new Error(`${path}: ${body.error?.json?.message ?? res.status}`);
  }
  return body.result?.data?.json as T;
}

interface Def {
  dueDay?: number | null;
  dueDayIsMonthEnd?: boolean;
  endMonth?: string | null;
  frequency: "monthly" | "yearly";
  monthOfYear?: number | null;
  name: string;
  startMonth: string;
}

interface Row {
  dueDate: string;
  paymentNo?: string | null;
  period: string;
  recurringId: number;
}
interface YearView {
  months: { month: string; rows: Row[] }[];
}

function expectedMonths(d: Def, year: number): string[] {
  const out: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, "0")}`;
    if (ym < d.startMonth || (d.endMonth && ym > d.endMonth)) {
      continue;
    }
    if (d.frequency === "yearly" && d.monthOfYear !== m) {
      continue;
    }
    out.push(ym);
  }
  return out;
}

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function expectedDue(d: Def, ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const last = lastDay(y, m);
  const day =
    d.dueDayIsMonthEnd || d.dueDay == null ? last : Math.min(d.dueDay, last);
  return `${ym}-${String(day).padStart(2, "0")}`;
}

function buildCases(): Def[] {
  const cases: Def[] = [];
  let n = 0;
  const name = () => `${PREFIX}${String(++n).padStart(2, "0")}`;
  // 毎年: 1〜12月（日付指定）
  for (let m = 1; m <= 12; m++) {
    cases.push({
      dueDay: 17,
      frequency: "yearly",
      monthOfYear: m,
      name: name(),
      startMonth: "2026-01",
    });
  }
  // 毎年: 月末・31日指定（2月・30日月の丸め）
  for (const m of [2, 4, 6, 9, 11, 12]) {
    cases.push({
      dueDayIsMonthEnd: true,
      frequency: "yearly",
      monthOfYear: m,
      name: name(),
      startMonth: "2026-01",
    });
    cases.push({
      dueDay: 31,
      frequency: "yearly",
      monthOfYear: m,
      name: name(),
      startMonth: "2026-01",
    });
  }
  // 毎月: 期間全体・開始/終了の境界
  cases.push({
    dueDay: 17,
    frequency: "monthly",
    name: name(),
    startMonth: "2026-01",
  });
  cases.push({
    dueDay: 1,
    endMonth: "2026-11",
    frequency: "monthly",
    name: name(),
    startMonth: "2026-01",
  });
  cases.push({
    dueDay: 31,
    frequency: "monthly",
    name: name(),
    startMonth: "2026-03",
  });
  cases.push({
    dueDayIsMonthEnd: true,
    frequency: "monthly",
    name: name(),
    startMonth: "2026-06",
  });
  cases.push({
    dueDay: 15,
    endMonth: "2026-06",
    frequency: "monthly",
    name: name(),
    startMonth: "2026-06",
  });
  cases.push({
    dueDay: 29,
    endMonth: "2026-12",
    frequency: "monthly",
    name: name(),
    startMonth: "2026-12",
  });
  cases.push({
    dueDay: 5,
    frequency: "monthly",
    name: name(),
    startMonth: "2027-02",
  });
  cases.push({
    dueDay: 5,
    endMonth: "2025-12",
    frequency: "monthly",
    name: name(),
    startMonth: "2025-01",
  });
  // 毎年: 開始月・終了月の境界（支払月が範囲の内外）
  cases.push({
    dueDay: 10,
    frequency: "yearly",
    monthOfYear: 6,
    name: name(),
    startMonth: "2026-07",
  });
  cases.push({
    dueDay: 10,
    frequency: "yearly",
    monthOfYear: 6,
    name: name(),
    startMonth: "2026-06",
  });
  cases.push({
    dueDay: 10,
    endMonth: "2026-05",
    frequency: "yearly",
    monthOfYear: 6,
    name: name(),
    startMonth: "2026-01",
  });
  cases.push({
    dueDay: 10,
    endMonth: "2026-06",
    frequency: "yearly",
    monthOfYear: 6,
    name: name(),
    startMonth: "2026-01",
  });
  cases.push({
    dueDay: 10,
    frequency: "yearly",
    monthOfYear: 1,
    name: name(),
    startMonth: "2025-01",
  });
  cases.push({
    dueDay: 10,
    frequency: "yearly",
    monthOfYear: 12,
    name: name(),
    startMonth: "2027-01",
  });
  // 年払い・月末のうるう年境界／終了月なし／長期
  cases.push({
    dueDayIsMonthEnd: true,
    frequency: "yearly",
    monthOfYear: 2,
    name: name(),
    startMonth: "2024-01",
  });
  cases.push({
    dueDay: 29,
    frequency: "yearly",
    monthOfYear: 2,
    name: name(),
    startMonth: "2026-01",
  });
  // 毎月の支払日いろいろ
  for (const d of [1, 2, 10, 20, 28, 30]) {
    cases.push({
      dueDay: d,
      frequency: "monthly",
      name: name(),
      startMonth: "2026-01",
    });
  }
  return cases;
}

interface Created {
  def: Def;
  id: number;
  version: number;
}

const YEAR = 2026;
const PAYMENT_NO_RE = /^WW\d{2}-\d{2}-\d{3}$/;

async function registerAll(): Promise<Created[]> {
  const created: Created[] = [];
  for (const def of buildCases()) {
    const res = await call<{ id: number; version: number }>(
      "recurringPayments.create",
      {
        amount: 1000,
        branch: null,
        categoryName: null,
        notes: null,
        payee: null,
        ...def,
      },
      "POST"
    );
    created.push({ def, id: res.id, version: res.version });
  }
  return created;
}

async function periodsOf(id: number): Promise<Row[]> {
  const yv = await call<YearView>(
    "recurringPayments.yearView",
    { year: YEAR },
    "GET"
  );
  return yv.months.flatMap((m) => m.rows).filter((r) => r.recurringId === id);
}

async function checkYearView(created: Created[]): Promise<string[]> {
  const failures: string[] = [];
  const yv = await call<YearView>(
    "recurringPayments.yearView",
    { year: YEAR },
    "GET"
  );
  const all = yv.months.flatMap((m) => m.rows);
  for (const { def, id } of created) {
    const rows = all.filter((r) => r.recurringId === id);
    const got = rows.map((r) => r.period).sort();
    const want = expectedMonths(def, YEAR);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      failures.push(
        `${def.name} ${def.frequency}: 期待 ${want.join(",") || "なし"} / 実際 ${got.join(",") || "なし"}`
      );
      continue;
    }
    for (const r of rows) {
      const wantDue = expectedDue(def, r.period);
      if (r.dueDate !== wantDue) {
        failures.push(
          `${def.name} ${r.period}: 支払期日 期待 ${wantDue} / 実際 ${r.dueDate}`
        );
      }
    }
  }
  return failures;
}

async function checkMonthViews(created: Created[]): Promise<string[]> {
  const failures: string[] = [];
  const yearly = created.filter((c) => c.def.frequency === "yearly");
  for (let m = 1; m <= 12; m++) {
    const ym = `${YEAR}-${String(m).padStart(2, "0")}`;
    const mv = await call<{ rows: Row[] }>(
      "recurringPayments.monthView",
      { month: ym },
      "GET"
    );
    for (const { def, id } of yearly) {
      const has = mv.rows.some((r) => r.recurringId === id);
      const want = expectedMonths(def, YEAR).includes(ym);
      if (has !== want) {
        failures.push(
          `${def.name} monthView ${ym}: 期待 ${want} / 実際 ${has}`
        );
      }
    }
  }
  return failures;
}

async function checkSwitch(created: Created[]): Promise<string[]> {
  const sw = created.find(
    (c) =>
      c.def.frequency === "monthly" &&
      c.def.endMonth == null &&
      c.def.startMonth === "2026-01"
  );
  if (!sw) {
    return [];
  }
  const failures: string[] = [];
  const toYearly = await call<{ version: number }>(
    "recurringPayments.update",
    {
      ...sw.def,
      amount: 1000,
      frequency: "yearly",
      id: sw.id,
      monthOfYear: 4,
      version: sw.version,
    },
    "POST"
  );
  const p1 = (await periodsOf(sw.id)).map((r) => r.period);
  if (JSON.stringify(p1) !== JSON.stringify([`${YEAR}-04`])) {
    failures.push(`毎月→年払い 切替後: ${p1.join(",")}`);
  }
  await call(
    "recurringPayments.update",
    {
      ...sw.def,
      amount: 1000,
      frequency: "monthly",
      id: sw.id,
      monthOfYear: null,
      version: toYearly.version,
    },
    "POST"
  );
  const count = (await periodsOf(sw.id)).length;
  if (count !== 12) {
    failures.push(`年払い→毎月 切替後: ${count}件`);
  }
  return failures;
}

// 検証する月（YYYY-MM）。既定は現在（JST）の月。削除時に未払いの具体化行が消える
// 当月以降を使うこと（過去月だと、支払IDの付いた未払い行が残ってしまう）。
function checkMonth(): string {
  const fromEnv = process.env.CHECK_MONTH;
  if (fromEnv) {
    return fromEnv;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(new Date());
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${pick("year")}-${pick("month")}`;
}

// ensureMonth の後、年次ビューのその月の定期支払い行すべてに支払IDが付き、一意であること。
async function checkPaymentNos(): Promise<string[]> {
  const month = checkMonth();
  const failures: string[] = [];
  const first = await call<{ created: number }>(
    "recurringPayments.ensureMonth",
    { month },
    "POST"
  );
  const second = await call<{ created: number }>(
    "recurringPayments.ensureMonth",
    { month },
    "POST"
  );
  if (second.created !== 0) {
    failures.push(
      `ensureMonth ${month}: 2回目が冪等でない（作成 ${second.created} 件）`
    );
  }
  const yv = await call<YearView>(
    "recurringPayments.yearView",
    { year: Number(month.slice(0, 4)) },
    "GET"
  );
  const rows = yv.months.find((m) => m.month === month)?.rows ?? [];
  const seen = new Set<string>();
  for (const r of rows) {
    const no = r.paymentNo ?? "";
    if (!PAYMENT_NO_RE.test(no)) {
      failures.push(
        `${month} recurringId ${r.recurringId}: 支払ID不正 "${no}"`
      );
    } else if (seen.has(no)) {
      failures.push(`${month}: 支払ID重複 ${no}`);
    }
    seen.add(no);
  }
  console.log(
    `ensureMonth ${month}: 1回目 作成 ${first.created} 件 / 行 ${rows.length} 件`
  );
  return failures;
}

async function cleanup(): Promise<number> {
  const list = await call<{ id: number; name: string; version: number }[]>(
    "recurringPayments.list",
    undefined,
    "GET"
  );
  const mine = list.filter((d) => d.name.startsWith(PREFIX));
  for (const d of mine) {
    await call(
      "recurringPayments.delete",
      { id: d.id, version: d.version },
      "POST"
    );
  }
  return mine.length;
}

async function main() {
  await login();
  const created = await registerAll();
  let failures: string[] = [];
  let removed = 0;
  try {
    failures = [
      ...(await checkYearView(created)),
      ...(await checkMonthViews(created)),
      ...(await checkSwitch(created)),
      ...(await checkPaymentNos()),
    ];
  } finally {
    removed = KEEP ? 0 : await cleanup();
  }
  console.log(
    `登録 ${created.length} 件 / 検証失敗 ${failures.length} 件 / 後始末で削除 ${removed} 件${KEEP ? "（KEEP=1: テストデータとして残した）" : ""}`
  );
  for (const f of failures) {
    console.log(` - ${f}`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
