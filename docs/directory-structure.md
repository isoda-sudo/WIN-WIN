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
│   └── adr/              # Architecture Decision Records
│       ├── README.md     # ADR運用ルール
│       ├── template.md   # ADR作成用テンプレート
│       └── NNNN-*.md     # 個々のADR（例: 0001-use-bun-as-package-manager.md）
├── .agents/skills/       # Agent Skillsの実体（.claude/skills/ からsymlinkでミラー）
├── .claude/              # Claude Code設定（skills/ は .agents/skills/ へのsymlink、agents/, settings.json 等）
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

## Agent Skills & Documentation

- **.agents/skills/**: Agent Skillsの実体（`analyze-codebase`、`brainstorming`、`create-github-issue`、`create-github-pr`、`review-github-pr`、`commit-changes`、`test-driven-development`、`systematic-debugging`、`manage-adr`、`project-kickoff` など）。`.claude/skills/` はここへのsymlinkでミラーされている
- **docs/adr/**: Architecture Decision Records。`README.md` に運用ルール、`template.md` に作成用テンプレート、`0001`〜 の各ファイルが個別の決定記録。詳細は `manage-adr` skillを参照 