"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";

/** 発行直後のリカバリーコード一覧（この画面でしか表示しない）。 */
export function RecoveryCodesPanel({ codes }: { codes: string[] }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success("リカバリーコードをコピーしました");
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <AlertDescription>
          スマホを紛失したときに1回ずつ使えるコードです。この画面を閉じると二度と表示されません。印刷するか、パスワード管理アプリなど安全な場所に保管してください。
        </AlertDescription>
      </Alert>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button className="self-start" onClick={copy} variant="outline">
        <Copy />
        コピー
      </Button>
    </div>
  );
}
