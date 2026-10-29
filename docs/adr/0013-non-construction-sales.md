# ADR-0013: 売上管理表の工事外売上（定期売上・収入区分・売上ID）

## メタ情報

- **ステータス**: 提案中(Proposed)
- **日付**: 2026-10-13
- **決定者**: Claude Code (承認: レビュアー・保守担当。収入区分の初期名称は仮で、顧客確認待ち)

## コンテキスト（背景と課題）

クライアントから、売上管理表に「工事外売上」（不動産賃貸収入・備品売上など）を追加し、支払い予定表の工事外（ADR-0007）と同様に、定期売上の登録と区分ごとのブロック表示に対応してほしいという要望があった。

- 案件（projects）に紐付かない入金予定・実績を管理したい。賃貸収入のように毎月・毎年発生するものは定義から展開したい。
- 区分は自由入力ではなくマスタ化し、区分ごとのブロックで件数・小計を見たい。
- 支払IDと同様に、売上にも番号（売上ID）を付けて保存義務と番号の再利用防止を満たしたい。
- 以前の方針（ADR-0007 追記「売上管理表への改称と案件外タブの廃止」）では案件外入金テーブル `misc_receipts` を廃止する予定で、破壊的SQL `scripts/sql/2026-10-misc-receipts-removal.sql` を用意していた。本ADRはその方針を取り消し、`misc_receipts` を残して拡張する。

共有DB（本番）のスキーマ変更を伴うため、Hard Rule 1 に従い本ADRで記録する。

## 検討した選択肢

### 選択肢A: 支払い側（ADR-0007）の構成をそのまま売上へ写す

- 長所:
  - 既存の仕組み（定義→月次展開→未入金行の先行作成、楽観ロック、スキップ）を踏襲でき、レビュー・運用の負担が小さい
  - `misc_receipts` を残すため既存データを失わない
- 短所:
  - 支払い側と似たコードが増える（共通の純粋ロジックは `recurring-payments.ts` を再利用して重複を抑える）

### 選択肢B: 支払い側と共通のテーブル・ルーターに種別列を足して売上も扱う

- 長所:
  - コードの重複が少ない
- 短所:
  - 既存の支払テーブル・画面・権限・履歴に手を入れる必要があり、影響範囲が広い。入金と支払で状態語彙（未入金/入金済・未払い/支払済み）が異なる

### 選択肢C: 案件外入金の廃止方針を維持し、工事外売上は別機能として扱う

- 長所:
  - 破壊的SQLの方針を変えずに済む
- 短所:
  - 要望（賃貸収入・備品売上）を満たせない

## 決定内容

選択肢Aを採用する。`misc_receipts` は廃止せず拡張し、収入区分マスタと定期売上を新設する。スキーマ変更は以下のとおり（SQL: `scripts/sql/2026-10-non-construction-sales.sql`。追加のみ・冪等・単一トランザクション）。

| 対象 | 変更 |
| --- | --- |
| `misc_receipts` | `name`（名称）, `recurring_id`, `period`(YYYY-MM), `receipt_no`（売上ID）を追加。`(recurring_id, period)`（recurring_id が非nullの行）と `receipt_no`（非nullの行）に部分ユニークインデックス。既存列は変更しない。テーブルが無い環境では先頭で作成する |
| `receipt_categories` | 新設（`id`, `name` 一意・必須, `order`, `note`, `deleted_at`, `created_at`, `updated_at`）。論理削除のみ |
| `recurring_receipts` | 新設（`name`, `category_name`, `payer`, `amount` >= 0, `frequency` monthly/yearly, `due_day` 1-31, `due_day_is_month_end`, `month_of_year` 1-12, `start_month`, `end_month`, `notes`, `version`, `deleted_at` ほか）。CHECK制約あり。支払い側から振込手数料・支払方法・支店を除く |
| `recurring_receipt_skips` | 新設（`recurring_id`, `period` に一意）。「当月入金なし」 |

その他の決定:

- **売上ID**: `WS{期2桁}-{月2桁}-{NNN}`（例 `WS07-10-001`）。接頭辞 `WS` で支払ID（`WW...`）と区別する。期は入金予定日の月が属する会計期（3月決算、`fiscal-period.ts`）、月は入金予定日の月。連番は同じ接頭辞の最大値+1で、作成トランザクション内で `pg_advisory_xact_lock`（接頭辞キー）を取って採番する。一度付けた番号は編集で振り直さない（凍結）。純粋ロジックは `src/lib/recurring-receipts.ts`、DBを使う採番は `src/server/receipts/misc-receipt.ts`。
- **ステータス**: 工事外売上は 未入金 / 入金済 の2値（`normalizeReceiptStatus`）。定期売上の「予定」は具体化前の表示上の状態でDBには保存しない。定期売上の行は「当月入金なし」も選べる（入金済の月は不可。未入金のプレースホルダ行は削除してスキップを記録する）。
- **削除の制限**: 売上IDまたは定期売上由来（`recurring_id`）の行は、保存と番号の再利用防止のため削除できない（支払い側と同じ）。定期売上の定義は論理削除で、当月以降の未入金行は削除し入金済の行は残す。
- **定期売上の具体化**: 選択月を開いた時点で `recurringReceipts.ensureMonth` が未入金行を先に作り売上IDを付与する（冪等、月ロック→行ロック→売上IDの順）。入金済みにする操作は `markReceived`、戻す操作は `markUnreceived`、当月入金なしは `skipMonth` / `unskipMonth`。
- **tRPC**: `receipts.misc`（list/create/update/delete）、`receiptCategories`（list は admin/accounting、create/update/delete/reorder は admin）、`recurringReceipts`（list/create/update/delete、monthView、ensureMonth、markReceived/markUnreceived/skipMonth/unskipMonth）。変更系は `accountingOrAdminProcedure`（区分マスタの変更は `adminProcedure`）で、すべて `logAudit` を残す（テーブル名 `misc_receipts` / `recurring_receipts` / `receipt_categories`）。履歴の閲覧権限は `history-access.ts` に追加（前二者は admin/accounting、区分マスタは admin）。
- **画面**: 売上管理表を「工事売上」（既存の案件別表、変更なし）と「工事外売上」のタブにする。工事外売上は支払い側の工事外タブと同じ構成で、選択月の入金予定日を持つ行のみを月厳密で表示し（日付未設定は「日付未設定も表示」で追加）、区分マスタ順のブロック（区分名・件数・小計）で並べる。収入区分マスタは新規ページ `/receipt-categories`（admin/accounting が閲覧、admin が編集・ドラッグで並べ替え。並びが画面のブロック順になる）。
- **旧SQLの廃止**: `scripts/sql/2026-10-misc-receipts-removal.sql` は実行不可にした（本体を例外送出に置き換え、ヘッダに廃止を明記）。

## 決定の理由

要望は支払い側の工事外と対称であり、ADR-0007 で確立した設計（定義＋月次展開、先行具体化、楽観ロック、論理削除、番号採番のロック）をそのまま使えば、仕様と運用が揃い、レビュー負担とリスクが最小になる。共通の純粋ロジック（月次展開・スキップ・連番）は再利用し、DBを触る部分だけを売上用に分ける。`misc_receipts` は物理的に残っているため、削除せず拡張すれば既存データを失わず、追加のみのSQLで安全に適用できる。

## 影響

### ポジティブ

- 賃貸収入・備品売上などを区分ごとに予定・実績管理でき、定期売上は月ごとに自動で展開される
- 売上IDで保存義務と番号の再利用防止を満たす
- 追加のみ・冪等のSQLで、適用後に旧版アプリも動く

### ネガティブ

- 支払い側と類似のコードが増える（保守対象が増える）
- 売上IDの形式（WS）は支払ID（WW）と見た目が近い。取り違えに注意が必要

### フォローアップタスク

- [ ] デプロイ前に `scripts/sql/2026-10-non-construction-sales.sql` を保守担当が適用する（適用後に `scripts/inspect-db-schema.ts` で差分確認）
- [ ] `scripts/seed-receipt-categories.ts` で収入区分の初期値（賃貸収入・備品売上・雑収入・利息収入。仮）を投入し、顧客と名称を確認する
- [ ] サイドバーに「収入区分」（`/receipt-categories`、admin/accounting）のリンクを追加する
- [ ] `docs/adr/README.md` の索引に本ADRを追加する
- [ ] ADR-0007 の「売上管理表への改称と案件外タブの廃止」の記述（案件外入金の廃止）を、本ADRで置換された旨に更新する

## 参照

- ADR-0007: 支払管理の定期支払い・カテゴリマスタ・支払No
- `scripts/sql/2026-10-non-construction-sales.sql`（適用SQL）
- `scripts/sql/2026-10-misc-receipts-removal.sql`（廃止）
