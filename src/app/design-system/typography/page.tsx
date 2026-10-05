"use client";

import { useRouter } from "next/navigation";

import {
  PageCard,
  PageGrid,
  PageSection,
  PageTemplate,
} from "~/components/templates/page-template";

const primaryFont = {
  name: "Noto Sans JP",
  description: "アプリケーション全体で統一して使用される日本語対応フォント",
  variable: "--font-noto-sans-jp",
  value: "var(--font-noto-sans-jp), ui-sans-serif, system-ui, sans-serif",
  weights: ["400 (Regular)", "500 (Medium)", "700 (Bold)"],
  usage: [
    "すべてのUI コンポーネント",
    "ナビゲーション",
    "ボタン",
    "見出し",
    "本文テキスト",
  ],
};

const headingStyles = {
  h1: {
    name: "Heading 1",
    description: "ページタイトルや最重要見出しに使用",
    styles: "font-bold text-3xl tracking-tight",
    element: "h1",
  },
  h2: {
    name: "Heading 2",
    description: "セクションタイトルや重要な見出しに使用",
    styles: "font-semibold text-2xl tracking-tight",
    element: "h2",
  },
  h3: {
    name: "Heading 3",
    description: "サブセクションタイトルに使用",
    styles: "font-semibold text-xl",
    element: "h3",
  },
  h4: {
    name: "Heading 4",
    description: "小見出しやグループタイトルに使用",
    styles: "font-semibold text-lg",
    element: "h4",
  },
};

const textStyles = {
  "text-xs": {
    name: "Extra Small",
    size: "12px",
    usage: "ラベル、キャプション",
  },
  "text-sm": { name: "Small", size: "14px", usage: "サブテキスト、説明文" },
  "text-base": { name: "Base", size: "16px", usage: "基本的な本文テキスト" },
  "text-lg": { name: "Large", size: "18px", usage: "リード文、重要なテキスト" },
  "text-xl": { name: "Extra Large", size: "20px", usage: "サブタイトル" },
  "text-2xl": { name: "2X Large", size: "24px", usage: "セクションタイトル" },
  "text-3xl": { name: "3X Large", size: "30px", usage: "ページタイトル" },
};

const fontWeights = {
  "font-normal": { name: "Normal", weight: "400", usage: "基本的な本文" },
  "font-medium": {
    name: "Medium",
    weight: "500",
    usage: "少し強調したいテキスト",
  },
  "font-semibold": {
    name: "Semi Bold",
    weight: "600",
    usage: "見出し、重要なテキスト",
  },
  "font-bold": { name: "Bold", weight: "700", usage: "強い強調、タイトル" },
};

function FontFamilyCard({
  name,
  description,
  variable,
  usage,
  weights,
}: {
  name: string;
  description: string;
  variable: string;
  usage: string[];
  weights?: string[];
}) {
  return (
    <PageCard description={description} title={name} variant="elevated">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-2xl">あのイーハトーヴォの</div>
          <div className="text-lg text-muted-foreground">
            The quick brown fox jumps over the lazy dog
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-sm">CSS変数</h4>
          <div className="rounded bg-muted/30 p-2 font-mono text-foreground text-xs">
            var({variable})
          </div>
        </div>

        {weights?.length ? (
          <div className="space-y-2">
            <h4 className="font-medium text-foreground text-sm">
              利用可能なウェイト
            </h4>
            <div className="flex flex-wrap gap-1">
              {weights.map((weight) => (
                <span
                  className="rounded bg-primary/10 px-2 py-1 text-primary text-xs"
                  key={weight}
                >
                  {weight}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-sm">使用例</h4>
          <div className="flex flex-wrap gap-1">
            {usage.map((item) => (
              <span
                className="rounded bg-muted/50 px-2 py-1 text-muted-foreground text-xs"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </PageCard>
  );
}

function HeadingCard({
  name,
  description,
  styles,
  element,
}: {
  name: string;
  description: string;
  styles: string;
  element: string;
}) {
  const HeadingComponent = element as "h1" | "h2" | "h3" | "h4";

  return (
    <PageCard description={description} title={name} variant="elevated">
      <div className="space-y-4">
        {/* 見出しサンプル */}
        <div className="space-y-2">
          <HeadingComponent className={styles}>
            サンプル見出しテキスト
          </HeadingComponent>
          <div className="text-muted-foreground text-sm">
            Sample Heading Text
          </div>
        </div>

        {/* Tailwindクラス */}
        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-sm">
            Tailwindクラス
          </h4>
          <div className="rounded bg-muted/30 p-2 font-mono text-foreground text-xs">
            {styles}
          </div>
        </div>
      </div>
    </PageCard>
  );
}

function TextSizeCard({
  className,
  name,
  size,
  usage,
}: {
  className: string;
  name: string;
  size: string;
  usage: string;
}) {
  return (
    <PageCard
      description={usage}
      title={`${name} (${size})`}
      variant="elevated"
    >
      <div className="space-y-4">
        {/* テキストサンプル */}
        <div className="space-y-2">
          <div className={`${className} font-normal`}>
            これはサンプルテキストです。読みやすさを確認してください。
          </div>
          <div className={`${className} text-muted-foreground`}>
            This is sample text. Please check readability.
          </div>
        </div>

        {/* Tailwindクラス */}
        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-sm">
            Tailwindクラス
          </h4>
          <div className="rounded bg-muted/30 p-2 font-mono text-foreground text-xs">
            {className}
          </div>
        </div>
      </div>
    </PageCard>
  );
}

function FontWeightCard({
  className,
  name,
  weight,
  usage,
}: {
  className: string;
  name: string;
  weight: string;
  usage: string;
}) {
  return (
    <PageCard
      description={usage}
      title={`${name} (${weight})`}
      variant="elevated"
    >
      <div className="space-y-4">
        {/* フォントウェイトサンプル */}
        <div className="space-y-2">
          <div className={`text-xl ${className}`}>フォントの太さサンプル</div>
          <div className={`text-base text-muted-foreground ${className}`}>
            Font weight sample text
          </div>
        </div>

        {/* Tailwindクラス */}
        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-sm">
            Tailwindクラス
          </h4>
          <div className="rounded bg-muted/30 p-2 font-mono text-foreground text-xs">
            {className}
          </div>
        </div>
      </div>
    </PageCard>
  );
}

export default function TypographyPage() {
  const router = useRouter();

  return (
    <PageTemplate
      description="globals.cssに定義されたタイポグラフィのガイドライン"
      onBackClick={() => router.back()}
      showBackButton
      title="タイポグラフィ"
    >
      <PageSection
        description="アプリケーション全体で統一して使用される日本語対応フォント"
        title="フォントファミリー"
      >
        <PageGrid cols={1} gap="lg">
          <FontFamilyCard
            description={primaryFont.description}
            name={primaryFont.name}
            usage={primaryFont.usage}
            variable={primaryFont.variable}
            weights={primaryFont.weights}
          />
        </PageGrid>
      </PageSection>

      <PageSection
        description="階層的な情報構造を表現する見出しのスタイル定義"
        title="見出しスタイル"
      >
        <PageGrid cols={2} gap="lg">
          {Object.entries(headingStyles).map(([key, heading]) => (
            <HeadingCard
              description={heading.description}
              element={heading.element}
              key={key}
              name={heading.name}
              styles={heading.styles}
            />
          ))}
        </PageGrid>
      </PageSection>

      <PageSection
        description="情報の重要度に応じたテキストサイズの定義"
        title="テキストサイズ"
      >
        <PageGrid cols={2} gap="lg">
          {Object.entries(textStyles).map(([className, text]) => (
            <TextSizeCard
              className={className}
              key={className}
              name={text.name}
              size={text.size}
              usage={text.usage}
            />
          ))}
        </PageGrid>
      </PageSection>

      <PageSection
        description="情報の重要度や階層を表現するフォントの太さ"
        title="フォントウェイト"
      >
        <PageGrid cols={2} gap="lg">
          {Object.entries(fontWeights).map(([className, weight]) => (
            <FontWeightCard
              className={className}
              key={className}
              name={weight.name}
              usage={weight.usage}
              weight={weight.weight}
            />
          ))}
        </PageGrid>
      </PageSection>

      <PageSection
        description="読みやすさを向上させるための原則"
        title="使用ガイドライン"
      >
        <PageGrid cols={2} gap="lg">
          <PageCard
            description="階層的な情報構造の表現"
            title="タイポグラフィ階層"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• ページタイトルにはH1を使用（1ページに1つ）</p>
              <p>• セクションタイトルにはH2を使用</p>
              <p>• サブセクションにはH3、H4を使用</p>
              <p>• 本文テキストにはtext-baseを基本とする</p>
            </div>
          </PageCard>
          <PageCard
            description="読みやすさへの配慮"
            title="可読性の確保"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• 行長は45-75文字を目安にする</p>
              <p>• 適切な行間（1.5-1.75）を維持する</p>
              <p>• 重要な情報にはフォントウェイトで強調</p>
              <p>• 長文にはtext-base以上のサイズを使用</p>
            </div>
          </PageCard>
        </PageGrid>
      </PageSection>
    </PageTemplate>
  );
}
