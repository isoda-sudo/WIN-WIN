"use client";

import { cloneElement, isValidElement, useEffect, useRef } from "react";
import { Table } from "~/components/ui/table";
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
      if (horizontalDominant) {
        if (el.scrollWidth > el.clientWidth) {
          e.preventDefault();
          el.scrollLeft += e.deltaX;
        }
      } else if (el.scrollHeight > el.clientHeight) {
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
      {content}
    </div>
  );
}
