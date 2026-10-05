"use client";

import { useRouter } from "next/navigation";

import {
  PageCard,
  PageGrid,
  PageSection,
  PageTemplate,
} from "~/components/templates/page-template";
import { spacingScale } from "~/lib/design-tokens";

const spacingTypes = {
  margin: {
    name: "マージン (Margin)",
    description: "要素の外側の余白。他の要素との距離を制御",
    classes: ["m-*", "mt-*", "mr-*", "mb-*", "ml-*", "mx-*", "my-*"],
    usage: [
      "コンポーネント間の間隔",
      "レイアウト要素の配置",
      "ページ全体の余白",
    ],
  },
  padding: {
    name: "パディング (Padding)",
    description: "要素の内側の余白。コンテンツと境界線の距離を制御",
    classes: ["p-*", "pt-*", "pr-*", "pb-*", "pl-*", "px-*", "py-*"],
    usage: [
      "ボタンやカード内の余白",
      "テキストとコンテナの間隔",
      "インタラクティブ要素の内側",
    ],
  },
  gap: {
    name: "ギャップ (Gap)",
    description: "FlexboxやGridレイアウトでの子要素間の間隔",
    classes: ["gap-*", "gap-x-*", "gap-y-*"],
    usage: [
      "フレックスアイテム間隔",
      "グリッドアイテム間隔",
      "リストアイテムの間隔",
    ],
  },
  space: {
    name: "スペース (Space Between)",
    description: "隣接する子要素間に自動的にマージンを適用",
    classes: ["space-x-*", "space-y-*"],
    usage: ["ナビゲーション項目", "ボタンリスト", "水平・垂直レイアウト"],
  },
};

function SpacingScaleCard({
  value,
  data,
}: {
  value: string;
  data: { value: string; usage: string; example: string };
}) {
  return (
    <PageCard
      description={data.usage}
      title={`${value} (${data.value})`}
      variant="elevated"
    >
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center">
            <div className="h-4 w-4 rounded-sm bg-primary" />
            <div className="h-4 bg-muted" style={{ width: data.value }} />
            <div className="h-4 w-4 rounded-sm bg-primary" />
          </div>
          <div className="text-muted-foreground text-xs">
            視覚的表現（実際のサイズ）
          </div>
        </div>

        <div className="space-y-2">
          <div className="font-medium text-foreground text-sm">使用例</div>
          <div className="text-muted-foreground text-sm">{data.example}</div>
        </div>

        <div className="space-y-2">
          <div className="font-medium text-foreground text-sm">
            Tailwindクラス
          </div>
          <div className="flex flex-wrap gap-1">
            {[`m-${value}`, `p-${value}`, `gap-${value}`].map((className) => (
              <span
                className="rounded bg-muted/50 px-2 py-1 font-mono text-muted-foreground text-xs"
                key={className}
              >
                {className}
              </span>
            ))}
          </div>
        </div>
      </div>
    </PageCard>
  );
}

function SpacingTypeCard({
  name,
  description,
  classes,
  usage,
}: {
  name: string;
  description: string;
  classes: string[];
  usage: string[];
}) {
  return (
    <PageCard description={description} title={name} variant="elevated">
      <div className="space-y-4">
        {/* Tailwindクラス */}
        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-sm">
            Tailwindクラス
          </h4>
          <div className="flex flex-wrap gap-1">
            {classes.map((className) => (
              <span
                className="rounded bg-primary/10 px-2 py-1 font-mono text-primary text-xs"
                key={className}
              >
                {className}
              </span>
            ))}
          </div>
        </div>

        {/* 使用例 */}
        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-sm">使用例</h4>
          <div className="space-y-1">
            {usage.map((item) => (
              <div
                className="flex items-start gap-2 text-muted-foreground text-sm"
                key={item}
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageCard>
  );
}

export default function SpacingPage() {
  const router = useRouter();

  return (
    <PageTemplate
      description="Tailwindの標準スペーシングスケールのガイドライン"
      onBackClick={() => router.back()}
      showBackButton
      title="スペーシング"
    >
      <PageSection
        description="統一されたスペーシングシステムで一貫性のあるレイアウトを構築"
        title="スペーシングスケール"
      >
        <PageGrid cols={3} gap="lg">
          {Object.entries(spacingScale).map(([key, data]) => (
            <SpacingScaleCard data={data} key={key} value={key} />
          ))}
        </PageGrid>
      </PageSection>

      <PageSection
        description="用途に応じたスペーシングプロパティの種類と使い分け"
        title="スペーシングタイプ"
      >
        <PageGrid cols={2} gap="lg">
          {Object.entries(spacingTypes).map(([key, type]) => (
            <SpacingTypeCard
              classes={type.classes}
              description={type.description}
              key={key}
              name={type.name}
              usage={type.usage}
            />
          ))}
        </PageGrid>
      </PageSection>

      <PageSection
        description="効果的なスペーシング設計のための基本原則"
        title="使用ガイドライン"
      >
        <PageGrid cols={2} gap="lg">
          <PageCard
            description="統一されたスケールによる予測可能なレイアウト"
            title="一貫性の原則"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• 定義されたスペーシングスケールを使用</p>
              <p>• 同じ目的の要素には同じスペーシング値を適用</p>
              <p>• レスポンシブデザインでも比率を維持</p>
              <p>• 余白の値は4の倍数を基本とする</p>
            </div>
          </PageCard>

          <PageCard
            description="スペーシングによる情報の重要度と関係性の表現"
            title="視覚的階層"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• 関連する要素は近く、無関係な要素は遠くに配置</p>
              <p>• 重要な要素の周囲により多くの余白を確保</p>
              <p>• セクション間隔 &gt; コンポーネント間隔 &gt; 要素間隔</p>
              <p>• 余白を使って視線の流れを制御する</p>
            </div>
          </PageCard>

          <PageCard
            description="レイアウトタイプに応じた適切な選択"
            title="スペーシングの選び方"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• FlexboxやGridレイアウトではgapを優先的に使用</p>
              <p>• コンポーネント間の距離はmarginで調整</p>
              <p>• コンテンツの内側の余白はpaddingで調整</p>
              <p>• リスト要素の間隔にはspace-yやspace-xを活用</p>
            </div>
          </PageCard>

          <PageCard
            description="よく使用されるスペーシングパターン"
            title="推奨パターン"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• カード内のpadding: p-4〜p-6</p>
              <p>• セクション間のgap: gap-8〜gap-12</p>
              <p>• ボタン内のpadding: px-4 py-2</p>
              <p>• テキスト段落のmargin: mb-4</p>
            </div>
          </PageCard>
        </PageGrid>
      </PageSection>
    </PageTemplate>
  );
}
