/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import {
  ACCOUNTING_ROLES,
  FINANCIAL_READ_ROLES,
  MASTER_READ_ROLES,
  READ_ONLY_ROLES,
  REPORTING_ROLES,
} from "~/lib/roles";
import { resolveAuthedUser } from "~/server/auth/session";
import { resetDbPool } from "~/server/db";
import { assertEditLockNotHeldByOther } from "~/server/edit-lock/guard";

export type { AuthedUser } from "~/server/auth/session";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 *
 * Resolves the logged-in user (if any) from the httpOnly auth cookie via
 * `resolveAuthedUser` — the same resolution the plain PDF/email Route Handlers
 * use, so both surfaces enforce identical session/role rules.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const user = await resolveAuthedUser(opts.headers);
  return { ...opts, user };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const DEV_DELAY_MAX_MS = 400;
const DEV_DELAY_MIN_MS = 100;

/** 1つの処理がこの時間（ミリ秒）を超えたら、DB接続が固まったとみなして接続を作り直す。 */
const PROCEDURE_WATCHDOG_MS = 12_000;

const timingMiddleware = t.middleware(async ({ ctx, next, path, type }) => {
  await enforceEditLock({ ctx, path, type });
  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs =
      Math.floor(Math.random() * DEV_DELAY_MAX_MS) + DEV_DELAY_MIN_MS;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // 一覧などが固まって300秒も待たされないよう、一定時間で打ち切って接続を作り直す。
  // クライアントは自動で再取得し、新しい接続で復帰する。
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      resetDbPool().finally(() =>
        reject(
          new TRPCError({
            code: "TIMEOUT",
            message:
              "データベースの応答が遅れています。しばらくして、もう一度読み込んでください。",
          })
        )
      );
    }, PROCEDURE_WATCHDOG_MS);
  });
  try {
    return await Promise.race([next(), watchdog]);
  } finally {
    clearTimeout(timer);
  }
});

/** 排他制御の対象外の更新系処理（編集ではない操作）。 */
const EDIT_LOCK_EXEMPT_PREFIXES = ["editLocks.", "dashboard."];

/**
 * 排他制御の強制。排他制御のある画面（ヘッダ x-edit-scope）からの更新系は、別の人（または同じ人の別のタブ）が
 * その画面を編集中なら拒否する。画面側の無効化（閲覧のみ表示）に頼らず、モーダルや一覧外の操作も含めて止める。
 * すべての手続きが通る timingMiddleware から呼ぶ（手続きごとの基底が別々のため）。
 */
async function enforceEditLock(opts: {
  ctx: { headers: Headers; user: { id: number } | null };
  path: string;
  type: string;
}): Promise<void> {
  const { ctx, path, type } = opts;
  if (
    type !== "mutation" ||
    !ctx.user ||
    EDIT_LOCK_EXEMPT_PREFIXES.some((p) => path.startsWith(p))
  ) {
    return;
  }
  const scope = ctx.headers.get("x-edit-scope");
  if (scope) {
    await assertEditLockNotHeldByOther({
      clientId: ctx.headers.get("x-edit-client"),
      scope,
      userId: ctx.user.id,
    });
  }
}

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure — equivalent to the old app's `authMiddleware`.
 * Throws UNAUTHORIZED if `ctx.user` wasn't resolved (missing/invalid/expired cookie,
 * revoked token_version, or suspended/deleted account — see `createTRPCContext`).
 */
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthed);

/**
 * Role-gated procedure — equivalent to the old app's `requireRole([...])`.
 * Role is re-checked from `ctx.user` (itself freshly loaded from the DB per
 * request in `createTRPCContext`, not trusted from the JWT), matching the old
 * app's "role changes take effect immediately" design.
 */
function requireRole(allowedRoles: readonly string[]) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    if (!allowedRoles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "このページを閲覧する権限がありません",
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const adminProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthed)
  .use(requireRole(["admin"]));

export const accountingOrAdminProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthed)
  .use(requireRole(ACCOUNTING_ROLES));

/**
 * 売上管理表・支払い予定表の「読み取り」用。管理者・経理に加え、閲覧専用の
 * 税理士・社労士（tax_advisor）も呼べる。書き込みには絶対に使わない
 * （書き込みは accountingOrAdminProcedure のまま）。
 */
export const financialReadProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthed)
  .use(requireRole(FINANCIAL_READ_ROLES));

export const staffOrAdminProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthed)
  .use(requireRole(["admin", "staff"]));

export const staffOrAdminOrViewerProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthed)
  .use(requireRole(["admin", "staff", "viewer"]));

export const adminOrViewerProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthed)
  .use(requireRole(["admin", "viewer"]));

export const reportingProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthed)
  .use(requireRole(REPORTING_ROLES));

/**
 * Read access for master data (customers/vendors/categories): admin/accounting/
 * staff/viewer. 税理士・社労士（tax_advisor）は含まない（マスタ・顧客個人情報は
 * 閲覧不可）。Writes to these masters are admin-only (`adminProcedure`).
 */
export const masterReadableProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthed)
  .use(requireRole(MASTER_READ_ROLES));

/**
 * Blocks the read-only roles (viewer, tax_advisor) from write mutations while allowing
 * every other authenticated role through (mirrors `protectedProcedure` minus
 * viewer). Used for `projects`/`orders` mutations that were previously wide
 * open to any authenticated user.
 */
function requireNotRole(blockedRoles: readonly string[]) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    if (blockedRoles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "閲覧専用アカウントは編集できません",
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const notViewerProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthed)
  .use(requireNotRole(READ_ONLY_ROLES));
