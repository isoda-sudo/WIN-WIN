# ADR-0006: 請求書PDFの保存と、連絡先・支払条件・確定ロック等のスキーマ追加

## メタ情報

- **ステータス**: 提案中(Proposed)
- **日付**: 2026-10-06
- **決定者**: Claude Code (承認: レビュアー・保守担当)

## コンテキスト（背景と課題）

ブランチ `fordevelop_0930` では、顧客・発注先の連絡先/宛先、発注先の支払条件、案件の予定売上額と確定（フィックス）、請求書の保存コピーといった要件（D-04 / D-05 / D-07 / D-13 / D-14 / D-23 など）に対応するため、共有DB（本番）のスキーマに列・テーブルを追加している。

また請求書は税務上10年保存が必要で、これまでは発行時に台帳（`invoices`）へ凍結値だけを保持し、PDFは表示のたびに再生成していた。テンプレートや案件名が後から変わると、発行時と同じ見た目のPDFを再現できない（Q19）。

本ADRは、このブランチで加わったスキーマ変更をまとめて記録する（Hard Rule 1）。

## 検討した選択肢

### 選択肢A: 凍結値からの都度再生成のみ（現状）

- 長所:
  - 追加の保存領域が不要
- 短所:
  - テンプレート・案件情報の変更が過去分の見た目に影響し、発行時のPDFを再現できない

### 選択肢B: 発行時のPDFを `invoice_files.pdf`（bytea）に保存する

- 長所:
  - 発行時の内容がそのまま残り、取得時は保存PDFを返すだけで済む
  - 請求書PDFは小さく（数十KB程度）、Vercelのリクエストボディ上限（4.5MB）にも影響しない（アップロードではなくサーバー内生成のため）
- 短所:
  - DBサイズが請求書の枚数分だけ増える

### 選択肢C: オブジェクトストレージへ保存する

- 長所:
  - DBが肥大化しない
- 短所:
  - 新たな基盤・秘密情報の導入が必要。他のファイル（契約書等）はDBに保存する既存方針と不整合

## 決定内容

選択肢Bを採用し、`invoice_files` にnullableな `pdf`（bytea）列を追加する。発行時（`invoices.create`）に生成したPDFを保存し、`/api/invoices/[id]/file` は保存PDFがあればそれを返し、無ければ（列追加前の旧データ、保存コピー削除後）台帳の凍結値から再生成する。台帳（`invoices`）の行は削除しない。保存コピー（`invoice_files`）の削除は、案件のステータスに関わらず許可する（台帳が残るため10年保存に影響しない。2026-10-08 に合意）。

あわせて、このブランチで追加したスキーマ変更を以下のとおり記録する。

| 対象 | 変更 |
| --- | --- |
| `customers` | `contact_title`, `zip_code`, `to_contacts`(jsonb), `cc_contacts`(jsonb) を追加 |
| `vendors` | `zip_code`, `to_contacts`(jsonb), `cc_contacts`(jsonb) を追加 |
| `vendors` | 支払条件 `payment_closing_day`, `payment_due_day`, `payment_due_month_offset` を追加（`payment_term` は表示ラベル。新規の既定は月末締翌々月5日払い） |
| `projects` | `planned_amount` と CHECK `projects_planned_amount_nonneg` を追加 |
| `projects` | `locked_at`, `locked_by`（確定（フィックス））を追加 |
| `invoice_files` | テーブルを新設（`invoice_id`, `project_id`, `filename`, `data_url`, `uploaded_at`）。本ADRで `pdf`(bytea, nullable) を追加 |
| `orders` | `work_type` 列はDBに残す（アプリは扱わない。D-18） |

## 決定の理由

発行時の内容を保存することで、税務上の保存要件と「発行時と同じ見た目」を満たせる。PDFは小さくDBへの保存で足りるため、新しい基盤を導入しない。連絡先・支払条件・確定ロックは要件の決定事項（D-04 / D-05 / D-07 / D-13 / D-14）に対応する最小限の列追加である。

## 影響

### ポジティブ

- 発行済み請求書の再現性が上がる
- 請求書台帳を物理削除しない運用（10年保存）と整合する

### ネガティブ

- `invoice_files` の行サイズが増える（請求書1通あたり数十KB程度）
- 共有DBへの適用が済むまで、該当列を参照するコードは本番で動作しない

### フォローアップタスク

- [ ] 上記の列・テーブルを共有DBへ、保守担当がプロジェクト標準のスキーマ変更手順で適用する（このブランチの作業では適用していない。`db push` / マイグレーションは実行しない）
- [ ] `vendors.payment_term` / `orders.payment` の列DEFAULTを「月末締翌々月5日払い」へ変更するかを保守担当が判断する（アプリ側は明示的に値を入れるため、DEFAULTの変更は必須ではない）
- [ ] 適用後、`invoice_files.pdf` がNULLの旧データは凍結値からの再生成で表示されることを確認する

## 参照

- ADR-0002: API層にtRPCを採用
- `src/server/db/schema.ts`
- `src/server/api/routers/invoices.ts`
- `src/app/api/invoices/[id]/file/route.ts`
