import type { TRPCClientErrorLike } from "@trpc/client";
import type { AppRouter } from "~/server/api/root";

/**
 * tRPCのエラーからユーザー向けメッセージを取り出す。サーバー側で意図的に
 * TRPCErrorへ日本語メッセージを設定したケース（在庫不足・楽観ロック競合等）は
 * そのまま表示し、Zod検証エラーや予期しない内部エラー（英語の生メッセージが
 * 混入しうる）は必ずfallback（日本語）を使う。
 */
export function friendlyErrorMessage(
  err: TRPCClientErrorLike<AppRouter>,
  fallback: string
): string {
  if (err.data?.zodError) {
    return fallback;
  }
  if (err.data?.code === "INTERNAL_SERVER_ERROR") {
    return fallback;
  }
  return err.message || fallback;
}
