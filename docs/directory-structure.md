# Project Directory Structure

This document outlines the directory structure of the project to help AI agents and developers understand the project organization.

## Root Directory

```
/
├── __tests__/           # Test files mirroring src structure
│   ├── setup.ts         # Test setup configuration
│   └── components/      # Component tests
├── public/              # Static files served at root path
│   └── favicon.ico      # Site favicon
├── src/                 # Source code
│   ├── app/             # Next.js App Router pages
│   │   ├── _components/ # App-specific components
│   │   ├── design-system/ # Design system documentation & reference
│   │   ├── api/         # API routes
│   │   │   └── trpc/    # tRPC API endpoints
│   │   ├── layout.tsx   # Root layout component
│   │   └── page.tsx     # Home page component
│   ├── components/      # Shared React components
│   │   └── ui/          # UI components (Shadcn/UI)
│   ├── hooks/           # Shared React hooks
│   ├── lib/             # Utility functions and shared logic
│   ├── server/          # Server-side code
│   │   └── api/         # tRPC routers and procedures
│   ├── styles/          # Global styles (design tokens in globals.css)
│   ├── trpc/            # tRPC client and server setup
│   │   ├── react.tsx    # React integration for tRPC
│   │   ├── query-client.ts # React Query client configuration
│   │   └── server.ts    # tRPC server configuration
│   ├── types/           # Shared TypeScript type definitions
│   └── env.js           # Environment variables validation
├── docs/                # Project documentation
│   ├── directory-structure.md # This file
│   ├── screens/          # 画面仕様書
│   ├── investigation/    # QA監査レポート抜粋（09 既知課題と優先順位のみ）— winwin-pr-review が develop→staging 昇格PRでのみ参照
│   ├── poc-reference/    # PoC由来の参照資料（business-rules.md = 業務ルールの正）
│   └── adr/              # Architecture Decision Records
│       ├── README.md     # ADR運用ルール
│       ├── template.md   # ADR作成用テンプレート
│       └── NNNN-*.md     # 個々のADR（例: 0001-use-bun-as-package-manager.md）
├── .agents/skills/       # Agent Skillsの実体（.claude/skills/ からsymlinkでミラー）。例外: winwin-pr-review は逆向き（ADR-0006）
├── .claude/              # Claude Code設定（skills/ は .agents/skills/ へのsymlink、agents/, settings.json 等）
│   └── skills/winwin-pr-review/ # CI PRレビューSkillの実体（claude-code-action がベースブランチから復元する信頼パス、ADR-0006）
├── .github/              # GitHub設定（Issue/PRテンプレート、Dependabot、Actions）
├── .next/               # Next.js build output (generated)
├── node_modules/        # Dependencies (generated)
├── package.json         # Project metadata and dependencies
├── bun.lock             # Bun package lock file
├── skills-lock.json      # 外部由来スキルの取得元・ハッシュを記録するロックファイル
├── tsconfig.json        # TypeScript configuration
├── vitest.config.ts     # Vitest configuration for testing
├── next.config.js       # Next.js configuration
├── biome.jsonc           # Biome configuration
├── components.json      # shadcn/ui components configuration
├── lefthook.yml          # Git hooks configuration (pre-commit: format & typecheck)
├── AGENTS.md             # AIエージェント向けリポジトリガイド
├── CLAUDE.md              # Claude Code設定・プロジェクト指示
├── CLAUDE.template.md     # CLAUDE.md 改訂案（QA#11、採用待ち）— Hard Rules #1–#12 の原本
├── PULL_REQUEST_TEMPLATE.proposal.md # PRテンプレート改訂案（Study/Test/Review の証跡欄、採用待ち）
└── README.md             # Project overview and setup instructions
```

## Key Files

- **package.json**: Defines project dependencies and scripts
- **tsconfig.json**: TypeScript compiler configuration
- **next.config.js**: Next.js framework configuration
- **biome.jsonc**: Biome linter and formatter configuration
- **components.json**: Configuration for shadcn/ui components
- **lefthook.yml**: Git hooks configuration (format & typecheck on pre-commit)
- **skills-lock.json**: Lock file recording the source and hash of externally-sourced Agent Skills
- **AGENTS.md**: Repository guide for AI agents (project overview, structure, commands, ADR運用の要点)
- **src/env.js**: Environment variable validation using Zod
- **src/trpc/server.ts**: tRPC server-side setup
- **src/trpc/react.tsx**: tRPC client-side React hooks setup

## Development Structure

- **src/app/**: Contains page components using Next.js App Router
- **src/app/design-system/**: Design system reference that all UI implementations must follow
- **src/components/**: Reusable components that can be used across pages
- **src/hooks/**: Shared React hooks
- **src/lib/**: Utility functions and shared logic
- **src/server/**: Server-side functionality and API implementations
- **src/types/**: Shared TypeScript type definitions
- **__tests__/**: Test files organized to mirror the src directory structure

## API Structure

- **src/app/api/**: Next.js API routes
- **src/app/api/trpc/**: tRPC API endpoints
- **src/trpc/**: tRPC client and server configuration
- **src/server/api/**: tRPC routers and procedures (registered in `src/server/api/root.ts`)
- **src/server/auth/**: Session JWT, login response, rate limit; **src/server/auth/mfa/** holds 2FA (TOTP, recovery codes, encrypted secrets, DB access) — ADR-0016
- **src/app/api/auth/mfa/**: Second login step (`verify`, `enroll`, `enroll/confirm`), reachable only with the `mfa_pending` cookie
- **docs/mfa/**: 2FA rollout checklist for the production owner (`UMEDA-CHECK.md`)
- **src/server/edit-lock/**: Edit-lock guard used by the tRPC middleware (`enforceEditLock` in `src/server/api/trpc.ts`) — ADR-0017
- **src/lib/** (edit lock): `use-edit-lock.tsx` (hook + banner), `edit-scope.ts` (scope/client id headers), `edit-lock-expiry.ts` (15-minute rule), `use-disable-editing.ts` (read-only dialogs)
- **src/lib/** (notifications): `notification-rules.ts` (rules), `use-focus-deep-link.ts` (deep link from a notification), `order-cost.ts` (cost incl. transfer fee) — ADR-0018 / ADR-0019
- **src/app/api/cron/**: Scheduled jobs called by Vercel Cron, configured in `vercel.json` — `reset-notifications` (daily 10:00 JST) and `archive-old-files` (15th of each month, 23:00 JST; `?dry=1` reports the saving without writing)
- **src/server/archive/**, **src/lib/archive.ts**: Monthly archive of project files older than 5 years (image recompression with `pdf-lib` + `sharp`, one ZIP per project in `file_archives`) — ADR-0021
- **src/app/api/archives/[id]/**: Admin-only download of an archive ZIP
- **docs/operations/**: Operating notes (`operations-overview.md`: hosting, cron, mail, file storage, logs, DB connections; `bank-master-update.md`)
- **src/app/api/client-error/**: Receives unexpected client-side errors and writes them to the server log
- **src/components/shell/**: App shell (header with notification bell / security / theme toggle / logout, sidebar, idle logout)
- **src/components/shared/**: Shared form parts (bank select / bank combobox / branch select, edit-lock banner users, upload dialogs)
- **scripts/sql/**: Idempotent, additive SQL applied by hand to the production DB (one file per change)
- **scripts/reset-demo-data.ts**: One-off script that replaces test data with realistic demo data (dry run by default; `--commit` to apply)

## Agent Skills & Documentation

- **.agents/skills/**: Agent Skillsの実体（`analyze-codebase`、`brainstorming`、`create-github-issue`、`create-github-pr`、`review-github-pr`、`winwin-pr-review`（CI用PRレビュー。実体は `.claude/skills/` 側、ADR-0006）、`commit-changes`、`test-driven-development`、`systematic-debugging`、`manage-adr`、`project-kickoff` など）。`.claude/skills/` はここへのsymlinkでミラーされている
- **docs/adr/**: Architecture Decision Records。`README.md` に運用ルール、`template.md` に作成用テンプレート、`0001`〜 の各ファイルが個別の決定記録。詳細は `manage-adr` skillを参照 