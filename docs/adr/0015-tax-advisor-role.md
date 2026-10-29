# ADR-0015: 閲覧専用ロール「税理士・社労士」(tax_advisor) を新設

## メタ情報

- **ステータス**: 提案中(Proposed)
- **日付**: 2026-10-13
- **決定者**: Claude Code（承認: 人間レビュアー）

## コンテキスト（背景と課題）

顧客から、税理士・社労士向けの閲覧専用アカウントの要望があった。閲覧できるのは受注一覧、工事計画、売上管理表、支払い予定表、レポーティングのみで、マスタ設定（顧客・発注先・工種・支払い種別・収入区分・自社口座・手数料）と顧客の個人情報は閲覧不可。編集は一切できない。

既存の閲覧専用ロール viewer（一般社員・閲覧のみ）は顧客・発注先・工種マスタを閲覧できる現行仕様のため、そのままでは要件を満たさない。business-rules.md の D-26 は、閲覧専用/税理士ロールを発注先口座の非マスク例外に含めないことを定めている。users.role は text 列でありスキーマ変更は不要。

## 検討した選択肢

### 選択肢A: 既存の viewer を税理士向けに制限する

- 長所: ロールが増えない
- 短所: 現行の viewer 利用者（マスタ閲覧可）の権限が下がり、既存運用が壊れる

### 選択肢B: 新ロール tax_advisor を追加し、権限表を1か所に集約する

- 長所: viewer は現状維持。権限表（src/lib/roles.ts）を唯一の定義元にして、procedure・layout・サイドバー・UIを同じ表から導出できる
- 短所: ロール値が1つ増え、各所の許可リストの見直しが必要

## 決定内容

ロール値 `tax_advisor`（表示名「税理士・社労士」）を追加する。権限表は `src/lib/roles.ts`（`ROLES` / `ROLE_LABELS` / `PAGE_ROLES` / `canReadMaster` / `canWrite` / `canViewHistory` / `canSeeUnmaskedBank` / `pageAccess` / `isReadOnlyRole`）に集約する。

| ロール | 表示名 | 書き込み | マスタ閲覧 | 履歴 | 口座番号（非マスク） |
| --- | --- | --- | --- | --- | --- |
| admin | 管理者 | 可 | 可 | 可 | 可 |
| accounting | 経理 | 可 | 可 | 可 | 可 |
| staff | 一般社員 | 可 | 可 | 可 | 不可 |
| viewer | 閲覧のみ | 不可 | 可（現状維持） | 不可 | 不可 |
| tax_advisor | 税理士・社労士 | 不可 | 不可 | 不可 | 不可 |

tax_advisor の画面アクセスは、受注一覧、工事計画、売上管理表、支払い予定表、レポーティング（顧客別分析・発注先別分析を含む）のみ。

## 決定の理由

- 書き込み遮断: `notViewerProcedure` は `READ_ONLY_ROLES`（viewer, tax_advisor）を弾く。全 mutation（72件）は notViewer / admin / accountingOrAdmin のいずれかで、tax_advisor は全て FORBIDDEN となる。
- 読み取り: `reportingProcedure` に tax_advisor を追加。売上・支払の読み取り専用 procedure として `financialReadProcedure`（admin, accounting, tax_advisor）を新設し、書き込み用の `accountingOrAdminProcedure` と分離した。`masterReadableProcedure` は tax_advisor を含めない。
- 顧客個人情報: 案件一覧の顧客電話・メール・住所は `redactClientPersonalInfo`（src/server/projects/redact.ts）で tax_advisor にだけ null を返す。
- 口座・帳票: vendors.getById と全銀CSV（POST /api/export/transfer-csv）は admin/accounting のみ。見積書・請求書・注文書の生成/取得 Route Handler は、顧客情報の露出と書き込みを伴う処理があるため tax_advisor を 403 とする。
- 履歴: HISTORY_ACCESS_ROLES に含めない。
- UI: `isReadOnlyRole` で編集ボタン・インライン編集・行追加・ステータス変更・メール送信・全銀CSV出力を出さない。マスタ系 query は tax_advisor では呼ばない。

## 影響

### ポジティブ

- viewer の既存権限を変えずに、要件の権限を満たす専用ロールを提供できる
- 権限表が1か所のため、RBACマトリクステストで全ロール x 画面を機械的に検証できる

### ネガティブ

- 許可リストの変更はテストと権限表の同時更新が必要
- tax_advisor 向けに、マスタに頼る UI（工種フィルタ等）は行データからの代替表示になる

### フォローアップタスク

- [ ] アカウント発行: DBには行を作らない。管理者が「アカウント発行」画面から権限「税理士・社労士」で招待を発行する
- [ ] 運用開始前に、本番で tax_advisor アカウントを発行して全画面の表示を実機確認する
- [ ] docs/adr/README.md の索引に本ADRを追加する

## 参照

- docs/poc-reference/business-rules.md（D-26 口座マスク、履歴の閲覧範囲）
- src/lib/roles.ts、src/server/api/trpc.ts、src/server/projects/redact.ts
