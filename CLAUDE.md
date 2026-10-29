# Claude Code Configuration

## Project Overview

construct-pro-next is the Next.js/tRPC rewrite of construct-pro, the internal business management system built for 株式会社WIN WIN (a construction company). It replaces order/project intake, subcontractor purchase orders, payment tracking, and receipt reconciliation that used to run across six disconnected Excel files.

This project is a from-scratch reimplementation of an existing, currently-live Express + vanilla HTML/JS system (`~/construct-pro`), targeting functional parity plus two deliberate improvements: httpOnly-cookie session storage (replacing localStorage JWT) and a working email-send flow for purchase orders/invoices (the old system's send buttons were disabled stubs). The original migration plan lived outside this repository; decisions taken since then are recorded in `docs/adr/`. Three decisions are still deliberately unresolved and need the client's input: file storage location, notification read-state scope, history-screen RBAC granularity.

Same Supabase Postgres instance and schema as the old app (no data migration) — see `src/server/db/schema.ts` once authored, cross-checked against `~/construct-pro/supabase/schema.sql` and `server.js`'s `ensureAux()` block (the real live schema, since it drifts from the seed file).

## 🚫 Hard rules (violations block merge)

Each rule names what enforces it today. "convention" = only this file and the reviewer — those are the rules most likely to be silently skipped, so the reviewer checks them explicitly. Tests named in the "Enforced by" column are the target enforcement; where they do not exist yet, the reviewer checks the rule. The CI reviewer (`.claude/skills/winwin-pr-review`) cites these rules as `Hard Rule N`.

| # | Rule | Enforced by |
| --- | --- | --- |
| 1 | **Database safety**: never run `drizzle-kit push/migrate`, DDL, `TRUNCATE/DROP`, or any seed/reset script against `DATABASE_URL`. Schema changes require a team decision + ADR + the migration process first. | convention (+ `drizzle.config.ts` comment) |
| 2 | **Auth on every endpoint**: every new tRPC procedure / route handler is `protectedProcedure` at minimum; every **destructive or money-touching** operation makes an explicit role decision (`adminProcedure` / `accountingOrAdminProcedure`). "protected" alone is not an authorization decision. Name the chosen role in the PR. | convention + role-matrix test |
| 3 | **Audit**: every create/update/delete calls `logAudit` with meaningful details (never `{}`). Outbound email sends are always audited. | convention |
| 4 | **Money math**: integers only. `Math.floor(x * 0.1)`-style float math is banned (¥1 drift). The tax rate lives in one shared module; never re-declare `0.1` / `"10%"` locally. | unit tests on the shared module + reviewer grep for `0.1` |
| 5 | **帳票 compliance freeze**: 登録番号, 税率, 請求書番号の体系, 日付, 振込先 on 請求書/見積書/注文書 PDFs must not change without human review (適格請求書の記載要件). | human approval required |
| 6 | **No new hardcoded company data**: company name/address/bank/登録番号 come from `src/server/pdf/company.ts` only (until the settings table exists). Never persist placeholder values into DB rows. | convention |
| 7 | **Soft-delete discipline**: every by-id read of `projects`/`vendors`/`customers` filters `deletedAt`. A deleted record must never generate documents or emails. | edge-case test |
| 8 | **Concurrency**: mutations to `orders`/`projects` require the `version` predicate (not optional); balance-changing flows read with `FOR UPDATE` (or `pg_advisory_xact_lock`) inside the transaction. | double-submit test |
| 9 | **Security basics**: no `dangerouslySetInnerHTML`; no secrets (`JWT_SECRET`, `DATABASE_URL`, `SMTP_*`) in code, logs, PRs, or AI session output — never `cat .env`; outbound-mail recipient/subject/body are validated; URLs for emails come from an env var, never the `Host` header. | Biome (`noDangerouslySetInnerHtml`) + convention |
| 10 | **Errors are surfaced**: list screens handle `isError` explicitly — a failed query never renders as an empty state (「登録されていません」). Destructive actions get a confirm dialog. | convention |
| 11 | **Assets & licensing**: no third-party binary (font, image, library vendored as a file) enters the repo without its license named in the PR. Only OFL/permissive licenses; **never OS-bundled fonts** (Hiragino etc. — Apple's license forbids redistribution/server use). Fonts for PDFs: Noto Sans JP / BIZ UDPGothic. | convention + reviewer check on any new binary |
| 12 | **Infrastructure changes need non-prod evidence**: pool size, timeouts, region, env vars, runtime flags are changed on the dev/検証 project first, and the PR carries the **observed numbers** (connections, latency, error rate, before/after). A production incident is never fixed by editing production config blind — reproduce on staging first (the 3→1→3→10 pool sequence of 2026-09-08/09 is the counter-example). | convention (+ branch protection once enabled) |
| 13 | **Reviewer and workflow changes ship alone**: edits to `.github/workflows/**`, `.claude/**`, `.agents/skills/**`, `CLAUDE*.md`, `AGENTS.md`, `.github/PULL_REQUEST_TEMPLATE/**` go in their own PR, titled `ci(review): …` (workflow / skill) or `docs(rules): …` (CLAUDE.md / AGENTS.md / PR template), never mixed with functional code (`src/**`, `package.json`, build or infra config). On `pull_request` the PR's own workflow runs with the review token, so these diffs get a human's eyes on their own, not buried in a feature. | reviewer check (mixed PR = fix-required) + human approval |

**Why Rule 1 is absolute**: this repo's `DATABASE_URL` has always pointed at the same live Supabase Postgres that the production construct-pro app uses (see the comment in `drizzle.config.ts`). There is no separate dev database wired in by default. Treat every `DATABASE_URL` as production unless you have verified it points at the 検証 project.

## Tech Stack

- **Next.js** - Full-stack React framework with App Router
- **TypeScript** - Type-safe JavaScript development
- **Tailwind CSS** - Utility-first CSS framework
- **tRPC** - End-to-end type-safe API communication
- **Ultracite** - AI-ready code formatter and linter (built on Biome)
- **Zod** - TypeScript-first schema validation
- **Vitest** - Fast unit testing framework
- **Shadcn/UI** - Customizable UI components
- **Drizzle ORM** - `postgres` (postgres.js) driver, `{ prepare: false }` (Supabase pooler is transaction-mode PgBouncer)
- **pdfkit** - PDF generation (purchase orders, invoices, estimates), Node runtime only
- **nodemailer** - SMTP email send (purchase order / invoice / estimate send flows)

## Essential Commands

### Package Management
- `bun install` - Install dependencies
- `bun add {packages}` - Add new packages
- `bunx --bun shadcn@latest add {components}` - Add Shadcn/UI components

### Development
- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run start` - Start production server

### Code Quality
- `bun run check` - Check code quality with Ultracite
- `bun run check:write` - Auto-fix code issues with Ultracite
- `bun run check:unsafe` - Apply unsafe fixes with Ultracite
- `bun run typecheck` - Run TypeScript type checking

### Testing
- `bun run test` - Run unit tests with Vitest

### Git Hooks
- Git hooks are automatically installed via `bun install` (postinstall script)
- Hooks run Ultracite formatting and TypeScript type checking on pre-commit

### GitHub Operations
- `gh issue list` - List GitHub issues
- `gh pr list` - List pull requests
- `gh pr create` - Create new pull request
- `gh issue create` - Create new issue

## Git & PR Conventions

- **Commit subjects in Japanese**, describing the user-visible change (this is what the history uses). A `type(scope):` prefix is optional; keep one style within a PR
- **Never `--no-verify`**: lefthook runs `bun run check:write` and `bun run typecheck` on pre-commit. A hook failure is a finding, not an obstacle
- **Branch from `develop`, open PRs as Draft**, and mark ready only after the local self-review below is clean. The CI reviewer (`.github/workflows/claude-review.yml`) runs on open / ready-for-review; add the `claude-review` label to re-run it
- **Local self-review before every commit and push (mandatory)**: (1) run the `requesting-code-review` skill on the diff against `origin/develop`; (2) check the same diff against §Hard rules using the concrete checks in `.claude/skills/winwin-pr-review/SKILL.md`; (3) fix every finding automatically, no asking; (4) run `bun run check:write`, `bun run typecheck`, `bun run test` (the `quality-verifier` agent does this); (5) only then commit or push. If the branch already has a PR, run `/winwin-pr-review <owner/repo/pull/N>` without `--comment` instead of step 1. Code with an unresolved HIGH finding is never pushed
- **Open the PR with the `create-github-pr` skill and fill every section of `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md`** (no placeholder or empty bullet left; tick a checkbox only after doing it). Name the chosen procedure role (Rule 2), link the tests added (§Enforceable core), and paste observed numbers for infra changes (Rule 12)
- **Human decisions go in the PR, as question + answer**: some rules are decisions a human makes, not the model — Rule 1 (schema/migration), Rule 2 (role for a destructive or money-touching operation), Rule 5 (帳票 fields), Rule 11 (new binary / license), Rule 12 (infra change), any edit to the reviewer (Rule 13 paths), and the three unresolved client decisions in §Project Overview. When the work hits one, **stop and ask the human before implementing**; never answer it yourself or infer it from the codebase. Record every such question with the human's verbatim answer, their name, and the date in the PR's `## Human decisions（人の判断）` section. The CI reviewer marks a triggered rule with no recorded answer as human-approval-required

## Code Style Guidelines

### Coding Principles
- **Readability First**: Code should be easily understandable by other developers
- **Type Safety**: Leverage TypeScript's type system for better development experience
- **Consistent Naming**: Use descriptive names for variables, functions, and components
- **Effective Comments**: Explain "why" not "what" - focus on intent and context

### File Organization
- Use kebab-case for file names (e.g., `user-profile.tsx`)
- Place components in appropriate directories (`src/components/` for shared, `src/app/_components/` for app-specific)
- Mirror test file structure in `__tests__/` directory
- Follow Next.js App Router conventions for routing

### Import/Export Style
- Use ES modules (import/export) syntax, not CommonJS (require)
- Prefer destructuring imports when possible (e.g., `import { Button } from './button'`)
- Use default exports for pages and main components
- Use named exports for utilities and shared functions

### Component Development
- Use TypeScript interfaces for props definition
- Implement proper error boundaries for robust UX
- Follow React best practices (hooks rules, component composition)
- Use Shadcn/UI components as base for custom UI elements
- Follow the design system documented in `src/app/design-system/` for all UI implementations
- Use design tokens defined in `src/styles/globals.css` for consistent styling across the application
- **MANDATORY**: Before any UI-related change (new components, styling updates, layout modifications, page creation), invoke the `manage-agent-native-design-system` skill to ensure design system consistency. This applies to all files in `src/components/`, `src/app/_components/`, page files, and `src/styles/`.

## Testing Guidelines

### Test-Driven Development (TDD) - t-wada Style
**MANDATORY**: Always follow t-wada's TDD methodology when implementing new features or fixing bugs.

**Red-Green-Refactor Cycle**:
1. **Red**: Write a failing test that describes the desired behavior
2. **Green**: Write the minimal code that makes the test pass
3. **Refactor**: Improve code quality while keeping tests green

**Core Principles**:
- Never write production code without a failing test first
- Write the simplest code that passes the test (avoid over-engineering)
- Take small, incremental steps (one test case at a time)
- Use descriptive test names that express behavior, not implementation
- Focus on what the code should do, not how it does it
- Triangulate when discovering the right abstraction (add multiple test cases)

**Implementation Order**:
1. Start with the simplest failing test case
2. Make it pass with minimal code
3. Add more test cases to drive out edge cases and abstractions
4. Refactor only when tests are green
5. Repeat for each new behavior

### Unit Testing with Vitest
- Test files should be placed in `__tests__/` directory
- Use `.test.ts` or `.test.tsx` extensions
- Follow Given-When-Then pattern for test structure
- Mock external dependencies appropriately using `vi.mock()`

### Enforceable core (required when a router or server module is touched)
Vitest defaults to `jsdom`; every server-side test file starts with `// @vitest-environment node`. Today Hard Rules 2, 7, 8 have no test backing, so the first PR that touches a router adds the matching tests and links them in the PR body (the CI reviewer reports evidence-missing otherwise):
- **Role matrix (Rule 2)**: for every procedure in the touched router, each disallowed role gets `UNAUTHORIZED` / `FORBIDDEN` and the allowed role succeeds
- **Soft-delete edge case (Rule 7)**: a by-id read, PDF build, or email send for a record with `deletedAt` set returns `NOT_FOUND` and has no side effects
- **Double-submit (Rule 8)**: two concurrent mutations carrying the same `version` on `orders` / `projects`; exactly one succeeds, the other gets `CONFLICT`

### Best Practices
- Each test should be independent and isolated
- Use descriptive test names that explain what is being tested
- Test both happy paths and error cases
- Prefer integration tests over unit tests for React components

## Architecture Decision Records (ADR)

### When to Write an ADR
Record an ADR whenever you make a decision that future contributors would need context to understand, including:
- Adopting a new library or framework
- Choosing or changing an architectural pattern
- Making a significant API or data model decision
- Reversing or superseding an existing decision

Skip ADRs for routine implementation details, bug fixes, or changes that don't affect how future work is approached.

### How to Write an ADR
- Use `docs/adr/template.md` as the starting point for every new record
- Follow the rules and numbering/index conventions in `docs/adr/README.md`
- **MANDATORY**: Use the `manage-adr` skill to record ADRs; it encodes the correct workflow and file naming
- Read existing ADRs under `docs/adr/` before starting implementation work to confirm your approach doesn't contradict a prior decision
- Include the new or updated ADR in the same pull request as the code change it documents

## API Development with tRPC

### Creating New API Endpoints
1. Create router files in `src/server/api/routers/`
2. Define procedures with proper input validation using Zod
3. Register routers in `src/server/api/root.ts`
4. Pick the procedure per Hard Rule 2: `src/server/api/trpc.ts` defines `publicProcedure`, `protectedProcedure`, `adminProcedure`, and `accountingOrAdminProcedure`. `protectedProcedure` is the minimum; destructive or money-touching operations use `adminProcedure` / `accountingOrAdminProcedure`, and the PR names the chosen role. `publicProcedure` is only for login, session bootstrap, invitation validate/accept, and health checks
5. Call `logAudit` (`src/server/audit/log.ts`) from every create/update/delete (Hard Rule 3). The session/role model has no ADR yet; record one when it changes (use the `manage-adr` skill)

### Money math and document numbering (Rule 4, Rule 8)
- **Tax**: `Math.floor(x * 0.1)` currently exists in four places (`src/server/api/routers/invoices.ts`, `src/server/pdf/document.ts`, `src/server/pdf/order-ack-sheet.ts`, `src/app/(app)/projects/page.tsx`). Never add a fifth. The shared home is `src/lib/money.ts` (integer yen in, integer yen out, unit-tested); the PR that first needs tax math creates it and migrates the four copies
- **Numbering**: project numbers live in `src/server/projects/project-no.ts`. Invoice and purchase-order numbering join it under `src/server/numbering/` (move `project-no.ts` there in the same PR). Uniqueness comes from a DB sequence or UNIQUE constraint inside the transaction, never from `String(project.id)` concatenation or a read-then-write in application code

### Type Safety
- All API inputs/outputs are automatically type-safe
- Use Zod schemas for runtime validation
- Leverage tRPC's React Query integration for client-side data fetching

## Project Structure

```
src/
├── app/              # Next.js App Router pages and layouts
│   ├── _components/  # App-specific components
│   ├── api/          # API routes (including tRPC)
│   └── ...           # Page routes
├── components/       # Shared UI components
│   └── ui/           # Shadcn/UI components
├── lib/              # Utility functions and shared logic
├── server/           # Server-side logic and tRPC API definitions
│   └── api/          # tRPC routers and procedures
├── styles/           # Global styles
└── trpc/             # tRPC client configuration
```

## Important Notes

- Always run type checking after making changes: `bun run typecheck`
- Use Ultracite for consistent code formatting: `bun run check:write`
- Prefer running single tests during development for performance
- Keep dependencies up to date using Dependabot PRs
- Follow the existing patterns in the codebase for consistency
- Record architectural decisions in docs/adr/ (use the manage-adr skill)

## Claude AI Guidance

### Custom Instructions for Development
Follow these guidelines when assisting with code generation, reviews, or modifications:

- **Coding Principles**: Prioritize understandability in code. Use meaningful names for variables/functions. Add comments explaining 'why' not 'what'. Format code consistently with proper indentation and grouping. Simplify control flows using guards and early returns. Decompose complex logic into smaller parts. Optimize variable scopes and eliminate unnecessary temporaries. Include tests and examples to demonstrate intent.

- **UI/UX Design**: Design user-centered interfaces with clarity, simplicity, consistency, and efficiency. Follow visual hierarchy, thoughtful color/typography, intuitive interactions, accessibility (WCAG), and responsive design. Use shadcn/ui for components and adhere to component-driven design. **IMPORTANT**: Follow the design system documented in `src/app/design-system/` and use design tokens from `src/styles/globals.css` for all UI implementations to ensure consistency. **MANDATORY**: Always invoke the `manage-agent-native-design-system` skill before any UI/styling/component work.

- **Package Management**: Use bun for all package operations: `bun add {packages}` for adding, `bun install` for dependencies. For UI components: `bunx --bun shadcn@latest add {components}`.

- **Testing**: Use Vitest for unit tests. Place tests in __tests__ with .test.ts(x) naming. Ensure test independence, readability (Given-When-Then), proper mocking, assertions, and coverage of error cases.

- **Linting and Formatting**: Use Biome via `bun run check:write` for safe fixes. Avoid violations like noForEach, noUnusedVariables, useExhaustiveDependencies, noExplicitAny.

- **Documentation**: Update docs/ when code changes, especially docs/directory-structure.md for structure updates.

- **General**: Prevent duplicates by checking existing implementations. Follow TDD (Red-Green-Refactor). Use GitHub CLI for issues/PRs.

These instructions ensure consistency in both CI/CD and local development.

