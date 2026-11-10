# 顧客先への導入手順（コピペ用）

Vercel Pro ＋ Supabase ＋ Git（本番・検証・開発の3環境）。各ブロックは、上から順に、そのまま貼り付けて実行できます。`< >` の部分だけ、自分の値に置き換えてください。

> 秘密の値（パスワード・鍵）は、**別のターミナルで作って、Vercel / パスワード管理ツールにだけ貼る**。チャットやメールには貼らない。

---

## 0. 事前に（コードの差し替え）

顧客が WIN WIN 以外の場合、次を顧客の情報に差し替えてから、デプロイする。

| 差し替える箇所 | ファイル |
|---|---|
| 会社名・住所・銀行口座・電話・代表者名・全銀CSVの会社コード | `src/server/pdf/company.ts` |
| 適格請求書発行事業者の登録番号 | `src/server/api/routers/invoices.ts`（`REGISTRATION_NO`） |
| 社印 | `assets/company-seal.png` |
| メールの件名・差出人名 | `src/lib/mail-templates.ts` |
| 案件IDの接頭辞（`WW`） | 採番の定数 |

---

## 1. アカウント作成（手作業・本人が実施）

1. GitHub: 組織とリポジトリを作成
2. Vercel: Pro プランでチームを作成し、GitHub のログイン接続を追加
3. Supabase: 組織を作成（プロジェクトは次の「2」で作る）

---

## 2. Supabase（環境ごとに3プロジェクト: prod / staging / dev）

各プロジェクト: リージョンは東京（ap-northeast-1）、DBパスワードはランダム生成して保管。

### 2-1. 接続文字列を変数に入れる（環境ごとに実行）

```bash
export SOURCE_DB_URL='<今の本番DBのセッション接続（ポート5432）>'
```

```bash
export NEW_DB_URL='<新しいDBのセッション接続（ポート5432）>'
```

### 2-2. スキーマ（構造だけ）を取り出して適用

```bash
pg_dump "$SOURCE_DB_URL" --schema-only --schema=public --no-owner --no-privileges -f /tmp/schema.sql
```

```bash
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f /tmp/schema.sql
```

### 2-3. 初期データ（マスタ）を投入

```bash
cd construct-pro-next && export DATABASE_URL="$NEW_DB_URL" SKIP_ENV_VALIDATION=1
```

```bash
bun scripts/seed-construction-categories.ts && bun scripts/seed-payment-categories.ts && bun scripts/seed-receipt-categories.ts
```

```bash
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/2026-10-banks-master.sql
```

### 2-4. 最初の管理者を作る

パスワードのハッシュを作る（入力は画面に出ない）:

```bash
read -s -p "管理者のパスワード: " PW; echo; bun -e 'console.log(await Bun.password.hash(process.argv[1], { algorithm: "bcrypt", cost: 10 }))' "$PW"
```

出力されたハッシュで、管理者を登録（`<ハッシュ>` と メールを置き換える）:

```bash
psql "$NEW_DB_URL" -c "insert into users (email, password_hash, name, role, status) values ('<admin@customer.co.jp>', '<ハッシュ>', '管理者', 'admin', 'active');"
```

---

## 3. Git（3ブランチ）

```bash
git checkout -b dev && git push -u origin dev
```

```bash
git checkout main && git checkout -b staging && git push -u origin staging
```

GitHub → Settings → Branches で保護:

| ブランチ | 設定 |
|---|---|
| `main`（本番） | 直接プッシュ禁止／PR必須／CI成功が必須 |
| `staging`（検証） | PR必須／CI成功が必須 |
| `dev`（開発） | 制限なし |

流れ: `dev` → `staging` → `main`

---

## 4. Vercel（Pro）

### 4-1. プロジェクトの作成

Vercel → Add New → Project → GitHub のリポジトリを選択。Production Branch は `main`。

### 4-2. ドメイン

Settings → Domains に追加:

| 環境 | ドメイン例 | 紐づけるブランチ |
|---|---|---|
| 本番 | `app.customer.co.jp` | `main` |
| 検証 | `staging.customer.co.jp` | `staging` |
| 開発 | `dev.customer.co.jp` | `dev` |

### 4-3. 秘密の値を作る（別のターミナルで。環境ごとに別の値）

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)"
```

```bash
echo "CRON_SECRET=$(openssl rand -hex 32)"
```

```bash
echo "MFA_ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

```bash
echo "BASIC_AUTH_PASSWORD=$(openssl rand -base64 18)"
```

### 4-4. 環境変数（Settings → Environment Variables）

Production と、Preview（`staging` / `dev` それぞれ）に、**別の値**で登録する。

```text
DATABASE_URL=<その環境のSupabase接続（トランザクションプーラー、ポート6543）>
JWT_SECRET=<4-3 の値>
BASIC_AUTH_USER=<ユーザー名>
BASIC_AUTH_PASSWORD=<4-3 の値>
CRON_SECRET=<4-3 の値>
MFA_ENCRYPTION_KEY=<4-3 の値>
MFA_REQUIRED_ROLES=admin,accounting
SMTP_HOST=<SMTPサーバー>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<SMTPユーザー>
SMTP_PASS=<SMTPパスワード>
MAIL_FROM=物件管理システム <noreply@customer.co.jp>
```

- `BASIC_AUTH_*` と `CRON_SECRET` は**必須**。未設定だと、本番は全リクエストを拒否する。
- cron は `vercel.json` に2件（毎朝の通知リセット／毎月のアーカイブ）。`CRON_SECRET` を設定すると Vercel が自動で認証を付ける。

### 4-5. ログを30日にする

Vercel → チームの Settings → **Observability Plus**（Pro の追加オプション）を有効にする（保管期間・費用は契約画面で確認）。
外部に保管するなら、Settings → Log Drains で転送先を設定。Supabase のログは Pro で7日。

---

## 5. デプロイ

Git 連携後は、`main` へのマージで本番に自動デプロイ。初回だけ手動で行う場合:

```bash
bunx vercel --prod --scope <チーム名>
```

---

## 6. 本番のアカウント発行

1. 管理者でログイン → 「アカウント発行」画面で、経理・一般社員・閲覧のみ・税理士を**招待メール**で発行（本人がパスワードを設定）
2. 管理者・経理は「セキュリティ設定」で2段階認証を登録
3. 「アカウント発行」画面で、メール署名とCC初期値（チェックボックス）を設定

---

## 7. 動作確認（本番）

- [ ] Basic認証 → ログイン → 2段階認証
- [ ] 案件を1件登録 → 請求書・注文書のPDF（会社情報・社印・登録番号が顧客のもの）
- [ ] テストメールを1通送る（宛先・CC・署名・添付）
- [ ] 支払い予定表・売上管理表・レポートの表示
- [ ] 翌朝: `/api/cron/...` が 200（Vercel の Logs で確認）
- [ ] 本番の `JWT_SECRET` / `BASIC_AUTH_PASSWORD` / `CRON_SECRET` が、検証・開発と別の値

動作確認のコマンド（Basic認証なしは 401、cron の Bearer なしは 403 になること）:

```bash
curl -s -o /dev/null -w "noauth %{http_code}\n" https://<本番ドメイン>/login
```

```bash
curl -s -o /dev/null -w "cron %{http_code}\n" https://<本番ドメイン>/api/cron/reset-notifications
```

---

## 8. 引き継ぎ・運用

- 管理者に、パスワード管理と2段階認証のリカバリーコードの保管を案内する
- バックアップの復元（Supabase のダッシュボード）を、顧客と一緒に1回試す
- 保存期間（請求書の台帳は10年、5年経過分の書類は圧縮）は `docs/adr/0021`・`0022` を参照
