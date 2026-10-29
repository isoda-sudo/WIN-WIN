/** 画面の予期しないエラーをサーバーのログに送る（失敗しても何もしない）。 */
export function reportClientError(error: Error & { digest?: string }): void {
  try {
    fetch("/api/client-error", {
      body: JSON.stringify({
        digest: error.digest,
        message: error.message?.slice(0, 500),
        path: window.location.pathname,
        stack: error.stack?.slice(0, 2000),
      }),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  } catch {
    // 送信できなくても画面の表示には影響させない
  }
}
