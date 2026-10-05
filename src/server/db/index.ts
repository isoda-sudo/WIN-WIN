import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "~/env";
import {
  auditLogs,
  categories,
  customers,
  invitations,
  invoiceFiles,
  invoices,
  miscPayments,
  miscReceipts,
  orderFiles,
  orders,
  passwordResets,
  paymentRecords,
  projectFiles,
  projects,
  receipts,
  users,
  vendors,
} from "./schema";

const schema = {
  users,
  auditLogs,
  invitations,
  passwordResets,
  customers,
  vendors,
  categories,
  projects,
  orders,
  paymentRecords,
  receipts,
  invoices,
  invoiceFiles,
  miscPayments,
  miscReceipts,
  projectFiles,
  orderFiles,
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

const conn =
  globalForDb.conn ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: MAX_CONNECTIONS,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    connection: { statement_timeout: STATEMENT_TIMEOUT_MS },
  });

if (env.NODE_ENV !== "production") {
  globalForDb.conn = conn;
}

export const db = drizzle(conn, { schema });
