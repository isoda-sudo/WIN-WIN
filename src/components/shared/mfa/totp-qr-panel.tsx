"use client";

interface TotpQrPanelProps {
  accountName: string;
  issuer: string;
  manualKey: string;
  qrDataUrl: string;
}

/** 認証アプリ登録用のQRコードと、読み取れない場合の手入力キー。 */
export function TotpQrPanel({
  accountName,
  issuer,
  manualKey,
  qrDataUrl,
}: TotpQrPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>スマホに「Google Authenticator」などの認証アプリを入れる</li>
        <li>アプリの「＋」→「QRコードをスキャン」で下のコードを読み取る</li>
        <li>アプリに表示された6桁の数字を入力する</li>
      </ol>
      <div className="flex justify-center rounded-lg border bg-card p-4">
        {/* biome-ignore lint/performance/noImgElement: data URL QR code */}
        <img
          alt="認証アプリ登録用のQRコード"
          height={200}
          src={qrDataUrl}
          width={200}
        />
      </div>
      <div className="rounded-md bg-muted p-3 text-sm">
        <p className="text-muted-foreground">
          QRコードを読み取れない場合は、アプリで「セットアップキーを入力」を選び次を入力してください
        </p>
        <p className="mt-1">
          アカウント：{issuer}（{accountName}）
        </p>
        <p className="mt-1 break-all font-mono">{manualKey}</p>
      </div>
    </div>
  );
}
