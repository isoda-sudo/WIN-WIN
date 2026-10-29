import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "~/env";
import {
  auditLogs,
  banks,
  categories,
  companyAccounts,
  customers,
  editLocks,
  estimateFiles,
  fileArchives,
  invitations,
  invoiceFiles,
  invoices,
  miscPayments,
  orderFiles,
  orders,
  passwordResets,
  paymentCategories,
  projectDocuments,
  projectFiles,
  projects,
  recurringPayments,
  transferFeeRules,
  users,
  vendors,
} from "./schema";

const schema = {
  banks,
  estimateFiles,
  users,
  auditLogs,
  invitations,
  passwordResets,
  customers,
  vendors,
  categories,
  projects,
  orders,
  paymentCategories,
  recurringPayments,
  companyAccounts,
  transferFeeRules,
  invoices,
  invoiceFiles,
  miscPayments,
  editLocks,
  projectDocuments,
  projectFiles,
  orderFiles,
  fileArchives,
};

/**
 * Module-scoped singleton so the connection is reused across warm serverless
 * invocations, mirroring db.js's single `Pool` in the old Express app — but
 * sized much smaller (`max: 10` was fine for one long-lived process; on
 * Vercel, many concurrent short-lived invocations each holding connections
 * can exhaust the Supabase pooler's budget).
 *
 * `prepare: false` is required, not optional: DATABASE_URL targets Supabase's
 * connection pooler in *transaction mode* (port 6543), which does not support
 * server-side prepared statements across pooled connections.
 *
 * `statement_timeout`/`idle_timeout`/`connect_timeout` guard against a
 * pooled connection getting stuck (observed in local dev: a query whose
 * result Postgres had already sent, but the client-side socket never
 * consumed — the connection then sits busy indefinitely, permanently
 * occupying one of only `max` pool slots). Without a server-side timeout,
 * enough stuck connections silently exhaust the whole pool and every new
 * query queues forever behind them with no visible error. `statement_timeout`
 * makes Postgres itself cancel a runaway query and return an error instead,
 * which is catchable and frees the slot.
 */
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const STATEMENT_TIMEOUT_MS = 15_000;
const IDLE_TIMEOUT_SECONDS = 20;
const CONNECT_TIMEOUT_SECONDS = 10;

// In local dev, a single long-lived `next dev` process serves every request
// itself, and dashboard-heavy pages issue several sequential queries per
// request — a small pool serializes those and makes dev feel stuck.
//
// On Vercel, many concurrent invocations can each be a separate warm
// container, every one holding its own pool — with `max` per container, a
// burst of N concurrent invocations can open up to N * max connections
// against Supabase's pooler. This project shares that pooler with the old
// construct-pro app, so this can't be unbounded — but it must stay well
// above 1: a serverless function that freezes mid-response can strand a
// connection in Postgres's `active`/`ClientRead` state (result already
// sent, client never came back to read it — statement_timeout doesn't
// help, the query itself already finished). db.js hit this same failure
// mode during the old app's own development (see its "3だと...詰まりやすい"
// comment) and settled on `max: 10` there, running the same shared
// Supabase pooler without incident since — match that same headroom here.
const MAX_CONNECTIONS = 10;
/** 接続プールを作り直すときに、実行中のクエリが終わるのを待つ最長秒数（それ以降は強制的に閉じる）。 */
const RESET_GRACE_SECONDS = 3;
/** 作り直しの連打を防ぐ最短間隔。 */
const RESET_MIN_INTERVAL_MS = 5000;

function createConn(): postgres.Sql {
  return postgres(env.DATABASE_URL, {
    prepare: false,
    max: MAX_CONNECTIONS,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    connection: { statement_timeout: STATEMENT_TIMEOUT_MS },
  });
}

function createDb(sql: postgres.Sql) {
  return drizzle(sql, { schema });
}

let current = (() => {
  const conn = globalForDb.conn ?? createConn();
  if (env.NODE_ENV !== "production") {
    globalForDb.conn = conn;
  }
  return { conn, db: createDb(conn) };
})();
let lastResetAt = 0;

/**
 * 接続プールを作り直す（自己回復）。
 * 凍結した関数などで、切れた接続がプールに残ると、以降のクエリがその接続の応答を待ち続けて
 * 一覧が出なくなる。処理が一定時間を超えたときに呼び、新しい接続でやり直せる状態に戻す。
 */
export async function resetDbPool(): Promise<void> {
  const now = Date.now();
  if (now - lastResetAt < RESET_MIN_INTERVAL_MS) {
    return;
  }
  lastResetAt = now;
  const old = current.conn;
  const conn = createConn();
  current = { conn, db: createDb(conn) };
  if (env.NODE_ENV !== "production") {
    globalForDb.conn = conn;
  }
  await old.end({ timeout: RESET_GRACE_SECONDS }).catch(() => undefined);
}

/** 常に最新のプールを使う（resetDbPool で差し替わっても、呼び出し側は変更不要）。 */
export const db: ReturnType<typeof createDb> = new Proxy(
  {} as ReturnType<typeof createDb>,
  {
    get(_target, prop) {
      const value = Reflect.get(current.db, prop);
      return typeof value === "function" ? value.bind(current.db) : value;
    },
  }
);
