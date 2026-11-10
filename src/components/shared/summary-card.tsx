import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

/**
 * 月間サマリの数値カード（売上管理表／支払管理で共通利用）。
 * 工事計画詳細のサマリカード（売上高カード）と同じスタイルに揃える
 * （text-xs uppercase tracking-wideのラベル、CardContent直下に値、
 * 色付きアクセントなし）。
 */
export function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="px-3 pb-1 sm:px-6 sm:pb-2">
        <CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 font-semibold text-base tabular-nums sm:px-6 sm:text-2xl">
        {value}
      </CardContent>
    </Card>
  );
}
