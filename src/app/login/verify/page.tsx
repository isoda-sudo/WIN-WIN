"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OneTimeCodeInput } from "~/components/shared/mfa/one-time-code-input";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { postJson } from "../_lib/post-json";

type Method = "totp" | "recovery";

export default function LoginVerifyPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await postJson<{
        remainingAttempts?: number;
        recoveryCodesLeft?: number | null;
      }>("/api/auth/mfa/verify", { method, code });
      if (!res.ok) {
        const left = res.data.remainingAttempts;
        setError(
          left === undefined
            ? (res.data.error ?? "認証に失敗しました")
            : `${res.data.error}（あと${left}回）`
        );
        setEnded(
          res.status === 429 || (res.status === 401 && left === undefined)
        );
        setCode("");
        return;
      }
      router.push(
        method === "recovery" ? "/security?recovered=1" : "/projects"
      );
      router.refresh();
    } catch {
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const switchMethod = () => {
    setMethod(method === "totp" ? "recovery" : "totp");
    setCode("");
    setError(null);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-xl">2段階認証</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <p className="text-muted-foreground text-sm">
              {method === "totp"
                ? "スマホの認証アプリに表示されている6桁のコードを入力してください"
                : "保管しているリカバリーコードを1つ入力してください（1回限り有効）"}
            </p>
            <OneTimeCodeInput
              autoFocus
              id="mfa-code"
              kind={method}
              label={method === "totp" ? "認証コード" : "リカバリーコード"}
              onChange={setCode}
              value={code}
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {ended ? (
              <Button asChild>
                <Link href="/login">ログイン画面に戻る</Link>
              </Button>
            ) : (
              <Button disabled={loading || code.trim() === ""} type="submit">
                確認
              </Button>
            )}
            <Button onClick={switchMethod} type="button" variant="link">
              {method === "totp"
                ? "スマホが使えない場合（リカバリーコードを使う）"
                : "認証アプリのコードを使う"}
            </Button>
            <p className="text-center text-muted-foreground text-xs">
              スマホもリカバリーコードも無い場合は、管理者に2段階認証のリセットを依頼してください
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
