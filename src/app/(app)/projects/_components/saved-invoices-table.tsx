"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

export interface SavedInvoiceRow {
  hasStoredPdf: boolean;
  id: number;
  invoiceId: number;
  isSplit: boolean;
  total: number | null;
  uploadedAt: Date | string | null;
}

/** 保存済み請求書の一覧。行クリックで明細を読み込み、PDFを開く／削除できる。 */
export function SavedInvoicesTable<T extends SavedInvoiceRow>({
  deleteDisabled,
  formatSavedAt,
  invoices,
  onDelete,
  onLoad,
}: {
  deleteDisabled: boolean;
  formatSavedAt: (d: Date | string | null | undefined) => string;
  invoices: T[];
  onDelete: (inv: T) => void;
  onLoad: (inv: T) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>日時</TableHead>
          <TableHead className="w-16">区分</TableHead>
          <TableHead className="text-right">請求金額</TableHead>
          <TableHead className="w-20" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => (
          <TableRow
            className="cursor-pointer"
            key={inv.id}
            onClick={(e) => {
              // 操作列（PDFを開く／削除）のクリックは行の読み込みにしない。
              const target = e.target as HTMLElement;
              if (target.closest("[data-row-actions]")) {
                return;
              }
              onLoad(inv);
            }}
          >
            <TableCell>{formatSavedAt(inv.uploadedAt)}</TableCell>
            <TableCell>
              {inv.isSplit && <Badge variant="secondary">分割</Badge>}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              ¥{(inv.total ?? 0).toLocaleString()}
            </TableCell>
            <TableCell>
              <div
                className="flex items-center justify-end gap-1"
                data-row-actions
              >
                <Button
                  aria-label="保存済みPDFを開く"
                  asChild
                  size="icon-sm"
                  title="保存済みPDFを開く"
                  variant="ghost"
                >
                  <a
                    href={`/api/invoices/${inv.invoiceId}/file?inline=1`}
                    onClick={(e) => e.stopPropagation()}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ExternalLink />
                  </a>
                </Button>
                <span className="inline-flex">
                  <Button
                    aria-label="保存済み請求書を削除"
                    disabled={deleteDisabled}
                    onClick={() => onDelete(inv)}
                    size="icon-sm"
                    title="削除"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
