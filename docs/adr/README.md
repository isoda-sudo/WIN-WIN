# Architecture Decision Records (ADR)

## ADRとは

ADR（Architecture Decision Record / アーキテクチャ決定記録）は、プロジェクトで下した重要な設計・技術上の決定を、その背景・選択肢・理由とともにMarkdownで記録したものです。「なぜこの技術・構成を選んだのか」を時系列で残すことで、後続の開発者やAIエージェント（Claude Code等）が過去の文脈を正確に引き継げます。1つの決定につき1ファイルを追加し、原則として過去のADRは書き換えず追記・積み上げていきます。

## いつ書くか

以下のような**設計判断を伴う決定**を下したときにADRを書きます。

- 新しいライブラリ・フレームワーク・ツールの採用（または既存のものからの乗り換え）
- アーキテクチャパターンの決定（ディレクトリ構成、レイヤリング、状態管理方針など）
- データモデル・API設計の重要な決定（スキーマ設計、API層の選定、認証方式など）
- 既存の決定の変更・廃止（過去のADRを覆す判断）
- セキュリティ・パフォーマンスに関わるトレードオフの判断

逆に、以下のケースでは**ADRを書きません**。

- 単純なバグ修正
- 挙動を変えないリファクタリング
- 既存の決定に沿った通常の実装（新しい判断を含まないもの）
- 些末な設定変更やタイポ修正

迷ったときの目安: 「半年後の開発者が『なぜこうなっているのか』と疑問を持ちそうな判断」ならADRに残す価値があります。

## ファイル命名規則

```
NNNN-kebab-case-title.md
```

- `NNNN`: 4桁ゼロ埋めの連番（例: `0001`, `0002`, ... `0042`）
- `kebab-case-title`: 内容を表す英小文字のケバブケース（例: `use-bun-as-package-manager`）

例: `0001-use-bun-as-package-manager.md`

## 採番手順

次に使う番号は、既存ADRの最大番号 + 1 です。以下のコマンドで現在の最大番号を確認できます。

```bash
# docs/adr/ 直下で最大の連番を持つADRを表示
ls docs/adr/ | grep -E '^[0-9]{4}' | sort | tail -1
```

新しい番号を機械的に求め、テンプレートをコピーして作成します。

```bash
# 次に使う4桁ゼロ埋め番号を計算（ADRが1本も無い場合は 0001）
last=$(ls docs/adr/ | grep -E '^[0-9]{4}' | sed -E 's/^([0-9]{4}).*/\1/' | sort | tail -1)
next=$(printf '%04d' $(( 10#${last:-0} + 1 )))

# テンプレートをコピーして中身を埋める（タイトル部分は決定内容に合わせて変更）
cp docs/adr/template.md "docs/adr/${next}-your-decision-title.md"
```

## ステータス定義と遷移

| ステータス | 意味 |
| --- | --- |
| `提案中(Proposed)` | 起票済みだが未承認。レビュー・議論中の状態 |
| `承認(Accepted)` | レビューで承認され、有効な決定として採用された状態 |
| `廃止(Deprecated)` | もはや有効でないが、代替となる新ADRは特にない状態 |
| `置換(Superseded by ADR-NNNN)` | 別の新しいADRによって置き換えられた状態 |

遷移の流れ:

```
提案中(Proposed) ──承認──▶ 承認(Accepted) ──┬──不要になった──▶ 廃止(Deprecated)
                                            └──新ADRで覆す──▶ 置換(Superseded by ADR-NNNN)
```

## 運用フロー

1. **コード変更と同じPRに含める**: ADRは、その決定を反映するコード変更と同じPRで追加します。決定と実装が一緒にレビューされることで、文脈が失われません。
2. **起票時は `提案中(Proposed)`**: `template.md` をコピーしてADRを作成し、ステータスを `提案中(Proposed)` にします。
3. **承認されたら `承認(Accepted)`**: PRレビューで決定が承認されたら、ステータスを `承認(Accepted)` に更新します。
4. **既存ADRを覆す場合は新ADRを作る**: 過去の決定を変更・廃止するときは、**旧ADRの本文は書き換えず**、新しいADRを起票します。そのうえで旧ADRのステータスを `置換(Superseded by ADR-NNNN)`（NNNNは新ADRの番号）に更新します。新ADRの「参照」には旧ADR番号を記載します。
5. **インデックス表を更新**: 新規ADRを追加したら、下記の「ADR一覧（インデックス）」表に必ず1行追加します。ステータスを変更したときも表を更新します。なお、インデックス表とファイルの整合性はCI（`bun run check:adr`）でも自動検証されます。

## ADR一覧（インデックス）

> 新規ADRを追加、またはステータスを変更したら、この表も必ず更新すること。

| 番号 | タイトル | ステータス | 日付 |
| --- | --- | --- | --- |
| [0001](./0001-use-bun-as-package-manager.md) | Bunをパッケージマネージャ/ランタイムに採用 | 承認(Accepted) | 2026-07-03 |
| [0002](./0002-use-trpc-for-api-layer.md) | API層にtRPC v11を採用 | 承認(Accepted) | 2026-07-03 |
| [0003](./0003-use-ultracite-for-code-quality.md) | Ultracite（Biomeベース）をlinter/formatterに採用 | 承認(Accepted) | 2026-07-03 |
| [0004](./0004-mirror-agent-skills-via-symlinks.md) | エージェント用Skillをsymlinkでミラーする | 承認(Accepted) | 2026-07-03 |
| [0005](./0005-track-only-external-skills-in-lock.md) | skills-lock.jsonは外部由来Skillのみを管理対象とする | 承認(Accepted) | 2026-07-03 |
| [0006](./0006-keep-ci-review-skill-under-claude-dir.md) | CIレビュー用Skillの実体を .claude/skills/ に置く（ADR-0004 の例外） | 承認(Accepted) | 2026-09-14 |
| [0006](./0006-store-invoice-pdf-and-contact-schema.md) | 請求書PDFの保存と、連絡先・支払条件・確定ロック等のスキーマ追加 | 提案中(Proposed) | 2026-10-06 |
| [0007](./0007-payment-schedule-recurring-and-categories.md) | 支払管理の定期支払い・カテゴリマスタ・支払No、および残金の廃止 | 提案中(Proposed) | 2026-10-08 |
| [0008](./0008-projects-list-and-period-carryover.md) | 受注一覧の固定表示・金額の自動反映・期跨ぎのコピー | 提案中(Proposed) | 2026-10-13 |
| [0009](./0009-invoice-pdf-and-overage.md) | 請求書PDFの整理（電子印のみ・ファイル名）と金額超過の制御 | 提案中(Proposed) | 2026-10-13 |
| [0010](./0010-order-files-naming-dnd-scan.md) | 工事計画の添付：ドラッグ＆ドロップ・電帳法のファイル名・撮影PDF化 | 提案中(Proposed) | 2026-10-13 |
| [0011](./0011-payment-schedule-month-blocks.md) | 支払い予定表の月指定・年月移動・区分ブロック表示 | 提案中(Proposed) | 2026-10-13 |
| [0012](./0012-transfer-fee-masters-and-category-order.md) | 自社口座・振込手数料マスタと支払い区分の並び順 | 提案中(Proposed) | 2026-10-13 |
| [0013](./0013-non-construction-sales.md) | 売上管理表の工事外売上（定期売上・区分・売上ID） | 提案中(Proposed) | 2026-10-13 |
| [0014](./0014-reporting-split-and-construction-categories.md) | レポーティングの顧客別・発注先別への分離と工種マスタの扱い | 提案中(Proposed) | 2026-10-13 |
| [0015](./0015-tax-advisor-role.md) | 閲覧専用ロール「税理士・社労士」の新設 | 提案中(Proposed) | 2026-10-13 |
| [0016](./0016-two-factor-auth-totp.md) | ログインに2段階認証（認証アプリ＋リカバリーコード）を導入 | 提案中(Proposed) | 2026-10-21 |
| [0017](./0017-edit-lock-three-screens.md) | 排他制御（支払い予定表・売上管理表・工事計画）をサーバーで強制し、最後の操作から15分で解除する | 提案中(Proposed) | 2026-10-27 |
| [0018](./0018-notifications-rules-and-delivery.md) | 通知の種類・条件・開封状態・遷移と、毎朝10時の開封済みリセット | 提案中(Proposed) | 2026-10-27 |
| [0019](./0019-order-transfer-fee-fixed-and-totals.md) | 発注の振込手数料をレコード生成時に固定し、金額の集計と粗利に含める | 提案中(Proposed) | 2026-10-27 |
| [0020](./0020-bank-branch-data-and-refresh.md) | 銀行の支店データ（自動連携と手動追加の分離、最新化ボタン） | 提案中(Proposed) | 2026-10-27 |
| [0021](./0021-archive-old-project-files.md) | 5年を過ぎた案件の書類を、画像を再圧縮したZIPで保管する（月次バッチ） | 提案中(Proposed) | 2026-10-28 |

## manage-adr スキルについて

このリポジトリには `manage-adr` スキル（`.agents/skills/manage-adr`）が用意されています。ADRの起票・採番・ステータス更新・インデックス表の更新といった手順をガイドしてくれるので、ADRを書くときはこのスキルを活用すると、本ガイドの手順を漏れなく踏めます。
