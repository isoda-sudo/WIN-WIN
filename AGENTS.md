# Repository Guidelines

## Project Overview
construct-pro-next: Next.js/tRPC rewrite of construct-pro, an internal business management system for 株式会社WIN WIN (project/order intake, subcontractor purchase orders, payment and receipt tracking). Reimplements an existing live Express + vanilla HTML/JS app against the same Supabase Postgres instance (Drizzle ORM, no data migration). See `/Users/hiromu.umeda/.claude/plans/mutable-gliding-metcalfe.md` for the phased migration plan. Tailwind, Shadcn/UI, and Bun-first tooling. Biome/Ultracite governs code quality, while Vitest covers tests.

## Project Structure & Module Organization
`src/app/` hosts routes and layouts, `src/components/` shared UI, `src/components/ui/` primitives, and `src/lib/`, `src/hooks/`, `src/server/`, `src/trpc/` domain logic and routers. Assets live in `public/`, docs in `docs/`. Mirror the source tree under `__tests__/`, importing internals via the `~/*` alias.

## Build, Test, and Development Commands
- `bun install`, `bun add {pkg}` – manage dependencies; avoid npm/yarn.
- `bun run dev` – start Turbo dev server.
- `bun run build` / `bun run preview` / `bun run start` – build, verify, and serve production output.
- `bun run check` (`check:write`, `check:unsafe`) – enforce Biome/Ultracite.
- `bun run typecheck` – `tsc --noEmit`.
- `bun run test`, `bun run test:watch` – Vitest suites.
- `bunx --bun shadcn@latest add {component}`, `bunx lefthook install` – maintain UI toolkit and hooks.

## Coding Style & Naming Conventions
Favor readability, explicit types, and intent-focused comments. Format with Biome before staging; two-space indentation, double quotes, trailing commas, and kebab-case filenames are standard. Export components in PascalCase, hooks/utilities in camelCase, default to server components unless browser APIs are needed, and compose Tailwind classes with `cn`.

## Testing Guidelines
Adopt t-wada TDD (Red → Green → Refactor) for new behaviors. Place unit tests alongside features in mirrored `__tests__/` paths with `.test.ts[x]` suffixes, reuse `__tests__/setup.ts`, and name tests with Given–When–Then phrasing. Note deliberate coverage gaps in PR descriptions.

## Architecture Decision Records (ADR)
Record significant design decisions (new library adoption, architectural patterns, key API/data model choices, or changes to prior decisions) in `docs/adr/` using `docs/adr/template.md`; see `docs/adr/README.md` for rules and the `manage-adr` skill for the recording workflow. Read existing ADRs before implementing to avoid contradicting past decisions, and include the ADR in the same PR as the code change.

## Commit & Pull Request Guidelines
Use Conventional Commits (`feat: add audit trail (fixes #123)`), link to issues, and keep diffs focused. Lefthook runs `bunx ultracite fix` and `bunx tsc --noEmit`; only commit passing changes. PRs need a short summary, linked issue, UI screenshots when visuals shift, and a test/lint checklist.

## Configuration & Environment Tips
Validate environment variables through `src/env.js` (`@t3-oss/env-nextjs`) whenever keys evolve, and document updates in `docs/`. Maintain design tokens in `src/styles/globals.css` alongside Shadcn/UI. If builds misbehave, clear `.next/`, rerun `bun run build`, and lean on dynamic imports plus tRPC React Query caching for performance.
