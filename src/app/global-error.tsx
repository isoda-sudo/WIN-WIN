"use client";

import { useEffect } from "react";
import { reportClientError } from "~/lib/report-client-error";

export default function GlobalError({
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
    <html lang="ja">
      <body
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          gap: 16,
          justifyContent: "center",
          minHeight: "100svh",
          padding: 24,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20 }}>問題が発生しました</h1>
        <p style={{ color: "#666", fontSize: 14 }}>
          もう一度お試しください。続く場合は、管理者にご連絡ください。
        </p>
        <button
          onClick={reset}
          style={{
            background: "#7c3aed",
            border: 0,
            borderRadius: 6,
            color: "#fff",
            cursor: "pointer",
            padding: "8px 16px",
          }}
          type="button"
        >
          再読み込み
        </button>
      </body>
    </html>
  );
}
