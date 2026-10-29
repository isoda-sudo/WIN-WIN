"use client";

import { TableCell, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";

interface Props {
  canEdit: boolean;
  category: {
    code: string;
    id: number;
    name: string;
    note: string | null;
  };
  onEdit: () => void;
}

/** 工種マスタの1行。管理者は行クリックで編集する。 */
export function CategoryRow({ canEdit, category: c, onEdit }: Props) {
  return (
    <TableRow
      className={cn(canEdit && "cursor-pointer")}
      onClick={canEdit ? onEdit : undefined}
    >
      <TableCell className="tabular-nums">{c.code}</TableCell>
      <TableCell className="font-medium">{c.name}</TableCell>
      <TableCell>{c.note || "-"}</TableCell>
    </TableRow>
  );
}
