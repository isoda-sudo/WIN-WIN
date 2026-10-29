"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

/** 全銀CSVの出力メニュー。銀行取込用（そのまま）と Excel確認用（先頭の0を保持）を選ぶ。 */
export function CsvExportMenu({
  onExport,
}: {
  onExport: (excelSafe: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const run = (excelSafe: boolean) => {
    setOpen(false);
    onExport(excelSafe);
  };
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="shrink-0" size="sm" variant="outline">
          CSV出力
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1">
        <button
          className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
          onClick={() => run(false)}
          type="button"
        >
          銀行取込用（全銀形式）
        </button>
        <button
          className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
          onClick={() => run(true)}
          type="button"
        >
          Excelで確認用（口座番号などの先頭の0を保持）
        </button>
      </PopoverContent>
    </Popover>
  );
}
