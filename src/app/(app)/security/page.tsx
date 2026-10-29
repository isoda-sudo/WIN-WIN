"use client";

import { ShieldCheck, Smartphone } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import { OneTimeCodeInput } from "~/components/shared/mfa/one-time-code-input";
import { RecoveryCodesPanel } from "~/components/shared/mfa/recovery-codes-panel";
import { TotpQrPanel } from "~/components/shared/mfa/totp-qr-panel";
import { PageTemplate } from "~/components/templates/page-template";
import { Alert, AlertDescription } from "~/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import { api, type RouterOutputs } from "~/trpc/react";

type Status = RouterOutputs["mfa"]["status"];
type Device = Status["devices"][number];

function formatDateTime(value: Date | string | null): string {
  return value ? new Date(value).toLocaleString("ja-JP") : "-";
}

export default function SecurityPage() {
  const status = api.mfa.status.useQuery();
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  return (
    <PageTemplate
      description="ログイン時の2段階認証（パスワード＋スマホの認証アプリ）"
      nested
      showThemeToggle={false}
      title="セキュリティ設定"
    >
      <div className="flex max-w-xl flex-col gap-6">
        <Suspense fallback={null}>
          <RecoveredNotice />
        </Suspense>
        {status.isLoading && <Skeleton className="h-40 w-full" />}
        {status.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              2段階認証の状態を読み込めませんでした。再読み込みしてください
            </AlertDescription>
          </Alert>
        )}
        {recoveryCodes && (
          <Card>
            <CardHeader>
              <CardTitle>リカバリーコード</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <RecoveryCodesPanel codes={recoveryCodes} />
              <Button
                className="self-start"
                onClick={() => setRecoveryCodes(null)}
              >
                保管しました
              </Button>
            </CardContent>
          </Card>
        )}
        {status.data && !recoveryCodes && (
          <StatusCard onCodesIssued={setRecoveryCodes} status={status.data} />
        )}
      </div>
    </PageTemplate>
  );
}

/** Shown after a recovery-code login: how to move to a new phone. */
function RecoveredNotice() {
  const recovered = useSearchParams().get("recovered") === "1";
  if (!recovered) {
    return null;
  }
  return (
    <Alert>
      <AlertDescription>
        リカバリーコードでログインしました。スマホを替えた場合は、まず「スマホを追加」で新しいスマホを登録し、そのあと古いスマホを削除してください。使えるスマホが1台も無い場合は、管理者に2段階認証のリセットを依頼してください。
      </AlertDescription>
    </Alert>
  );
}

function StatusCard({
  status,
  onCodesIssued,
}: {
  status: Status;
  onCodesIssued: (codes: string[]) => void;
}) {
  if (!status.configured) {
    return (
      <Alert>
        <AlertDescription>
          2段階認証は準備中です（サーバーの設定が完了すると利用できます）
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          2段階認証
          {status.enabled ? (
            <Badge>
              <ShieldCheck />
              有効
            </Badge>
          ) : (
            <Badge variant="secondary">未設定</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {status.required
            ? "このアカウントの権限では2段階認証が必須です"
            : "パスワードが漏れても、スマホが無ければログインできなくなります"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status.enabled ? (
          <EnabledSection onCodesIssued={onCodesIssued} status={status} />
        ) : (
          <EnrollSection onCodesIssued={onCodesIssued} />
        )}
      </CardContent>
    </Card>
  );
}

function EnrollSection({
  onCodesIssued,
}: {
  onCodesIssued: (codes: string[]) => void;
}) {
  const utils = api.useUtils();
  const [code, setCode] = useState("");
  const start = api.mfa.startEnrollment.useMutation({
    onError: (err) =>
      toast.error(friendlyErrorMessage(err, "設定を開始できませんでした")),
  });
  const confirm = api.mfa.confirmEnrollment.useMutation({
    onSuccess: async (data) => {
      await utils.mfa.status.invalidate();
      toast.success("2段階認証を有効にしました");
      onCodesIssued(data.recoveryCodes);
    },
    onError: (err) => {
      setCode("");
      toast.error(friendlyErrorMessage(err, "設定に失敗しました"));
    },
  });

  if (!start.data) {
    return (
      <Button disabled={start.isPending} onClick={() => start.mutate()}>
        2段階認証を設定する
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        confirm.mutate({ code });
      }}
    >
      <TotpQrPanel {...start.data} />
      <OneTimeCodeInput
        id="security-enroll-code"
        label="認証アプリに表示された6桁のコード"
        onChange={setCode}
        value={code}
      />
      <Button disabled={confirm.isPending || code.trim() === ""} type="submit">
        設定を完了する
      </Button>
    </form>
  );
}

function EnabledSection({
  status,
  onCodesIssued,
}: {
  status: Status;
  onCodesIssued: (codes: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Device | null>(null);
  const canAdd = status.devices.length < status.maxDevices;

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">設定日時</dt>
        <dd>{formatDateTime(status.enabledAt)}</dd>
        <dt className="text-muted-foreground">リカバリーコード残り</dt>
        <dd>{status.recoveryCodesLeft}件</dd>
      </dl>

      <section className="flex flex-col gap-3">
        <h3 className="font-medium text-sm">
          登録しているスマホ（{status.devices.length}/{status.maxDevices}台）
        </h3>
        <ul className="flex flex-col gap-2">
          {status.devices.map((device) => (
            <li
              className="flex items-center justify-between gap-3 rounded-md border p-3"
              key={device.id}
            >
              <div className="flex items-center gap-3">
                <Smartphone className="size-4 text-muted-foreground" />
                <div className="text-sm">
                  <p className="font-medium">{device.name}</p>
                  <p className="text-muted-foreground text-xs">
                    登録 {formatDateTime(device.confirmedAt)}・最終使用{" "}
                    {formatDateTime(device.lastUsedAt)}
                  </p>
                </div>
              </div>
              {status.devices.length > 1 && (
                <Button
                  onClick={() => setRemoving(device)}
                  size="sm"
                  variant="outline"
                >
                  削除
                </Button>
              )}
            </li>
          ))}
        </ul>
        {adding ? (
          <AddDeviceForm onDone={() => setAdding(false)} />
        ) : (
          <div className="flex flex-col gap-1">
            <Button
              className="self-start"
              disabled={!canAdd}
              onClick={() => setAdding(true)}
              variant="outline"
            >
              スマホを追加
            </Button>
            <p className="text-muted-foreground text-xs">
              {canAdd
                ? "機種変更のときは、新しいスマホを追加してから古いスマホを削除してください"
                : `登録できるのは${status.maxDevices}台までです。追加するには古いスマホを削除してください`}
            </p>
          </div>
        )}
      </section>

      <RecoveryCodesSection onCodesIssued={onCodesIssued} status={status} />

      <p className="text-muted-foreground text-xs">
        2段階認証をやめる場合は、管理者に依頼してください
      </p>

      <RemoveDeviceDialog
        device={removing}
        devices={status.devices}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}

function AddDeviceForm({ onDone }: { onDone: () => void }) {
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const start = api.mfa.startAddDevice.useMutation({
    onError: (err) =>
      toast.error(friendlyErrorMessage(err, "追加を開始できませんでした")),
  });
  const confirm = api.mfa.confirmAddDevice.useMutation({
    onSuccess: async () => {
      await utils.mfa.status.invalidate();
      toast.success("スマホを追加しました");
      onDone();
    },
    onError: (err) => {
      setCode("");
      toast.error(friendlyErrorMessage(err, "追加に失敗しました"));
    },
  });

  if (!start.data) {
    return (
      <form
        className="flex flex-col gap-3 rounded-md border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          start.mutate({ name: name.trim() || undefined });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="security-device-name">
            スマホの名前（任意・見分けるため）
          </Label>
          <Input
            id="security-device-name"
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 新しいiPhone"
            value={name}
          />
        </div>
        <div className="flex gap-2">
          <Button disabled={start.isPending} type="submit">
            QRコードを表示
          </Button>
          <Button onClick={onDone} type="button" variant="ghost">
            キャンセル
          </Button>
        </div>
      </form>
    );
  }
  return (
    <form
      className="flex flex-col gap-4 rounded-md border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        confirm.mutate({ code });
      }}
    >
      <TotpQrPanel {...start.data} />
      <OneTimeCodeInput
        id="security-add-device-code"
        label="新しいスマホの認証アプリに表示された6桁のコード"
        onChange={setCode}
        value={code}
      />
      <div className="flex gap-2">
        <Button
          disabled={confirm.isPending || code.trim() === ""}
          type="submit"
        >
          追加する
        </Button>
        <Button onClick={onDone} type="button" variant="ghost">
          キャンセル
        </Button>
      </div>
    </form>
  );
}

function RemoveDeviceDialog({
  device,
  devices,
  onClose,
}: {
  device: Device | null;
  devices: Device[];
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const [code, setCode] = useState("");
  // Keeps the last phone's name on screen while the dialog fades out.
  const shown = useRef(device);
  if (device) {
    shown.current = device;
  }
  const close = () => {
    setCode("");
    onClose();
  };
  const remove = api.mfa.removeDevice.useMutation({
    onSuccess: async () => {
      close();
      await utils.mfa.status.invalidate();
      toast.success("スマホを削除しました");
    },
    onError: (err) => {
      setCode("");
      toast.error(friendlyErrorMessage(err, "削除に失敗しました"));
    },
  });
  const otherNames = devices
    .filter((d) => d.id !== shown.current?.id)
    .map((d) => `「${d.name}」`)
    .join("・");

  return (
    <AlertDialog onOpenChange={(o) => !o && close()} open={device !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            「{shown.current?.name}」を削除しますか？
          </AlertDialogTitle>
          <AlertDialogDescription>
            削除したスマホのコードではログインできなくなります。確認のため、もう1台のスマホ
            {otherNames}
            の認証アプリに表示されている6桁のコードを入力してください。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <OneTimeCodeInput
          id="security-remove-device-code"
          label="もう1台のスマホの認証コード"
          onChange={setCode}
          value={code}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending || code.trim() === ""}
            onClick={(e) => {
              e.preventDefault();
              if (device) {
                remove.mutate({ deviceId: device.id, code });
              }
            }}
          >
            削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RecoveryCodesSection({
  status,
  onCodesIssued,
}: {
  status: Status;
  onCodesIssued: (codes: string[]) => void;
}) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const close = () => {
    setOpen(false);
    setCode("");
  };
  const regenerate = api.mfa.regenerateRecoveryCodes.useMutation({
    onSuccess: async (data) => {
      close();
      await utils.mfa.status.invalidate();
      onCodesIssued(data.recoveryCodes);
    },
    onError: (err) => {
      setCode("");
      toast.error(friendlyErrorMessage(err, "再発行に失敗しました"));
    },
  });

  return (
    <section className="flex flex-col gap-3">
      {status.recoveryCodesLeft <= 2 && (
        <Alert>
          <AlertDescription>
            リカバリーコードが残りわずかです。再発行してください
          </AlertDescription>
        </Alert>
      )}
      <Button
        className="self-start"
        onClick={() => setOpen(true)}
        variant="outline"
      >
        リカバリーコードを再発行
      </Button>
      <AlertDialog onOpenChange={(o) => !o && close()} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              リカバリーコードを再発行しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              今までのリカバリーコードはすべて使えなくなります。確認のため、登録しているスマホの認証アプリに表示されている6桁のコードを入力してください。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <OneTimeCodeInput
            id="security-step-up-code"
            label="認証コード"
            onChange={setCode}
            value={code}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={regenerate.isPending || code.trim() === ""}
              onClick={(e) => {
                e.preventDefault();
                regenerate.mutate({ code });
              }}
            >
              再発行する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
