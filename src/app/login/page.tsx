"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [idleNotice, setIdleNotice] = useState(false);
  useEffect(() => {
    setIdleNotice(
      new URLSearchParams(window.location.search).get("reason") === "idle"
    );
  }, []);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = (await res.json()) as { error?: string; next?: string };
      if (!res.ok) {
        setError(data.error ?? "ログインに失敗しました");
        return;
      }
      router.push(data.next ?? "/projects");
      router.refresh();
    } catch {
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-xl">
            物件管理システム
          </CardTitle>
        </CardHeader>
        <CardContent>
          {idleNotice && (
            <Alert className="mb-4">
              <AlertDescription>
                1時間操作がなかったため、自動でログアウトしました。もう一度ログインしてください。
              </AlertDescription>
            </Alert>
          )}
          <form className="flex flex-col gap-4" onSubmit={onLogin}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-email">メールアドレス</Label>
              <Input
                id="login-email"
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="name@company.co.jp"
                required
                type="email"
                value={loginEmail}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-pw">パスワード</Label>
              <Input
                id="login-pw"
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                type="password"
                value={loginPassword}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button disabled={loading} type="submit">
              ログイン
            </Button>
            <Link
              className="text-center text-muted-foreground text-sm hover:underline"
              href="/forgot-password"
            >
              パスワードをお忘れですか？
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
