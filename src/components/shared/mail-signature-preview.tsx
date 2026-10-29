"use client";

import { api } from "~/trpc/react";

/** メール本文の下に、送信時に自動で付くログインユーザーの署名を読み取り専用で見せる。 */
export function MailSignaturePreview() {
  const { data } = api.users.me.useQuery();
  const signature = data?.emailSignature?.trim();
  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs">
      <p className="mb-1 text-muted-foreground">
        署名（送信時に自動で付きます）
      </p>
      {signature ? (
        <pre className="whitespace-pre-wrap font-sans text-foreground">
          {signature}
        </pre>
      ) : (
        <p className="text-muted-foreground">
          署名が未登録です。管理者にアカウント発行画面での登録を依頼してください。
        </p>
      )}
    </div>
  );
}
