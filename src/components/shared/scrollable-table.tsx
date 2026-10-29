"use client";

import { cloneElement, isValidElement, useEffect, useRef } from "react";
import { Button } from "~/components/ui/button";
import { Table, TableCell, TableRow } from "~/components/ui/table";
import { useEditLocked } from "~/lib/use-edit-lock";
import { cn } from "~/lib/utils";

/** 一覧テーブルで「全画面表示」に切り替える件数のしきい値。 */
export const TABLE_SCROLL_THRESHOLD = 20;

/**
 * トラックパッドの斜め方向スワイプで縦横が同時に動く「斜めスクロール」を
 * 防ぐ。1回のホイールイベントごとに縦横どちらか支配的な方向のみへスクロール
 * する（ReactのonWheelはpassiveでpreventDefaultが効かないため、refに対して
 * 非passiveのネイティブリスナーを張る）。
 */
function useAxisLockedWheelScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    const onWheel = (e: WheelEvent) => {
      const horizontalDominant = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      // 端に達している方向へのスクロールはブラウザ標準（ページスクロール）に任せる
      if (horizontalDominant) {
        const max = el.scrollWidth - el.clientWidth;
        const atEdge =
          (e.deltaX < 0 && el.scrollLeft <= 0) ||
          (e.deltaX > 0 && el.scrollLeft >= max - 1);
        if (max > 0 && !atEdge) {
          e.preventDefault();
          el.scrollLeft += e.deltaX;
        }
        return;
      }
      const maxY = el.scrollHeight - el.clientHeight;
      const atEdgeY =
        (e.deltaY < 0 && el.scrollTop <= 0) ||
        (e.deltaY > 0 && el.scrollTop >= maxY - 1);
      if (maxY > 0 && !atEdgeY) {
        e.preventDefault();
        el.scrollTop += e.deltaY;
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return ref;
}

/**
 * 一覧テーブルの共通ラッパー。20件以上ある場合は画面の大部分を使う高さに
 * 広げてテーブル内部だけをスクロールさせる（ヘッダー行は sticky で固定）。
 * 20件未満なら従来通りの自然な高さで表示する。縦横同時の斜めスクロールは
 * 常に片方の軸だけに制限する。
 *
 * <Table>自体が内部で overflow-x-auto の入れ子コンテナを持っており、
 * それを残したまま外側にもスクロールコンテナを重ねると、CSS仕様上
 * overflow-xを指定した要素はoverflow-yも自動的にautoとして扱われるため、
 * position: stickyの基準がこの内側コンテナに奪われてヘッダーが固定されなく
 * なる。そのためTableの内側コンテナのoverflowを打ち消し、スクロールは
 * 常にこの外側1箇所だけで行う。
 */
export function ScrollableTableSection({
  children,
  className,
  count,
  threshold = TABLE_SCROLL_THRESHOLD,
}: {
  children: React.ReactNode;
  className?: string;
  count: number;
  threshold?: number;
}) {
  const scrollable = count >= threshold;
  // 他の人が編集中の間は、表内の入力・ボタンを無効にして閲覧のみにする（排他制御）
  const locked = useEditLocked();
  const ref = useAxisLockedWheelScroll<HTMLDivElement>();
  const content =
    isValidElement(children) && children.type === Table
      ? cloneElement(
          children as React.ReactElement<React.ComponentProps<typeof Table>>,
          {
            containerClassName: cn(
              "overflow-visible",
              (children.props as React.ComponentProps<typeof Table>)
                .containerClassName
            ),
          }
        )
      : children;

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-md border",
        scrollable && "max-h-[70vh] overflow-y-auto",
        className
      )}
      ref={ref}
    >
      {locked ? (
        <fieldset className="contents" disabled>
          {content}
        </fieldset>
      ) : (
        content
      )}
    </div>
  );
}

/** 一覧取得失敗時にテーブル内へ表示するエラー行（再試行ボタン付き）。 */
export function TableErrorRow({
  colSpan,
  onRetry,
}: {
  colSpan: number;
  onRetry: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="text-center" colSpan={colSpan}>
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-destructive text-sm">データの取得に失敗しました</p>
          <Button onClick={onRetry} size="sm" variant="outline">
            再試行
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
