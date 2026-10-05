"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { EmailContact } from "~/lib/contacts";

function contactLabel(email: string, options: EmailContact[]): string {
  const match = options.find((c) => c.email === email);
  if (!match) {
    return email;
  }
  return `${match.name}${match.title ? `（${match.title}）` : ""} - ${match.email}`;
}

/**
 * 実際に送信されるTO/CCの一覧をその場で表示し、追加・削除できるように
 * する。初期値は顧客・発注先マスタの登録済みTO担当者/CC関係者全員
 * （toOptions/ccOptionsはtRPCクエリ結果をそのまま渡すこと。参照が毎
 * レンダー変わると選択状態がリセットされてしまうため）。
 */
export function EmailRecipientsFields({
  ccOptions,
  onChange,
  toOptions,
}: {
  ccOptions: EmailContact[];
  onChange: (recipients: { cc: string[]; to: string[] }) => void;
  toOptions: EmailContact[];
}) {
  const [to, setTo] = useState<string[]>(() =>
    toOptions.map((c) => c.email).filter(Boolean)
  );
  const [cc, setCc] = useState<string[]>(() =>
    ccOptions.map((c) => c.email).filter(Boolean)
  );
  const [newTo, setNewTo] = useState("");
  const [newCc, setNewCc] = useState("");

  useEffect(() => {
    setTo(toOptions.map((c) => c.email).filter(Boolean));
  }, [toOptions]);
  useEffect(() => {
    setCc(ccOptions.map((c) => c.email).filter(Boolean));
  }, [ccOptions]);

  useEffect(() => {
    onChange({ cc, to });
  }, [to, cc, onChange]);

  const addTo = () => {
    const email = newTo.trim();
    if (email && !to.includes(email)) {
      setTo([...to, email]);
    }
    setNewTo("");
  };
  const addCc = () => {
    const email = newCc.trim();
    if (email && !cc.includes(email)) {
      setCc([...cc, email]);
    }
    setNewCc("");
  };

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
