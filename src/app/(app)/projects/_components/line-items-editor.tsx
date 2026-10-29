"use client";

import { Plus, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  calcInvoiceAmounts,
  calcItemsSubtotal,
  MAX_ITEM_PRICE,
  MAX_ITEM_QTY,
  parseNonNegativeInt,
} from "~/lib/invoice-tax";

export interface LineItemForm {
  name: string;
  note: string;
  price: number;
  qty: number;
  unit: string;
}

// 数量・単価の上下の増減ボタン（スピナー）は使わないため非表示にする
const NO_SPINNER_CLASS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const FIELD_CLASS = "h-10 text-base md:text-base";

// 全角数字を半角にし、数字以外を除く（数値欄はテキスト入力にして、ホイールや矢印キーで値が動かないようにする）
function digitsOnly(raw: string): string {
  return raw.normalize("NFKC").replace(/\D/g, "");
}

function newLineItem(): LineItemForm {
  return { name: "", qty: 1, unit: "式", price: 0, note: "" };
}

function LineItemRow({
  index,
  item: it,
  onChange,
  onRemove,
}: {
  index: number;
  item: LineItemForm;
  onChange: <K extends keyof LineItemForm>(
    index: number,
    key: K,
    value: LineItemForm[K]
  ) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label className="text-muted-foreground text-xs">品名</Label>
          <Input
            className={FIELD_CLASS}
            onChange={(e) => onChange(index, "name", e.target.value)}
            value={it.name}
          />
        </div>
        <Button
          aria-label="明細行を削除"
          onClick={() => onRemove(index)}
          size="icon"
          variant="ghost"
        >
          <X />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[6rem_6rem_minmax(8rem,1fr)_minmax(8rem,1fr)]">
        <div className="flex flex-col gap-1">
          <Label className="text-muted-foreground text-xs">数量</Label>
          <Input
            className={`${FIELD_CLASS} ${NO_SPINNER_CLASS} tabular-nums`}
            inputMode="numeric"
            onChange={(e) =>
              onChange(
                index,
                "qty",
                parseNonNegativeInt(digitsOnly(e.target.value), MAX_ITEM_QTY)
              )
            }
            onFocus={(e) => e.target.select()}
            pattern="[0-9]*"
            type="text"
            value={it.qty}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-muted-foreground text-xs">単位</Label>
          <Input
            className={FIELD_CLASS}
            onChange={(e) => onChange(index, "unit", e.target.value)}
            value={it.unit}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-muted-foreground text-xs">単価</Label>
          <Input
            className={`${FIELD_CLASS} ${NO_SPINNER_CLASS} tabular-nums`}
            inputMode="numeric"
            onChange={(e) =>
              onChange(
                index,
                "price",
                parseNonNegativeInt(digitsOnly(e.target.value), MAX_ITEM_PRICE)
              )
            }
            onFocus={(e) => e.target.select()}
            pattern="[0-9]*"
            type="text"
            value={it.price}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">金額</span>
          <span className="flex h-10 items-center justify-end font-medium text-base tabular-nums">
            ¥{(it.qty * it.price).toLocaleString()}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">摘要</Label>
        <Textarea
          className="min-h-16 text-base md:text-base"
          onChange={(e) => onChange(index, "note", e.target.value)}
          value={it.note}
        />
      </div>
    </div>
  );
}

export function LineItemsEditor({
  items,
  setItems,
}: {
  items: LineItemForm[];
  setItems: (items: LineItemForm[]) => void;
}) {
  const update = <K extends keyof LineItemForm>(
    index: number,
    key: K,
    value: LineItemForm[K]
  ) => {
    const current = items[index];
    if (!current) {
      return;
    }
    setItems(
      items.map((it, i) => (i === index ? { ...current, [key]: value } : it))
    );
  };
  const remove = (index: number) =>
    setItems(items.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && (
        <p className="rounded-md border p-4 text-center text-muted-foreground text-sm">
          明細がありません
        </p>
      )}
      {items.map((it, i) => (
        <LineItemRow
          index={i}
          item={it}
          key={`item-${i.toString()}`}
          onChange={update}
          onRemove={remove}
        />
      ))}
      <Button
        className="w-fit"
        onClick={() => setItems([...items, newLineItem()])}
        size="sm"
        variant="ghost"
      >
        <Plus data-icon="inline-start" />
        行を追加
      </Button>
    </div>
  );
}

/** 小計・消費税・合計（税計算は src/lib/invoice-tax.ts と共通）。 */
export function LineItemsTotals({
  items,
  totalLabel,
}: {
  items: LineItemForm[];
  totalLabel: string;
}) {
  const { subtotal, tax, total } = calcInvoiceAmounts(calcItemsSubtotal(items));
  return (
    <div className="mt-3 flex justify-end">
      <table className="text-base">
        <tbody>
          <tr>
            <td className="px-3 py-1 text-muted-foreground">小計</td>
            <td className="px-3 py-1 text-right tabular-nums">
              ¥{subtotal.toLocaleString()}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-1 text-muted-foreground">消費税(10%)</td>
            <td className="px-3 py-1 text-right tabular-nums">
              ¥{tax.toLocaleString()}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-1 font-bold">{totalLabel}</td>
            <td className="px-3 py-1 text-right font-bold tabular-nums">
              ¥{total.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
