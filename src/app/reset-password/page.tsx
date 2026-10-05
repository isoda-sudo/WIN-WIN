"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<
    "loading" | "invalid" | "ready" | "done"
  >("loading");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json() as Promise<{ valid: boolean }>)
      .then((data) => setStatus(data.valid ? "ready" : "invalid"))
      .catch(() => setStatus("invalid"));
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError("パスワードは8文字以上で設定してください");
      return;
    }
    if (password !== password2) {
      setError("パスワードが一致しません");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "再設定に失敗しました");
        return;
      }
      setStatus("done");
    } catch {
      setError("エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-xl">
            パスワード再設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status === "loading" && (
            <p className="text-center text-muted-foreground text-sm">
              リンクを確認しています...
            </p>
          )}
          {status === "invalid" && (
            <div className="flex flex-col gap-4">
              <Alert variant="destructive">
                <AlertDescription>
                  リンクが無効か、有効期限（1時間）が切れています。もう一度パスワード再設定をリクエストしてください。
                </AlertDescription>
              </Alert>
              <Button asChild>
                <Link href="/forgot-password">再設定をリクエスト</Link>
              </Button>
            </div>
          )}
          {status === "done" && (
            <div className="flex flex-col gap-4">
              <p className="text-muted-foreground text-sm">
                パスワードを再設定しました。新しいパスワードでログインしてください。
              </p>
              <Button asChild>
                <Link href="/login">ログイン画面へ</Link>
              </Button>
            </div>
          )}
          {status === "ready" && (
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reset-pw">新しいパスワード（8文字以上）</Label>
                <Input
                  id="reset-pw"
                  minLength={MIN_PASSWORD_LENGTH}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reset-pw2">新しいパスワード（確認）</Label>
                <Input
                  id="reset-pw2"
                  minLength={MIN_PASSWORD_LENGTH}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  type="password"
                  value={password2}
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button disabled={submitting} type="submit">
                パスワードを再設定
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
