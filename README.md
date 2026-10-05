# construct-pro-next

株式会社WIN WIN様 社内業務管理システムの Next.js/tRPC 全面書き換え版。

## What is this?

現行の construct-pro（Express + 素のHTML/JS + PostgreSQL、`~/construct-pro` で本番稼働中）を、Next.js(TypeScript) + tRPC + Drizzle + shadcn/ui のスタックに書き換えたもの。同一のSupabase Postgresインスタンスに接続し、データ移行は行わない。

案件（受注）管理 → 工事計画（発注）管理 → 支払管理 → 売上・入金管理 → 帳票発行（見積書・発注書・請求書・注文請書）→ 履歴監査 → アカウント発行、までの建設業務フローを扱う。

## Tech Stack

- **[Next.js](https://nextjs.org)** - App Router、SSR/SSG
- **TypeScript**
- **[Tailwind CSS](https://tailwindcss.com)**
- **[tRPC](https://trpc.io)** + **[Zod](https://zod.dev)** - End-to-End型安全なAPI通信
- **Drizzle ORM** - `postgres`（postgres.js）ドライバ、PostgreSQL(Supabase)
- **[Shadcn/UI](https://ui.shadcn.com)**
- **pdfkit** - 見積書・発注書・請求書のPDF生成
- **nodemailer** - メール送信（発注書/請求書/見積書の送付フロー）
- **[Ultracite](https://biomejs.dev/ja/)**（Biomeベース） - Linter/Formatter
- **[Vitest](https://vitest.dev)** - ユニットテスト

## ディレクトリ構造

```
construct-pro-next/
├── __tests__/            # ユニットテストファイル
├── docs/                 # プロジェクト文書（ADR、画面仕様等）
├── public/               # 静的ファイル
├── src/
│   ├── app/              # Next.js App Router（画面・APIルート）
│   ├── components/       # 再利用可能なUIコンポーネント
│   ├── lib/              # ユーティリティ関数
│   ├── server/           # サーバーサイドロジック（tRPCルーター、DB、PDF）
│   ├── styles/           # グローバルスタイル
│   └── trpc/             # tRPC設定
└── ...                   # 各種設定ファイル
```

詳細は [docs/directory-structure.md](docs/directory-structure.md) を参照。

## セットアップ

```bash
bun install
```

`.env.example` を `.env` にコピーし、`DATABASE_URL` 等を設定した上で:

```bash
bun run dev
```

## 開発コマンド

```bash
bun run dev          # 開発サーバー
bun run build        # 本番ビルド
bun run start         # 本番サーバー起動

bun run test          # ユニットテスト（Vitest）

bun run check         # Biomeによるチェック
bun run check:write   # 自動修正
bun run typecheck     # TypeScript型チェック
```

### Git Hooks（Lefthook）

`bun install` 時に自動セットアップ。コミット前にフォーマットと型チェックが実行される。

## 主要設定ファイル

| ファイル | 用途 |
|---------|------|
| `tsconfig.json` | TypeScript設定（strict mode、パスエイリアス） |
| `biome.jsonc` | Linter/Formatter設定 |
| `lefthook.yml` | Git hooks設定 |
| `next.config.js` | Next.js設定 |
| `drizzle.config.ts` | Drizzle ORM設定 |
| `vitest.config.ts` | ユニットテスト設定 |

## デプロイ

Vercelにデプロイする場合、`.github/workflows/ci_cd.yml` の `deploy_preview`/`deploy_production` ジョブのコメントアウトを解除し、GitHub Secretsに `VERCEL_PROJECT_ID` / `VERCEL_ORG_ID` / `VERCEL_TOKEN` を設定する。
