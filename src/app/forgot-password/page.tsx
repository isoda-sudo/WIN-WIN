"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      // メール存在の有無に関わらず常に同じ完了画面を表示する（アカウント有無の探索を防ぐ）
      setSubmitting(false);
      setSent(true);
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
          {sent ? (
            <div className="flex flex-col gap-4">
              <p className="text-muted-foreground text-sm">
                ご入力いただいたメールアドレス宛に、パスワード再設定用のリンクを送信しました（該当するアカウントが存在する場合）。メールをご確認ください。
              </p>
              <Button asChild variant="outline">
                <Link href="/login">ログイン画面へ戻る</Link>
              </Button>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <p className="text-muted-foreground text-sm">
                登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
              </p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="forgot-email">メールアドレス</Label>
                <Input
                  id="forgot-email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
              <Button disabled={submitting} type="submit">
                再設定メールを送信
              </Button>
              <Link
                className="text-center text-muted-foreground text-sm hover:underline"
                href="/login"
              >
                ログイン画面へ戻る
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
