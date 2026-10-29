"use client";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import type { RouterOutputs } from "~/trpc/react";

export type ReceiptCategory =
  RouterOutputs["receiptCategories"]["list"][number];

export interface CategoryFormState {
  name: string;
  note: string;
}

export const EMPTY_CATEGORY_FORM: CategoryFormState = { name: "", note: "" };

export function toCategoryFormState(c: ReceiptCategory): CategoryFormState {
  return { name: c.name, note: c.note ?? "" };
}

/** 次の表示順（既存の最大値+1）。並べ替え（ドラッグ）で振り直されるまでの仮の値。 */
export function nextCategoryOrder(categories: readonly ReceiptCategory[]) {
  return categories.reduce((max, c) => Math.max(max, c.order ?? 0), 0) + 1;
}

export function ReceiptCategoryForm({
  form,
  setForm,
}: {
  form: CategoryFormState;
  setForm: (f: CategoryFormState) => void;
}) {
  const set = <K extends keyof CategoryFormState>(
    key: K,
    value: CategoryFormState[K]
  ) => setForm({ ...form, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-2">
        <Label>区分名称 *</Label>
        <Input
          onChange={(e) => set("name", e.target.value)}
          placeholder="例：賃貸収入、備品売上"
          value={form.name}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>備考</Label>
        <Textarea
          onChange={(e) => set("note", e.target.value)}
          value={form.note}
        />
      </div>
    </div>
  );
}
