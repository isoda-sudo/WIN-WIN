"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { memo } from "react";

import {
  PageCard,
  PageGrid,
  PageSection,
  PageTemplate,
} from "~/components/templates/page-template";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { useColorValues } from "~/hooks/use-color-values";
import {
  type ColorTokenDefinition,
  chartColors,
  colorTokens,
  sidebarColors,
} from "~/lib/design-tokens";

interface ColorSwatchProps {
  token: ColorTokenDefinition;
}

const ColorSwatch = memo(({ token }: ColorSwatchProps) => {
  const {
    light: lightValue,
    dark: darkValue,
    loading,
    error,
  } = useColorValues(token.variable);

  // Error state
  if (error) {
    return (
      <PageCard
        description={token.description}
        title={token.name}
        variant="elevated"
      >
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            カラー値の読み込みに失敗しました: {error.message}
          </AlertDescription>
        </Alert>
      </PageCard>
    );
  }

  return (
    <PageCard
      description={token.description}
      title={token.name}
      variant="elevated"
    >
      <div className="space-y-4">
        {/* カラースウォッチ */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            {loading ? (
              <div className="h-16 animate-pulse rounded-lg border bg-muted/50" />
            ) : (
              <div
                aria-label={`${token.name} light mode color: ${lightValue}`}
                className="h-16 rounded-lg border"
                role="img"
                style={{
                  backgroundColor: lightValue,
                }}
              />
            )}
            <div className="space-y-1 text-xs">
              <div className="font-medium text-foreground">Light</div>
              {loading ? (
                <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
              ) : (
                <div className="font-mono text-muted-foreground">
                  {lightValue || "N/A"}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {loading ? (
              <div className="h-16 animate-pulse rounded-lg border bg-muted/50" />
            ) : (
              <div
                aria-label={`${token.name} dark mode color: ${darkValue}`}
                className="h-16 rounded-lg border"
                role="img"
                style={{
                  backgroundColor: darkValue,
                }}
              />
            )}
            <div className="space-y-1 text-xs">
              <div className="font-medium text-foreground">Dark</div>
              {loading ? (
                <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
              ) : (
                <div className="font-mono text-muted-foreground">
                  {darkValue || "N/A"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 使用例 */}
        {token.usage?.length ? (
          <div className="space-y-2">
            <h4 className="font-medium text-foreground text-sm">使用例</h4>
            <div className="flex flex-wrap gap-1">
              {token.usage.map((item) => (
                <span
                  className="rounded bg-muted/50 px-2 py-1 text-muted-foreground text-xs"
                  key={item}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* CSS変数 */}
        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-sm">CSS変数</h4>
          <div className="rounded bg-muted/30 p-2 font-mono text-foreground text-xs">
            var({token.variable})
          </div>
        </div>
      </div>
    </PageCard>
  );
});

ColorSwatch.displayName = "ColorSwatch";

export default function ColorsPage() {
  const router = useRouter();

  return (
    <PageTemplate
      description="globals.cssに定義されたカラートークンの一覧とガイドライン"
      onBackClick={() => router.back()}
      showBackButton
      title="カラーシステム"
    >
      <PageSection
        description="アプリケーション全体で使用される基本カラー。OKLCH色空間による一貫性のある色彩設計"
        title="基本カラー"
      >
        <PageGrid cols={3} gap="lg">
          {Object.entries(colorTokens).map(([key, token]) => (
            <ColorSwatch key={key} token={token} />
          ))}
        </PageGrid>
      </PageSection>

      <PageSection
        description="チャートやグラフで使用するデータ可視化専用カラーパレット"
        title="チャートカラー"
      >
        <PageGrid cols={5} gap="lg">
          {Object.entries(chartColors).map(([key, token]) => (
            <ColorSwatch key={key} token={token} />
          ))}
        </PageGrid>
      </PageSection>

      <PageSection
        description="サイドバーコンポーネント専用のカラーパレット"
        title="サイドバーカラー"
      >
        <PageGrid cols={3} gap="lg">
          {Object.entries(sidebarColors).map(([key, token]) => (
            <ColorSwatch key={key} token={token} />
          ))}
        </PageGrid>
      </PageSection>

      <PageSection
        description="効果的なカラー使用のための原則"
        title="使用ガイドライン"
      >
        <PageGrid cols={2} gap="lg">
          <PageCard
            description="カラーの適切な使用シーン"
            title="カラーの使い分け"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• 主要なアクションやCTAにはPrimaryを使用</p>
              <p>• サポート的な要素にはSecondaryを使用</p>
              <p>• 強調したい情報にはAccentを使用</p>
              <p>• 削除や警告にはDestructiveを使用</p>
            </div>
          </PageCard>
          <PageCard
            description="アクセシビリティへの配慮"
            title="コントラスト比"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• テキストは背景とのコントラスト比4.5:1以上を確保</p>
              <p>• 大きなテキストは3:1以上を確保</p>
              <p>• 色だけに依存せず、アイコンやテキストも併用</p>
              <p>• ダークモードでも適切な視認性を維持</p>
            </div>
          </PageCard>
        </PageGrid>
      </PageSection>
    </PageTemplate>
  );
}
