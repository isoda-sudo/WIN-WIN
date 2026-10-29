"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { type EmailContact, MAX_CONTACTS } from "~/lib/contacts";
import { api } from "~/trpc/react";

const emailSchema = z.string().email();

function contactLabel(email: string, options: EmailContact[]): string {
  const match = options.find((c) => c.email === email);
  if (!match) {
    return email;
  }
  return `${match.name}${match.title ? `（${match.title}）` : ""} - ${match.email}`;
}

/** CCの初期値: マスタ登録のCC関係者＋管理者・経理。宛先（TO）と重複するものは除き、上限を超えない。 */
function defaultCc(
  ccOptions: EmailContact[],
  staffEmails: readonly string[] | undefined,
  to: readonly string[]
): string[] {
  const all = [...ccOptions.map((c) => c.email), ...(staffEmails ?? [])].filter(
    Boolean
  );
  return [...new Set(all)]
    .filter((e) => !to.includes(e))
    .slice(0, MAX_CONTACTS);
}

function defaultTo(
  toOptions: EmailContact[],
  fallbackTo: string | null | undefined
): string[] {
  const list = toOptions.map((c) => c.email).filter(Boolean);
  if (list.length === 0 && fallbackTo?.trim()) {
    return [fallbackTo.trim()];
  }
  return list;
}

/**
 * 実際に送信されるTO/CCの一覧をその場で表示し、追加・削除できるように
 * する。初期値は顧客・発注先マスタの登録済みTO担当者/CC関係者全員
 * （toOptions/ccOptionsはtRPCクエリ結果をそのまま渡すこと。参照が毎
 * レンダー変わると選択状態がリセットされてしまうため）。
 */
export function EmailRecipientsFields({
  ccOptions,
  fallbackTo,
  onChange,
  toOptions,
}: {
  ccOptions: EmailContact[];
  /** TO担当者が未登録のときの既定宛先（顧客・発注先の代表メール）。 */
  fallbackTo?: string | null;
  onChange: (recipients: { cc: string[]; to: string[] }) => void;
  toOptions: EmailContact[];
}) {
  const [to, setTo] = useState<string[]>(() =>
    defaultTo(toOptions, fallbackTo)
  );
  // CCの初期値は、顧客・発注先のCC関係者に加えて、全ての管理者と経理のアドレス（画面で外せる）
  const { data: staffCc } = api.users.ccDefaults.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });
  const [cc, setCc] = useState<string[]>(() =>
    defaultCc(ccOptions, undefined, defaultTo(toOptions, fallbackTo))
  );
  const [newTo, setNewTo] = useState("");
  const [newCc, setNewCc] = useState("");

  useEffect(() => {
    setTo(defaultTo(toOptions, fallbackTo));
  }, [toOptions, fallbackTo]);
  useEffect(() => {
    setCc(defaultCc(ccOptions, staffCc, defaultTo(toOptions, fallbackTo)));
  }, [ccOptions, staffCc, toOptions, fallbackTo]);

  useEffect(() => {
    onChange({ cc, to });
  }, [to, cc, onChange]);

  const addRecipient = (
    raw: string,
    list: string[],
    setList: (v: string[]) => void,
    clear: () => void
  ) => {
    const email = raw.trim();
    if (!email) {
      return;
    }
    if (!emailSchema.safeParse(email).success) {
      toast.error("メールアドレスの形式が正しくありません");
      return;
    }
    if (list.includes(email)) {
      clear();
      return;
    }
    if (list.length >= MAX_CONTACTS) {
      toast.error(`宛先は最大${MAX_CONTACTS}件までです`);
      return;
    }
    setList([...list, email]);
    clear();
  };
  const addTo = () => addRecipient(newTo, to, setTo, () => setNewTo(""));
  const addCc = () => addRecipient(newCc, cc, setCc, () => setNewCc(""));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">宛先（TO）</Label>
        <div className="flex flex-wrap gap-1">
          {to.length === 0 && (
            <span className="text-muted-foreground text-xs">宛先未設定</span>
          )}
          {to.map((email) => (
            <Badge className="gap-1 pr-1" key={email} variant="secondary">
              {contactLabel(email, toOptions)}
              <button
                aria-label={`${email}を削除`}
                className="rounded-full hover:text-destructive"
                onClick={() => setTo(to.filter((e) => e !== email))}
                type="button"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            onChange={(e) => setNewTo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTo();
              }
            }}
            placeholder="宛先を追加..."
            type="email"
            value={newTo}
          />
          <Button onClick={addTo} type="button" variant="outline">
            <Plus data-icon="inline-start" />
            追加
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">CC</Label>
        <div className="flex flex-wrap gap-1">
          {cc.length === 0 && (
            <span className="text-muted-foreground text-xs">CC未設定</span>
          )}
          {cc.map((email) => (
            <Badge className="gap-1 pr-1" key={email} variant="secondary">
              {contactLabel(email, ccOptions)}
              <button
                aria-label={`${email}を削除`}
                className="rounded-full hover:text-destructive"
                onClick={() => setCc(cc.filter((e) => e !== email))}
                type="button"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            onChange={(e) => setNewCc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCc();
              }
            }}
            placeholder="CCを追加..."
            type="email"
            value={newCc}
          />
          <Button onClick={addCc} type="button" variant="outline">
            <Plus data-icon="inline-start" />
            追加
          </Button>
        </div>
      </div>
    </div>
  );
}
