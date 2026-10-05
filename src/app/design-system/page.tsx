import {
  ArrowRight,
  Grid3X3,
  Layout,
  Palette,
  Sparkles,
  Type,
} from "lucide-react";
import Link from "next/link";

import {
  PageCard,
  PageFeatureCard,
  PageGrid,
  PageHero,
  PageSection,
  PageStepCard,
  PageTemplate,
} from "~/components/templates/page-template";

const designCategories = [
  {
    id: "colors",
    title: "カラーシステム",
    description:
      "プライマリ、セカンダリ、アクセントカラーとセマンティックカラーの定義",
    icon: Palette,
    href: "/design-system/colors",
    preview: "OKLCH色空間を使用した一貫性のある色彩設計",
    color: "primary",
  },
  {
    id: "typography",
    title: "タイポグラフィ",
    description: "フォントファミリー、サイズ、ウェイト、行間の体系的な定義",
    icon: Type,
    href: "/design-system/typography",
    preview: "Noto Sans JPを基調とした読みやすいタイポグラフィシステム",
    color: "secondary",
  },
  {
    id: "spacing",
    title: "スペーシング",
    description: "マージン、パディング、ギャップの統一されたルール",
    icon: Layout,
    href: "/design-system/spacing",
    preview: "一貫性のある余白設計による美しいレイアウト",
    color: "accent",
  },
  {
    id: "components",
    title: "コンポーネント",
    description:
      "ボタン、カード、フォーム要素などの再利用可能なUIコンポーネント",
    icon: Grid3X3,
    href: "/design-system/components",
    preview: "Shadcn/UIベースのカスタムコンポーネントライブラリ",
    color: "muted",
  },
];

export default function DesignSystemPage() {
  return (
    <PageTemplate
      description="Shadcn/UIコンポーネント + globals.cssのデザイントークンで構成されたデザインシステム"
      title="デザインシステム"
    >
      {/* ヒーローセクション */}
      <PageHero
        badges={[
          {
            label: "デザイントークン",
            icon: <Sparkles className="size-3.5" />,
            variant: "secondary",
            className: "bg-accent/15 text-accent-foreground border-accent/30",
          },
        ]}
        description="Shadcn/UIコンポーネントとglobals.cssのデザイントークンが統合され、アプリケーション全体で一貫性のある美しいデザインを実現します。"
        gradient="accent"
        title={
          <>
            一貫性のあるデザインを
            <br />
            システマティックに実現
          </>
        }
      />

      <PageSection
        description="各カテゴリの詳細なガイドラインとデザイントークン"
        spacing="lg"
        title="デザインシステムカテゴリ"
      >
        <PageGrid cols={2} gap="lg">
          {designCategories.map((category) => {
            const IconComponent = category.icon;
            return (
              <Link className="group" href={category.href} key={category.id}>
                <PageFeatureCard
                  description={category.preview}
                  icon={<IconComponent className="size-8" />}
                  title={category.title}
                >
                  <div className="mt-5 flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-4 shadow-sm transition-all duration-300 group-hover:border-border group-hover:bg-muted/50 group-hover:shadow-md">
                    <span className="font-semibold text-base text-foreground">
                      ガイドを見る
                    </span>
                    <ArrowRight className="size-5 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </PageFeatureCard>
              </Link>
            );
          })}
        </PageGrid>
      </PageSection>

      <PageSection
        description="デザインシステムの構成とワークフロー"
        spacing="lg"
        title="デザインシステムアーキテクチャ"
      >
        <PageGrid cols={1} gap="lg">
          <PageCard
            description="Shadcn/UIコンポーネント + globals.cssのデザイントークンで構成されたデザインシステム"
            title="デザインシステムの構成要素"
            variant="elevated"
          >
            <div className="space-y-5 pt-2">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
                <h4 className="mb-4 font-bold text-base text-foreground">
                  🎨 デザインシステムの構成
                </h4>
                <div className="space-y-3 text-muted-foreground text-sm leading-relaxed">
                  <p>
                    •
                    <strong className="font-semibold text-foreground">
                      Shadcn/UIコンポーネント
                    </strong>
                    - 再利用可能なUIコンポーネントライブラリ
                  </p>
                  <p>
                    •
                    <strong className="font-semibold text-foreground">
                      globals.cssのデザイントークン
                    </strong>
                    - カラー、タイポグラフィ、スペーシングなどの設計値
                  </p>
                  <p>
                    •
                    この2つを組み合わせることで、一貫性のあるデザインシステムを実現
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-6 shadow-sm">
                <h4 className="mb-4 font-bold text-base text-foreground">
                  🛠️ tweakcnの役割
                </h4>
                <div className="space-y-3 text-muted-foreground text-sm leading-relaxed">
                  <p>
                    •
                    tweakcnは、デザイナーがGUI上でデザイントークンを視覚的に調整するためのツール
                  </p>
                  <p>
                    •
                    コードを書かずに、カラーパレット、タイポグラフィ、スペーシングをプレビューしながら調整可能
                  </p>
                  <p>
                    •
                    調整した設定をCSSとしてエクスポートし、globals.cssに反映することで、デザインシステムを簡単に更新
                  </p>
                </div>
              </div>
            </div>
          </PageCard>

          <PageCard
            description="デザイナーがGUIで調整し、開発者がすぐに適用できるワークフロー"
            title="tweakcn統合ワークフロー"
            variant="elevated"
          >
            <div className="space-y-6">
              <div className="space-y-4">
                <PageStepCard
                  description={
                    <>
                      <a
                        className="font-medium text-primary underline-offset-4 hover:underline"
                        href="https://tweakcn.com/"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        tweakcn.com
                      </a>
                      でカラー、タイポグラフィ、スペーシングを視覚的にカスタマイズ
                    </>
                  }
                  step={1}
                  title="デザイナーがtweakcnでスタイル調整"
                  variant="primary"
                />
                <PageStepCard
                  description="エクスポートされたCSSをsrc/styles/globals.cssにコピー＆ペースト"
                  step={2}
                  title="globals.cssに貼り付け"
                  variant="secondary"
                />
                <PageStepCard
                  description="このページで各デザイントークンが自動的に反映されることを確認"
                  step={3}
                  title="デザインシステムページで確認"
                  variant="accent"
                />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="mb-3 font-medium text-foreground text-sm">
                  💡 AIとの統合
                </h4>
                <div className="space-y-2 text-muted-foreground text-sm">
                  <p>
                    •
                    このデザインシステムを運用することで、AIによるUI生成でも一貫したデザインが実現
                  </p>
                  <p>
                    •
                    全てのコンポーネントがデザイントークンを使用するため、globals.cssの更新だけでアプリ全体のデザイン変更が可能
                  </p>
                  <p>
                    •
                    デザイナー、開発者、AIが同じデザイン言語を共有し、効率的な開発が可能に
                  </p>
                </div>
              </div>
            </div>
          </PageCard>

          <PageCard
            description="一度の設定でアプリケーション全体のデザインを統一"
            title="デザインシステムの利点"
            variant="elevated"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="font-medium text-foreground text-sm">
                  ✨ デザイナーフレンドリー
                </h4>
                <p className="text-muted-foreground text-xs">
                  コードを書かずに、視覚的なツールでデザインをカスタマイズ
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-foreground text-sm">
                  🚀 開発効率化
                </h4>
                <p className="text-muted-foreground text-xs">
                  CSSをコピー＆ペーストするだけで、全体のデザインが即座に反映
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-foreground text-sm">
                  🤖 AI対応
                </h4>
                <p className="text-muted-foreground text-xs">
                  AIが生成するUIも自動的にデザインシステムに準拠
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-foreground text-sm">
                  🎨 一貫性
                </h4>
                <p className="text-muted-foreground text-xs">
                  アプリケーション全体で統一されたルック＆フィール
                </p>
              </div>
            </div>
          </PageCard>
        </PageGrid>
      </PageSection>

      <PageSection
        description="デザインシステムを効果的に活用するための原則"
        spacing="lg"
        title="デザイン原則"
      >
        <PageGrid cols={2} gap="lg">
          <PageCard
            description="統一されたデザイントークンによる予測可能なUI"
            title="一貫性"
            variant="elevated"
          >
            <div className="space-y-3 pt-2 text-muted-foreground text-sm leading-relaxed">
              <p>• 同じ目的には同じデザイントークンを使用</p>
              <p>• カラー、タイポグラフィ、スペーシングの統一</p>
              <p>• 予測可能で学習しやすいインターフェース</p>
            </div>
          </PageCard>
          <PageCard
            description="効率的な開発とメンテナンス"
            title="スケーラビリティ"
            variant="elevated"
          >
            <div className="space-y-3 pt-2 text-muted-foreground text-sm leading-relaxed">
              <p>• グローバルなデザイン変更が容易</p>
              <p>• 再利用可能なコンポーネント</p>
              <p>• チーム全体での効率的な協業</p>
            </div>
          </PageCard>
        </PageGrid>
      </PageSection>
    </PageTemplate>
  );
}
