"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const MIN_PASSWORD_LENGTH = 8;

const REASON_MSG: Record<string, string> = {
  not_found: "招待リンクが見つかりません。URLをご確認ください。",
  expired:
    "招待リンクの有効期限（24時間）が切れています。管理者へ再発行をご依頼ください。",
  accepted:
    "この招待は既に使用されています。ログイン画面からサインインしてください。",
  missing: "招待トークンがありません。管理者から届いたリンクを開いてください。",
};

interface ValidateResult {
  email?: string;
  name?: string;
  reason?: string;
  roleLabel?: string;
  valid: boolean;
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "invalid" | "ready">(
    "loading"
  );
  const [invalidReason, setInvalidReason] = useState("");
  const [invite, setInvite] = useState<ValidateResult | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalidReason(REASON_MSG.missing ?? "");
      setStatus("invalid");
      return;
    }
    fetch(`/api/invitations/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json() as Promise<ValidateResult>)
      .then((data) => {
        if (!data.valid) {
          setInvalidReason(REASON_MSG[data.reason ?? ""] ?? "招待が無効です");
          setStatus("invalid");
          return;
        }
        setInvite(data);
        setStatus("ready");
      })
      .catch(() => {
        setInvalidReason(
          "確認中にエラーが発生しました。時間をおいて再度お試しください。"
        );
        setStatus("invalid");
      });
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
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "登録に失敗しました");
        return;
      }
      router.push("/reporting");
      router.refresh();
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
          <CardTitle className="text-center text-xl">アカウント登録</CardTitle>
        </CardHeader>
        <CardContent>
          {status === "loading" && (
            <p className="text-center text-muted-foreground text-sm">
              招待を確認しています...
            </p>
          )}
          {status === "invalid" && (
            <div className="flex flex-col gap-4">
              <Alert variant="destructive">
                <AlertDescription>{invalidReason}</AlertDescription>
              </Alert>
              <Button asChild>
                <Link href="/login">ログイン画面へ</Link>
              </Button>
            </div>
          )}
          {status === "ready" && invite && (
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p>メール: {invite.email}</p>
                <p>氏名: {invite.name || "-"}</p>
                <p>権限: {invite.roleLabel}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="acc-pw">パスワード（8文字以上）</Label>
                <Input
                  id="acc-pw"
                  minLength={MIN_PASSWORD_LENGTH}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="acc-pw2">パスワード（確認）</Label>
                <Input
                  id="acc-pw2"
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
                登録してログイン
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
