"use client";

import { Plus, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { type EmailContact, emptyContact, MAX_CONTACTS } from "~/lib/contacts";

/**
 * 顧客・発注先マスタのTO担当者/CC関係者を編集する共通コンポーネント。
 * 各最大MAX_CONTACTS件。メール送信フォームの宛先初期値として使われる。
 */
export function ContactListEditor({
  contacts,
  label,
  onChange,
}: {
  contacts: EmailContact[];
  label: string;
  onChange: (contacts: EmailContact[]) => void;
}) {
  const update = (index: number, patch: Partial<EmailContact>) => {
    onChange(contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };
  const remove = (index: number) => {
    onChange(contacts.filter((_, i) => i !== index));
  };
  const add = () => {
    if (contacts.length >= MAX_CONTACTS) {
      return;
    }
    onChange([...contacts, emptyContact()]);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>
        {label}（最大{MAX_CONTACTS}名）
      </Label>
      {contacts.length === 0 && (
        <p className="text-muted-foreground text-xs">未登録</p>
      )}
      {contacts.map((c, i) => (
        <div
          className="flex items-center gap-2"
          key={`${label}-${i.toString()}`}
        >
          <Input
            className="w-32"
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="氏名"
            value={c.name}
          />
          <Input
            className="w-28"
            onChange={(e) => update(i, { title: e.target.value })}
            placeholder="役職"
            value={c.title ?? ""}
          />
          <Input
            className="flex-1"
            onChange={(e) => update(i, { email: e.target.value })}
            placeholder="メールアドレス"
            type="email"
            value={c.email}
          />
          <Button
            onClick={() => remove(i)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      ))}
      {contacts.length < MAX_CONTACTS && (
        <Button
          className="w-fit"
          onClick={add}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Plus data-icon="inline-start" />
          追加
        </Button>
      )}
    </div>
  );
}
