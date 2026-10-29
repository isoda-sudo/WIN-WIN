import { Skeleton } from "~/components/ui/skeleton";

/**
 * 画面遷移の読み込み中表示。遷移の押下直後に画面が切り替わり（固まって見えない）、
 * サイドバーのリンクが先読みで毎回サーバーのDBを引かないようにもなる。
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
