"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OneTimeCodeInput } from "~/components/shared/mfa/one-time-code-input";
import { RecoveryCodesPanel } from "~/components/shared/mfa/recovery-codes-panel";
import { TotpQrPanel } from "~/components/shared/mfa/totp-qr-panel";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { postJson } from "../_lib/post-json";

interface Enrollment {
  accountName: string;
  issuer: string;
  manualKey: string;
  qrDataUrl: string;
}

export default function LoginMfaSetupPage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    postJson<Enrollment>("/api/auth/mfa/enroll")
      .then((res) => {
        if (res.ok) {
          setEnrollment(res.data);
          return;
        }
        setError(res.data.error ?? "設定を開始できませんでした");
        setEnded(true);
      })
      .catch(() => {
        setError("エラーが発生しました");
        setEnded(true);
      });
  }, []);

  const onConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await postJson<{
        recoveryCodes?: string[];
        remainingAttempts?: number;
      }>("/api/auth/mfa/enroll/confirm", { code });
      if (!res.ok) {
        const left = res.data.remainingAttempts;
        setError(
          left === undefined
            ? (res.data.error ?? "設定に失敗しました")
            : `${res.data.error}（あと${left}回）`
        );
        setEnded(
          res.status === 429 || (res.status === 401 && left === undefined)
        );
        setCode("");
        return;
      }
      setRecoveryCodes(res.data.recoveryCodes ?? []);
    } catch {
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const finish = () => {
    router.push("/projects");
    router.refresh();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-xl">2段階認証の設定</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {recoveryCodes ? (
            <>
              <p className="text-sm">
                設定が完了しました。次回からはパスワードの後に認証アプリのコードを入力します。
              </p>
              <RecoveryCodesPanel codes={recoveryCodes} />
              <Button onClick={finish}>保管しました。利用を開始する</Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                このアカウントは2段階認証が必須です。設定が終わるとログインが完了します。
              </p>
              {enrollment && <TotpQrPanel {...enrollment} />}
              {!(enrollment || ended) && <Skeleton className="h-64 w-full" />}
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
                enrollment && (
                  <form className="flex flex-col gap-4" onSubmit={onConfirm}>
                    <OneTimeCodeInput
                      id="mfa-setup-code"
                      label="認証アプリに表示された6桁のコード"
                      onChange={setCode}
                      value={code}
                    />
                    <Button
                      disabled={loading || code.trim() === ""}
                      type="submit"
                    >
                      設定を完了する
                    </Button>
                  </form>
                )
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
