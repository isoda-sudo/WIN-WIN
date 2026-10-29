"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { jstDateString } from "~/lib/paid-at";

const AMOUNT_RE = /^\d+$/;

interface OrderFileMetaDialogProps {
  defaultAmount: number | null;
  kindLabel: string;
  onCancel: () => void;
  onConfirm: (meta: { docAmount: number; docDate: string }) => void;
  pending: boolean;
  vendor: string | null;
}

/**
 * アップロード前に「書類の日付」「書類の金額」を確認する。
 * 保存名（日付_取引先_金額_書類名.pdf）はサーバーが決めるため、ここでは名前を入力しない。
 */
export function OrderFileMetaDialog({
  defaultAmount,
  kindLabel,
  onCancel,
  onConfirm,
  pending,
  vendor,
}: OrderFileMetaDialogProps) {
  const [docDate, setDocDate] = useState(() => jstDateString(new Date()) ?? "");
  const [amountText, setAmountText] = useState(
    String(Math.max(0, Math.trunc(defaultAmount ?? 0)))
  );
  const amountValid = AMOUNT_RE.test(amountText.trim());
  const canSubmit = Boolean(docDate) && amountValid && !pending;

  return (
    <Dialog onOpenChange={(open) => !open && onCancel()} open>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{kindLabel}の情報を入力</DialogTitle>
          <DialogDescription>
            ファイル名は日付・取引先・金額から自動で付きます（変更できません）。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>取引先</Label>
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              {vendor || "取引先なし"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-file-doc-date">書類の日付</Label>
            <Input
              id="order-file-doc-date"
              onChange={(e) => setDocDate(e.target.value)}
              type="date"
              value={docDate}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-file-doc-amount">書類の金額（円）</Label>
            <Input
              aria-invalid={!amountValid}
              id="order-file-doc-amount"
              inputMode="numeric"
              onChange={(e) =>
                setAmountText(e.target.value.replace(/[,\s]/g, ""))
              }
              type="text"
              value={amountText}
            />
            {!amountValid && (
              <p className="text-destructive text-xs">
                0以上の整数で入力してください
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
            キャンセル
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onConfirm({ docAmount: Number(amountText.trim()), docDate })
            }
            type="button"
          >
            {pending ? "アップロード中..." : "アップロード"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
