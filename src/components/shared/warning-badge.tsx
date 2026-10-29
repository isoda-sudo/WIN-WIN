import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/**
 * 白背景の小さな丸に、オレンジの太字の「!」を入れた警告アイコン。画面全体でこの1種類に統一する
 * （期限超過・不整合・未対応などの違いは、ホバーで出る原因の文章で伝える）。ボタンの角や、値のそばに置いて使う。
 * カーソルを合わせると原因（message）が出る。
 */
export function WarningBadge({ message }: { message: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={message}
          className="flex size-5 cursor-help items-center justify-center rounded-full border-2 border-amber-500 bg-white font-black text-amber-600 text-xs leading-none shadow-sm"
          role="img"
        >
          !
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{message}</TooltipContent>
    </Tooltip>
  );
}
