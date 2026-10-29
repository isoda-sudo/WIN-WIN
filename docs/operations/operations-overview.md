# 運用の概要（ホスティング・定期実行・メール・ファイル・ログ・DB接続）

最終更新: 2026-10-28。実装を一次情報とし、食い違いを見つけたら実装を確認して本書を直す。

## ホスティングと構成
- アプリ: Next.js 16（App Router、Turbopack）。Vercel（Hobby、東京リージョン `hnd1`）に手動デプロイ（`bunx vercel@latest --prod`）。
- DB: Supabase（PostgreSQL）。アプリは、接続プールのトランザクション接続（ポート6543）で接続する（`prepare: false`）。
- 依存の更新: Next.js は 16.4.3（2026-10-28。image optimization / `use cache` / `next/og` の脆弱性対応）。

## 定期実行（Vercel Cron）
`vercel.json` の `crons` に登録する。Vercel専用の設定で、他のホスティングでは動かない（その場合は、同じURLを外部のスケジューラーから呼ぶ）。

| 内容 | URL | 時刻（日本時間） |
|---|---|---|
| 通知の「開封済み」を戻す | `/api/cron/reset-notifications` | 毎日10:00 |
| 5年を過ぎた書類のアーカイブ | `/api/cron/archive-old-files` | 毎月15日23:00（`?dry=1` で試行） |

- 認証: `CRON_SECRET` を設定すると、`Authorization: Bearer` が必須になる。未設定の間は、`vercel-cron` のUser-Agentだけで受ける（弱いので、設定を推奨）。環境変数の変更は、利用者が行う。
- Hobbyは、時刻に最大1時間の幅があり、1日1回までしか使えない。アーカイブは、1回45秒で打ち切り、残りは翌月に持ち越す。

## メール
- `nodemailer` でSMTP送信（`src/server/email/transporter.ts`）。設定は環境変数 `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM`。
- 現状はテスト用のGmail（アプリパスワード）。Gmailは、1日の送信上限（約500通）と、差出人が自社ドメインにならない点に注意。
- 取引先へ実際に送る前に、独自ドメインを取得し、SPF・DKIM・DMARCを設定して、送信専用のSMTPサービス（Resend・Amazon SES・SendGridなど）へ、環境変数だけを差し替えて移す。コードの変更は不要。

## ファイルの保管と容量
- アップロードした書類は、DBに保存する（`order_files` / `project_files` / `estimate_files` / `project_documents` は `data_url`（base64）、`invoice_files` は `pdf`（バイナリ）と `data_url`）。1ファイル3MBまで。一覧の取得では、本体の列を読み込まない。
- 容量の目安: 文字のPDFで年に数百MB、スキャンPDFが中心なら年に1〜2GB近く。Supabaseの無料枠は500MB、Proは8GB。
- 対策: 引渡月から5年を過ぎた案件の書類は、月次バッチで、画像を再圧縮したZIPにまとめる（ADR-0021）。さらに減らすには、オブジェクトストレージへの移行が必要。
- 保存期間: 取引書類は、税務上、原則7年の保存が必要（赤字の繰越がある場合は10年）。アーカイブの年数（`ARCHIVE_AFTER_YEARS`、現在5年）は、税理士に確認して決める。

## ログ
- **操作ログ**: DBの `audit_logs`。作成・更新・削除を記録する（画面は「履歴詳細」）。自動削除なし。
- **サーバーのログ**: Vercelの Runtime Logs（リクエスト、`console.error`、例外、cronの実行）。保管期間は、Hobbyが1時間、Proが1日、Observability Plus（追加機能）が30日。2026-10-28に、Observability Plus を利用する方針とした（有効化は、利用者がVercelの画面で行う）。外部への転送（Log Drain）は、設定していない。
- アプリが `console.error` を出すのは、メール送信の失敗、操作ログの記録の失敗、PDFのフォント・社印の読み込みの失敗、ブラウザ側の予期しないエラー（`/api/client-error`）。cronの処理件数は、ログに出していない。
- ログイン・認証の記録や、書類の閲覧の記録は、残していない。

## DBの運用（手作業のSQL・録画用の複製）
- スキーマ変更は、`scripts/sql/` の、加算のみ・冪等なSQLを、手で本番に適用する。
- **psqlで本番に接続するときは、セッション接続（ポート5432）を使う。** 6543のトランザクション接続で `SET search_path` などを実行すると、設定が、他の接続（本番アプリを含む）に残る。2026-10-28に、録画用の複製（`demo` スキーマ）の操作で、これが起きた。直接の設定の切り替えは、避けること。
- 動画の録画は、本番のDBの `demo` スキーマ（複製）と、ローカルのメール受け口で行う。本番データ（`public`）と、実際のメールには、触れない。
