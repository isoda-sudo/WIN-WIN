# ADR-0003: Ultracite（Biomeベース）をlinter/formatterに採用

## メタ情報

- **ステータス**: 承認(Accepted)
- **日付**: 2026-07-03
- **決定者**: テンプレートメンテナー

## コンテキスト（背景と課題）

複数チームが共有する本テンプレートでは、コードのlint・フォーマットを統一し、CI・ローカル・AIエージェントのいずれでも同じ基準で品質を担保したい。要件は以下のとおり。

- lintとフォーマットを高速に、できれば単一ツールで実行できること
- 設定が明快で、AIエージェント（Claude Code等）が扱いやすい「AI-ready」な構成であること
- コミット前に自動でフォーマット・チェックが走り、乱れたコードが混入しないこと
- React / Next.js向けのルールを備えていること

## 検討した選択肢

### 選択肢A: ESLint + Prettier

- 長所:
  - デファクトで、プラグイン・ルールのエコシステムが最も豊富
  - 既存の知見・設定例が多い
- 短所:
  - lint（ESLint）とフォーマット（Prettier）で別ツール・別設定となり構成が複雑
  - JavaScript実装で相対的に低速。設定ファイルやプラグインの管理コストが高い

### 選択肢B: Biome（単体）

- 長所:
  - Rust製で高速、lintとフォーマットを単一ツールで担える
  - 設定が1ファイルにまとまる
- 短所:
  - 推奨ルールセットやAI向けの初期設定は各自で組み立てる必要がある

### 選択肢C: Ultracite（Biomeベース）

- 長所:
  - Biomeの高速さ（lint + format 一体）をそのまま活かせる
  - AI-readyな推奨設定（`ultracite/biome/core` / `react` / `next`）を `extends` するだけで導入できる
  - `bunx ultracite check` / `fix` というシンプルなCLIで運用できる
- 短所:
  - Ultracite / Biomeのバージョン整合を意識する必要がある

## 決定内容

linter/formatterとして **Ultracite**（Biomeベース）を採用する。設定は `biome.jsonc` で Ultracite の推奨プリセットを `extends` し、実行は `package.json` のスクリプト（`check` / `check:write` / `check:unsafe`）経由で行う。コミット前チェックは **lefthook** のpre-commitフックで自動実行する。

## 決定の理由

ESLint + Prettierの二本立てに比べ、Biomeベースのlint + format一体構成は高速かつ設定がシンプルで、共有テンプレートの運用コストを下げられる。UltraciteはそのBiomeの上に「AI-ready」な推奨ルールをプリセットとして提供し、`biome.jsonc` で以下のように `extends` するだけでReact / Next.js向けの基準が揃う。

```jsonc
{
  "extends": [
    "ultracite/biome/core",
    "ultracite/biome/react",
    "ultracite/biome/next"
  ]
}
```

`package.json` では以下のスクリプトを用意している。

- `check`: `bunx ultracite check`（チェックのみ）
- `check:write`: `bunx ultracite fix`（安全な自動修正）
- `check:unsafe`: `bunx ultracite fix --unsafe`（安全でない修正も適用）

さらに `lefthook.yml` のpre-commitフックで `bun run check:write`（修正結果をステージに反映）と `bun run typecheck` を実行し、フォーマット崩れや型エラーを含むコードがコミットされないようにしている。

```yaml
pre-commit:
  jobs:
    - run: bun run check:write
      stage_fixed: true
    - run: bun run typecheck
```

なお `biome.jsonc` ではプロジェクト固有の調整として、`.agents/skills/**/*.md` をチェック対象から除外し、`useSortedClasses`（Tailwindのクラス並び替え）や一部ルールの有効化・無効化を行っている。

## 影響

### ポジティブ

- lintとフォーマットを単一ツール・高速に実行できる
- AI-readyな推奨設定を `extends` するだけで導入・維持できる
- pre-commitで自動整形・型チェックが走り、品質が一定に保たれる

### ネガティブ

- Ultracite / Biomeのバージョン更新時に整合性を確認する必要がある
- ESLintプラグイン前提の一部の細かいルールは、そのままでは使えない場合がある

### フォローアップタスク

- [x] `biome.jsonc` に Ultracite プリセットを設定
- [x] `lefthook.yml` のpre-commitで `check:write` と `typecheck` を実行
- [ ] Ultracite / Biome のバージョン更新時に設定・ルールの差分を確認する

## 参照

- `biome.jsonc`（`extends` / linter設定）
- `package.json`（`check` / `check:write` / `check:unsafe` スクリプト）
- `lefthook.yml`（pre-commit）
- ADR-0001: Bunをパッケージマネージャ/ランタイムに採用
- https://www.ultracite.ai/
- https://biomejs.dev/
