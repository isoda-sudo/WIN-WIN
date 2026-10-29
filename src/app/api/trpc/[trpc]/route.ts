import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

/**
 * 一覧などの取得が固まったとき、既定の300秒まで待たずに30秒で打ち切る（接続を解放し、再読み込みで復帰できるようにする）。
 */
export const maxDuration = 30;

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = (req: NextRequest) =>
  createTRPCContext({
    headers: req.headers,
  });

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError:
      env.NODE_ENV === "development"
        ? (_ctx) => {
            // Error handling can be implemented here if needed
          }
        : undefined,
  });

export { handler as GET, handler as POST };
