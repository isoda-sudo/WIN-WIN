"use client";

import { useRouter } from "next/navigation";
import type React from "react";

import {
  PageCard,
  PageGrid,
  PageSection,
  PageTemplate,
} from "~/components/templates/page-template";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface ComponentShowcaseProps {
  category?: string;
  children: React.ReactNode;
  description: string;
  title: string;
  variants?: string[];
}

function ComponentShowcase({
  title,
  description,
  children,
  category,
  variants,
}: ComponentShowcaseProps) {
  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <CardTitle className="font-semibold text-xl">{title}</CardTitle>
              {category ? (
                <Badge className="font-normal text-xs" variant="secondary">
                  {category}
                </Badge>
              ) : null}
            </div>
            <CardDescription className="text-sm leading-relaxed">
              {description}
            </CardDescription>
            {variants?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {variants.map((variant) => (
                  <span
                    className="inline-flex items-center rounded-md bg-muted/50 px-2 py-1 font-medium text-muted-foreground text-xs"
                    key={variant}
                  >
                    {variant}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="relative">
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border bg-gradient-to-br from-background to-muted/20 p-8">
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ComponentsPage() {
  const router = useRouter();

  return (
    <PageTemplate
      description="Shadcn/UIコンポーネントの基本的な使用例"
      onBackClick={() => router.back()}
      showBackButton
      title="コンポーネント"
    >
      <PageSection>
        <div className="grid gap-6">
          {/* Buttons */}
          <ComponentShowcase
            category="Action"
            description="ユーザーのアクションをトリガーするボタンコンポーネント。様々なバリエーションでアクションの重要度を表現します。"
            title="Button"
            variants={[
              "Primary",
              "Secondary",
              "Outline",
              "Ghost",
              "Link",
              "Destructive",
            ]}
          >
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg">Primary</Button>
              <Button size="lg" variant="secondary">
                Secondary
              </Button>
              <Button size="lg" variant="outline">
                Outline
              </Button>
              <Button size="lg" variant="ghost">
                Ghost
              </Button>
              <Button size="lg" variant="link">
                Link
              </Button>
              <Button size="lg" variant="destructive">
                Destructive
              </Button>
            </div>
          </ComponentShowcase>

          {/* Cards */}
          <ComponentShowcase
            category="Layout"
            description="関連するコンテンツをグループ化し、情報を整理して表示するコンテナコンポーネントです。"
            title="Card"
            variants={["Default", "Elevated", "Outlined"]}
          >
            <div className="grid w-full max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle className="text-base">
                    プロジェクトカード
                  </CardTitle>
                  <CardDescription>基本的なカード</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    コンテンツをグループ化して表示
                  </p>
                </CardContent>
              </Card>
              <Card className="h-fit shadow-lg">
                <CardHeader>
                  <CardTitle className="text-base">
                    エレベーテッドカード
                  </CardTitle>
                  <CardDescription>強調されたカード</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    より目立つスタイル
                  </p>
                </CardContent>
              </Card>
            </div>
          </ComponentShowcase>

          {/* Badges */}
          <ComponentShowcase
            category="Display"
            description="ステータス、カテゴリ、数値などを小さなラベルで表示するコンポーネントです。"
            title="Badge"
            variants={["Default", "Secondary", "Outline", "Destructive"]}
          >
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Badge className="px-3 py-1 text-sm">Default</Badge>
              <Badge className="px-3 py-1 text-sm" variant="secondary">
                Secondary
              </Badge>
              <Badge className="px-3 py-1 text-sm" variant="outline">
                Outline
              </Badge>
              <Badge className="px-3 py-1 text-sm" variant="destructive">
                Destructive
              </Badge>
            </div>
          </ComponentShowcase>

          {/* Alerts */}
          <ComponentShowcase
            category="Feedback"
            description="ユーザーの注意を引く重要な情報、警告、エラーメッセージを表示するコンポーネントです。"
            title="Alert"
            variants={["Default", "Destructive"]}
          >
            <div className="w-full max-w-md space-y-4">
              <Alert>
                <AlertTitle>情報</AlertTitle>
                <AlertDescription>
                  新しい機能が利用可能になりました。
                </AlertDescription>
              </Alert>

              <Alert variant="destructive">
                <AlertTitle>エラー</AlertTitle>
                <AlertDescription>
                  接続に失敗しました。再試行してください。
                </AlertDescription>
              </Alert>
            </div>
          </ComponentShowcase>

          {/* Form Components */}
          <ComponentShowcase
            category="Input"
            description="ユーザー入力を受け取るためのフォーム要素群。一貫した入力体験を提供します。"
            title="Form Components"
            variants={["Input", "Select", "Label"]}
          >
            <div className="w-full max-w-sm space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-medium text-sm" htmlFor="name">
                    お名前
                  </Label>
                  <Input className="h-10" id="name" placeholder="山田太郎" />
                </div>
                <div className="space-y-2">
                  <Label className="font-medium text-sm" htmlFor="email">
                    メール
                  </Label>
                  <Input
                    className="h-10"
                    id="email"
                    placeholder="example@mail.com"
                    type="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm" htmlFor="category">
                  カテゴリー
                </Label>
                <Select>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="frontend">フロントエンド</SelectItem>
                    <SelectItem value="backend">バックエンド</SelectItem>
                    <SelectItem value="design">デザイン</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </ComponentShowcase>
        </div>
      </PageSection>

      <PageSection
        description="Shadcn/UIコンポーネントの効果的な使い方"
        title="使用ガイドライン"
      >
        <PageGrid cols={2} gap="lg">
          <PageCard
            description="コンポーネントの適切な使用シーン"
            title="コンポーネントの選択"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• 主要なアクションにはPrimaryボタンを使用</p>
              <p>• 関連情報をまとめる場合はCardを使用</p>
              <p>• ステータス表示にはBadgeを使用</p>
              <p>• 重要な情報にはAlertを使用</p>
              <p>• ユーザー入力にはフォームコンポーネントを活用</p>
            </div>
          </PageCard>

          <PageCard
            description="一貫性のあるUIデザイン"
            title="デザイン原則"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• 同じ目的には同じコンポーネントを使用</p>
              <p>• バリアントは目的に応じて使い分ける</p>
              <p>• アクセシビリティを常に考慮する</p>
              <p>• レスポンシブデザインに対応する</p>
              <p>• デザイントークンを活用して統一感を維持</p>
            </div>
          </PageCard>

          <PageCard
            description="ボタンコンポーネントの使い分け"
            title="ボタンのベストプラクティス"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• ページ内の主要なアクションは1つに絞る</p>
              <p>• 破壊的な操作にはDestructiveバリアントを使用</p>
              <p>• テキストリンクにはLinkバリアントを活用</p>
              <p>• ローディング状態を適切に表現する</p>
            </div>
          </PageCard>

          <PageCard
            description="アクセシビリティの確保"
            title="a11y対応"
            variant="elevated"
          >
            <div className="space-y-3 text-muted-foreground text-sm">
              <p>• キーボード操作に対応する</p>
              <p>• 適切なARIAラベルを設定する</p>
              <p>• フォーカス状態を視覚的に明示する</p>
              <p>• スクリーンリーダーでの動作を確認する</p>
            </div>
          </PageCard>
        </PageGrid>
      </PageSection>
    </PageTemplate>
  );
}
