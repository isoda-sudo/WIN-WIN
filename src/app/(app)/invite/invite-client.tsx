"use client";

import { Copy, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import { api, type RouterOutputs } from "~/trpc/react";

type InviteResult = RouterOutputs["invitations"]["create"];
type Account = RouterOutputs["users"]["list"][number];

const ROLE_OPTIONS = [
  {
    value: "admin",
    label: "管理者",
    description: "全機能・アカウント発行が可能",
  },
  { value: "accounting", label: "経理部", description: "請求/支払/入金の管理" },
  {
    value: "staff",
    label: "一般社員",
    description: "案件/工事計画の閲覧/操作",
  },
  {
    value: "viewer",
    label: "一般社員（閲覧のみ）",
    description: "受注一覧/工事計画・各種マスタ・レポーティングの閲覧のみ",
  },
] as const;

const USER_ROLE_OPTIONS = [
  { value: "admin", label: "管理者" },
  { value: "accounting", label: "経理部" },
  { value: "staff", label: "一般社員" },
  { value: "viewer", label: "一般社員（閲覧のみ）" },
] as const;

const KNOWN_ROLES: Set<string> = new Set(USER_ROLE_OPTIONS.map((o) => o.value));

function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string | Date | null): string {
  if (!value) {
    return "-";
  }
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function InviteClient({
  currentUserId,
}: {
  currentUserId: number;
}) {
  const utils = api.useUtils();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("staff");
  const [result, setResult] = useState<InviteResult | null>(null);

  const { data: invitations, isLoading: invitationsLoading } =
    api.invitations.list.useQuery();
  const { data: accounts, isLoading: accountsLoading } =
    api.users.list.useQuery();

  const createMutation = api.invitations.create.useMutation({
    onSuccess: async (data) => {
      await utils.invitations.list.invalidate();
      setResult(data);
      toast.success("招待メールを送信しました");
      setName("");
      setEmail("");
      setRole("staff");
    },
    onError: (err) =>
      toast.error(friendlyErrorMessage(err, "招待の発行に失敗しました")),
  });

  const revokeMutation = api.invitations.revoke.useMutation({
    onSuccess: async () => {
      await utils.invitations.list.invalidate();
      toast.success("招待を取り消しました");
    },
    onError: (err) =>
      toast.error(friendlyErrorMessage(err, "取り消しに失敗しました")),
  });

  const updateRoleStatusMutation = api.users.updateRoleStatus.useMutation({
    onSuccess: async () => {
      await utils.users.list.invalidate();
      toast.success("更新しました");
    },
    onError: (err) =>
      toast.error(friendlyErrorMessage(err, "更新に失敗しました")),
  });

  const deleteUserMutation = api.users.delete.useMutation({
    onSuccess: async () => {
      await utils.users.list.invalidate();
      toast.success("アカウントを削除しました");
    },
    onError: (err) =>
      toast.error(friendlyErrorMessage(err, "削除に失敗しました")),
  });

  const submitInvite = () => {
    if (!email.trim()) {
      toast.error("メールアドレスを入力してください");
      return;
    }
    createMutation.mutate({
      name: name.trim() || undefined,
      email: email.trim(),
      role,
    });
  };

  const copyInviteUrl = async () => {
    if (!result) {
      return;
    }
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      toast.success("URLをコピーしました");
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-bold text-2xl">アカウント発行</h1>
        <p className="text-muted-foreground text-sm">
          新規アカウントの招待発行と、既存アカウントの管理を行います
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左: 招待発行フォーム */}
        <div className="flex flex-col gap-4 rounded-md border p-4">
          <h2 className="font-semibold text-lg">招待発行フォーム</h2>

          <div className="flex flex-col gap-2">
            <Label>氏名</Label>
            <Input
              onChange={(e) => setName(e.target.value)}
              placeholder="山田 太郎"
              value={name}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>メールアドレス *</Label>
            <Input
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@example.com"
              type="email"
              value={email}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>権限 *</Label>
            <RadioGroup onValueChange={setRole} value={role}>
              {ROLE_OPTIONS.map((opt) => (
                <div className="flex items-start gap-2" key={opt.value}>
                  <RadioGroupItem
                    className="mt-1"
                    id={`role-${opt.value}`}
                    value={opt.value}
                  />
                  <Label
                    className="flex flex-col items-start gap-0.5 font-normal"
                    htmlFor={`role-${opt.value}`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {opt.description}
                    </span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <Button disabled={createMutation.isPending} onClick={submitInvite}>
            招待メールを送信
          </Button>

          {result && (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/50 p-3">
              <p className="font-medium text-sm">
                招待を発行しました（有効期限: {formatDateTime(result.expiresAt)}
                ）
              </p>
              <div className="flex items-center gap-2">
                <Input className="text-xs" readOnly value={result.inviteUrl} />
                <Button
                  onClick={copyInviteUrl}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Copy data-icon="inline-start" />
                  コピー
                </Button>
              </div>
              {result.emailSent ? (
                <p className="text-muted-foreground text-xs">
                  招待メールを送信しました。
                </p>
              ) : (
                <p className="text-destructive text-xs">
                  招待メールの送信に失敗しました
                  {result.emailError ? `（${result.emailError}）` : ""}
                  。上記URLを直接共有してください。
                </p>
              )}
            </div>
          )}
        </div>

        {/* 右: 発行済み招待テーブル */}
        <div className="flex flex-col gap-4 rounded-md border p-4">
          <h2 className="font-semibold text-lg">発行済み招待</h2>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>メール/氏名</TableHead>
                  <TableHead>権限</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead>有効期限</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitationsLoading &&
                  Array.from({ length: 3 }, (_, i) => (
                    <TableRow key={`skeleton-${i.toString()}`}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!invitationsLoading && invitations?.length === 0 && (
                  <TableRow>
                    <TableCell
                      className="text-center text-muted-foreground"
                      colSpan={5}
                    >
                      発行済みの招待がありません
                    </TableCell>
                  </TableRow>
                )}
                {invitations?.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{inv.email}</span>
                        {inv.name && (
                          <span className="text-muted-foreground text-xs">
                            {inv.name}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{inv.roleLabel}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          inv.status === "有効" ? "default" : "secondary"
                        }
                      >
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDateTime(inv.expiresAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        disabled={revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate({ id: inv.id })}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* 下部: 登録済みアカウントテーブル */}
      <div className="flex flex-col gap-4 rounded-md border p-4">
        <h2 className="font-semibold text-lg">登録済みアカウント</h2>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>氏名/メール</TableHead>
                <TableHead>権限</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>登録日</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountsLoading &&
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={`skeleton-${i.toString()}`}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!accountsLoading && accounts?.length === 0 && (
                <TableRow>
                  <TableCell
                    className="text-center text-muted-foreground"
                    colSpan={5}
                  >
                    登録済みのアカウントがありません
                  </TableCell>
                </TableRow>
              )}
              {accounts?.map((u) => (
                <AccountRow
                  account={u}
                  deletePending={deleteUserMutation.isPending}
                  isCurrentUser={u.id === currentUserId}
                  key={u.id}
                  onDelete={() => deleteUserMutation.mutate({ id: u.id })}
                  onRoleChange={(role) =>
                    updateRoleStatusMutation.mutate({ id: u.id, role })
                  }
                  onToggleStatus={(status) =>
                    updateRoleStatusMutation.mutate({ id: u.id, status })
                  }
                  roleStatusPending={updateRoleStatusMutation.isPending}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

/**
 * 「登録済みアカウント」テーブルの1行。
 * 自分自身の行（isCurrentUser）は権限セレクト・一時停止・削除のいずれも
 * 操作できないようにdisabledにし、「（あなた）」バッジとツールチップで理由を示す
 * （旧app: public/invite.html の renderUserRow の isSelf 判定と同じ意図）。
 * 招待で選べる3ロール（admin/accounting/staff）以外の値（レガシーな'user'等）は、
 * どれにも一致させず「(未設定: role)」を選択済みにして誤った権限表示・書き換えを防ぐ。
 */
/** account.role が既知3ロール以外（レガシー値等）かどうかと、Selectに渡す値を解決する。 */
function resolveRoleSelectValue(role: string | null): {
  isKnown: boolean;
  value: string;
} {
  const isKnown = KNOWN_ROLES.has(role ?? "");
  return { isKnown, value: isKnown ? (role as string) : (role ?? "unknown") };
}

function getActionDisabledReason(
  isCurrentUser: boolean,
  isDeleted: boolean
): string | undefined {
  if (isCurrentUser) {
    return "自分自身は変更できません";
  }
  if (isDeleted) {
    return "削除済みのアカウントは変更できません";
  }
  return;
}

function AccountRoleSelect({
  account,
  disabled,
  disabledReason,
  onChange,
}: {
  account: Account;
  disabled: boolean;
  disabledReason: string | undefined;
  onChange: (role: string) => void;
}) {
  const { isKnown, value } = resolveRoleSelectValue(account.role);
  return (
    <span title={disabledReason}>
      <Select disabled={disabled} onValueChange={onChange} value={value}>
        <SelectTrigger className="w-32" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {!isKnown && (
            <SelectItem disabled value={value}>
              {`(未設定: ${account.role ?? "不明"})`}
            </SelectItem>
          )}
          {USER_ROLE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
}

function AccountStatusCell({
  isDeleted,
  isSuspended,
  disabled,
  disabledReason,
  onToggle,
}: {
  isDeleted: boolean;
  isSuspended: boolean;
  disabled: boolean;
  disabledReason: string | undefined;
  onToggle: (status: "active" | "suspended") => void;
}) {
  if (isDeleted) {
    return <Badge variant="secondary">削除済み</Badge>;
  }
  return (
    <div className="flex items-center gap-2">
      <Badge variant={isSuspended ? "secondary" : "default"}>
        {isSuspended ? "一時停止中" : "有効"}
      </Badge>
      <span title={disabledReason}>
        <Button
          disabled={disabled}
          onClick={() => onToggle(isSuspended ? "active" : "suspended")}
          size="sm"
          variant="outline"
        >
          {isSuspended ? "有効化" : "一時停止"}
        </Button>
      </span>
    </div>
  );
}

function AccountRow({
  account,
  isCurrentUser,
  onRoleChange,
  onToggleStatus,
  onDelete,
  roleStatusPending,
  deletePending,
}: {
  account: Account;
  isCurrentUser: boolean;
  onRoleChange: (role: string) => void;
  onToggleStatus: (status: "active" | "suspended") => void;
  onDelete: () => void;
  roleStatusPending: boolean;
  deletePending: boolean;
}) {
  const isDeleted = account.status === "deleted";
  const isSuspended = account.status === "suspended";
  const actionDisabledReason = getActionDisabledReason(
    isCurrentUser,
    isDeleted
  );

  return (
    <TableRow className={isDeleted ? "opacity-50" : undefined}>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">
            {account.name || "-"}
            {isCurrentUser && (
              <span className="ml-1 font-normal text-secondary-foreground text-xs">
                （あなた）
              </span>
            )}
          </span>
          <span className="text-muted-foreground text-xs">{account.email}</span>
        </div>
      </TableCell>
      <TableCell>
        <AccountRoleSelect
          account={account}
          disabled={isDeleted || isCurrentUser || roleStatusPending}
          disabledReason={
            isCurrentUser ? "自分自身の権限は変更できません" : undefined
          }
          onChange={onRoleChange}
        />
      </TableCell>
      <TableCell>
        <AccountStatusCell
          disabled={isCurrentUser || roleStatusPending}
          disabledReason={actionDisabledReason}
          isDeleted={isDeleted}
          isSuspended={isSuspended}
          onToggle={onToggleStatus}
        />
      </TableCell>
      <TableCell className="text-xs">{formatDate(account.createdAt)}</TableCell>
      <TableCell>
        <span title={actionDisabledReason}>
          <Button
            disabled={isCurrentUser || isDeleted || deletePending}
            onClick={onDelete}
            size="icon"
            variant="ghost"
          >
            <Trash2 className="text-destructive" />
          </Button>
        </span>
      </TableCell>
    </TableRow>
  );
}
