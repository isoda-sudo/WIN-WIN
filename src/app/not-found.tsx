import Link from "next/link";
import { Button } from "~/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-bold text-5xl text-primary">404</p>
      <h1 className="font-semibold text-xl">ページが見つかりません</h1>
      <p className="text-muted-foreground text-sm">
        URLが間違っているか、ページが移動または削除された可能性があります。
      </p>
      <Button asChild>
        <Link href="/projects">受注一覧へ戻る</Link>
      </Button>
    </main>
  );
}
