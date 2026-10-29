"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadMore } from "~/components/shared/load-more";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { compareAsc, compareDesc, type SortOption } from "~/lib/list-sort";
import type { ProfitProjectRow } from "~/lib/reporting-profit";
import { useSortedPagedList } from "~/lib/use-sorted-paged-list";
import { cn } from "~/lib/utils";
import { pctOrDash, yen } from "../../_components/format";

const PROJECT_SORT: SortOption<ProfitProjectRow>[] = [
  {
    compare: (a, b) => compareDesc(a.rate, b.rate),
    label: "粗利率降順",
    value: "rate-desc",
  },
  {
    compare: (a, b) => compareAsc(a.rate, b.rate),
    label: "粗利率昇順",
    value: "rate-asc",
  },
  {
    compare: (a, b) => compareDesc(a.revenue, b.revenue),
    label: "売上降順",
    value: "revenue-desc",
  },
  {
    compare: (a, b) => compareDesc(a.profit, b.profit),
    label: "粗利降順",
    value: "profit-desc",
  },
  {
    compare: (a, b) => compareDesc(a.projectNo, b.projectNo),
    label: "案件ID降順",
    value: "no-desc",
  },
];

const RATE_TONE_BAD = "bg-destructive/10 text-destructive";
const RATE_TONE_GOOD =
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
const RATE_TONE_NORMAL =
  "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";

function rateToneClass(rate: number): string {
  if (rate < 0) {
    return RATE_TONE_BAD;
  }
  return rate >= 30 ? RATE_TONE_GOOD : RATE_TONE_NORMAL;
}

/** 粗利率の色分け（30%以上=良好、0〜30%=標準、マイナス=赤字）。 */
function RatePill({ rate }: { rate: number | null }) {
  if (rate === null) {
    return <span className="text-muted-foreground">-</span>;
  }
  const tone = rateToneClass(rate);
  return (
    <span
      className={cn(
        "inline-block min-w-14 rounded-full px-2 py-0.5 text-center font-medium tabular-nums",
        tone
      )}
    >
      {pctOrDash(rate)}
    </span>
  );
}

function Neg({
  value,
  children,
}: {
  children: React.ReactNode;
  value: number | null;
}) {
  return (
    <span className={cn(value !== null && value < 0 && "text-destructive")}>
      {children}
    </span>
  );
}

function Skeletons({ cols }: { cols: number }) {
  return Array.from({ length: 5 }, (_, i) => (
    <TableRow key={`skeleton-${i.toString()}`}>
      <TableCell colSpan={cols}>
        <Skeleton className="h-6 w-full" />
      </TableCell>
    </TableRow>
  ));
}

interface Props<T> {
  isLoading: boolean;
  resetKey: string;
  rows: readonly T[];
}

export function ProjectProfitTable({
  isLoading,
  resetKey,
  rows,
}: Props<ProfitProjectRow>) {
  const router = useRouter();
  const paged = useSortedPagedList({
    options: PROJECT_SORT,
    resetKey,
    rows,
  });
  return (
    <section className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:h-10 [&_th]:px-3">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>案件ID</TableHead>
              <TableHead>工事名</TableHead>
              <TableHead>顧客</TableHead>
              <TableHead className="whitespace-nowrap text-right">
                売上
              </TableHead>
              <TableHead className="whitespace-nowrap text-right">
                原価
              </TableHead>
              <TableHead className="whitespace-nowrap text-right">
                粗利
              </TableHead>
              <TableHead className="whitespace-nowrap text-right">
                粗利率
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <Skeletons cols={7} />}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={7}
                >
                  対象の案件がありません
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((r) => (
              // 行のクリックで、その案件の工事一覧（工事計画）へ移動する
              <TableRow
                className="cursor-pointer hover:bg-muted/40"
                key={r.id}
                onClick={() => router.push(`/orders-list?projectId=${r.id}`)}
              >
                <TableCell className="tabular-nums">
                  {r.projectNo ?? "-"}
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    className="hover:underline"
                    href={`/orders-list?projectId=${r.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell>{r.customer}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {yen(r.revenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {yen(r.cost)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Neg value={r.profit}>{yen(r.profit)}</Neg>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <RatePill rate={r.rate} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <LoadMore
        className="px-1 py-1"
        hasMore={paged.hasMore}
        onMore={paged.loadMore}
        shown={paged.shown}
        total={paged.total}
      />
    </section>
  );
}
