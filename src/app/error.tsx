"use client";

import { useEffect } from "react";
import { Button } from "~/components/ui/button";
import { reportClientError } from "~/lib/report-client-error";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-semibold text-xl">問題が発生しました</h1>
      <p className="text-muted-foreground text-sm">
        一時的な不具合の可能性があります。もう一度お試しください。続く場合は、管理者にご連絡ください。
      </p>
      {error.digest && (
        <p className="text-muted-foreground text-xs">
          エラー番号: {error.digest}
        </p>
      )}
      <Button onClick={reset}>再読み込み</Button>
    </main>
  );
}
