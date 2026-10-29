"use client";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

interface OneTimeCodeInputProps {
  autoFocus?: boolean;
  id: string;
  kind?: "totp" | "recovery";
  label: string;
  onChange: (value: string) => void;
  value: string;
}

/** 認証アプリの6桁コード、またはリカバリーコード（XXXXX-XXXXX）の入力欄。 */
export function OneTimeCodeInput({
  autoFocus,
  id,
  kind = "totp",
  label,
  onChange,
  value,
}: OneTimeCodeInputProps) {
  const isTotp = kind === "totp";
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        autoComplete={isTotp ? "one-time-code" : "off"}
        autoFocus={autoFocus}
        className="text-center font-mono text-lg tracking-widest"
        id={id}
        inputMode={isTotp ? "numeric" : "text"}
        maxLength={isTotp ? 6 : 11}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isTotp ? "123456" : "XXXXX-XXXXX"}
        required
        value={value}
      />
    </div>
  );
}
