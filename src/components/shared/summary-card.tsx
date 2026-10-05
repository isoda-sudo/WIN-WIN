import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

/**
 * 月間サマリの数値カード（売上・入金管理／支払管理で共通利用）。
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
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="font-semibold text-2xl tabular-nums">
        {value}
      </CardContent>
    </Card>
  );
}
