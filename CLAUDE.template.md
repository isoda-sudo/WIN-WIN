# Claude Code Configuration — construct-pro-next

> **PROPOSAL (CLAUDE.template.md) v2** — drafted 2026-09-04, revised 2026-09-09 by QA (パニ) as the QA#11 deliverable.
> Base: the current CLAUDE.md (nextjs-template lineage) + project guardrails from `docs/investigation/` (03/04/07/09/10) + selected pieces of `sun-ai-ready-sdlc` (INVESTIGATION_08) + the transferable core of Takumi's Evidence Gate (no Takumi install required).
> On team agreement this replaces `CLAUDE.md`; keep `AGENTS.md` as its condensed mirror; adopt `PULL_REQUEST_TEMPLATE.proposal.md` as `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md`.

## Project Overview

construct-pro-next is the Next.js/tRPC rewrite of construct-pro, the internal business management system for 株式会社WIN WIN (Kyoto construction/design company). It covers 案件（受注）→ 発注（注文書）→ 支払 → 入金 → 帳票発行（見積書・注文書・請求書PDF）, replacing six disconnected Excel files. Production delivery: end of Nov 2026; Dec–Jan is the client PoC-usage period; Feb–Mar is the improvement window.

**⚠️ The one fact that governs everything:** this app connects to the **same live production Supabase** as the still-running old Express app. `src/server/db/schema.ts` is a hand-authored mirror of that live DB — it does not drive it. Until the dev/検証 Supabase projects exist (環境構成案), *every* `DATABASE_URL` is production.

Required reading (in-repo — never rely on files outside this repository):

- `docs/poc-reference/business-rules.md` — domain rules source of truth (採番・権限・帳票規則). Never write code that contradicts it.
- `docs/investigation/INVESTIGATION_07_NEXT_REPO_REVIEW.md` + `INVESTIGATION_09_*` — known defects, HEAD line numbers, fix priorities.
- `docs/investigation/INVESTIGATION_03_JP_COMPLIANCE.md` — legal constraints on 帳票 (インボイス制度・電帳法・建設業法).
- `docs/adr/` — read before implementation; decisions there bind you.

## 🚫 Hard rules (violations block merge)

Each rule names what enforces it today. "convention" = only this file and the reviewer — those are the rules most likely to be silently skipped, so the reviewer checks them explicitly.

| # | Rule | Enforced by |
| --- | --- | --- |
| 1 | **Database safety**: never run `drizzle-kit push/migrate`, DDL, `TRUNCATE/DROP`, or any seed/reset script against `DATABASE_URL`. Schema changes require a team decision + ADR + the migration process (WORKLOG §A row 1) first. | convention (+ `drizzle.config.ts` comment) |
| 2 | **Auth on every endpoint**: every new tRPC procedure / route handler is `protectedProcedure` at minimum; every **destructive or money-touching** operation makes an explicit role decision (`adminProcedure` / `accountingOrAdminProcedure`). "protected" alone is not an authorization decision. Name the chosen role in the PR. | convention + role-matrix test (§Testing) |
| 3 | **Audit**: every create/update/delete calls `logAudit` with meaningful details (never `{}`). Outbound email sends are always audited. | convention |
| 4 | **Money math**: integers only. `Math.floor(x * 0.1)`-style float math is banned (¥1 drift). The tax rate lives in one shared module; never re-declare `0.1` / `"10%"` locally. | unit tests on the shared module + reviewer grep for `0.1` |
| 5 | **帳票 compliance freeze**: 登録番号, 税率, 請求書番号の体系, 日付, 振込先 on 請求書/見積書/注文書 PDFs must not change without human review (適格請求書の記載要件, INVESTIGATION_03). | human approval required |
| 6 | **No new hardcoded company data**: company name/address/bank/登録番号 come from `src/server/pdf/company.ts` only (until the settings table exists). Never persist placeholder values into DB rows. | convention |
| 7 | **Soft-delete discipline**: every by-id read of `projects`/`vendors`/`customers` filters `deletedAt`. A deleted record must never generate documents or emails. | edge-case test (§Testing) |
| 8 | **Concurrency**: mutations to `orders`/`projects` require the `version` predicate (not optional); balance-changing flows read with `FOR UPDATE` (or `pg_advisory_xact_lock`) inside the transaction. | double-submit test (§Testing) |
| 9 | **Security basics**: no `dangerouslySetInnerHTML`; no secrets (`JWT_SECRET`, `DATABASE_URL`, `SMTP_*`) in code, logs, PRs, or AI session output — never `cat .env`; outbound-mail recipient/subject/body are validated; URLs for emails come from an env var, never the `Host` header. | Biome (`noDangerouslySetInnerHtml`) + convention |
| 10 | **Errors are surfaced**: list screens handle `isError` explicitly — a failed query never renders as an empty state (「登録されていません」). Destructive actions get a confirm dialog. | convention |
| 11 | **Assets & licensing**: no third-party binary (font, image, library vendored as a file) enters the repo without its license named in the PR. Only OFL/permissive licenses; **never OS-bundled fonts** (Hiragino etc. — Apple's license forbids redistribution/server use). Fonts for PDFs: Noto Sans JP / BIZ UDPGothic. | convention + reviewer check on any new binary |
| 12 | **Infrastructure changes need non-prod evidence**: pool size, timeouts, region, env vars, runtime flags are changed on the dev/検証 project first, and the PR carries the **observed numbers** (connections, latency, error rate, before/after). A production incident is never fixed by editing production config blind — reproduce on staging first (the 3→1→3→10 pool sequence of 2026-09-08/09 is the counter-example). | convention (+ branch protection once enabled) |
| 13 | **Reviewer and workflow changes ship alone**: edits to `.github/workflows/**`, `.claude/**`, `.agents/skills/**`, `CLAUDE*.md`, `AGENTS.md`, `.github/PULL_REQUEST_TEMPLATE/**` go in their own PR, titled `ci(review): …` (workflow / skill) or `docs(rules): …` (CLAUDE.md / AGENTS.md / PR template), never mixed with functional code (`src/**`, `package.json`, build or infra config). On `pull_request` the PR's own workflow runs with the review token, so these diffs get a human's eyes on their own, not buried in a feature. | reviewer check (mixed PR = fix-required) + human approval |

## Delivery workflow — PR before anything reaches a shared branch

**Branch model**: `main` is protected (no direct push, 1 human approval, CI `lint` + `test` green). Work happens on `feat/…` / `fix/…` branches. **The first push of a branch opens a Draft PR**; the PR body (template below) is filled **before** it is marked ready for review. This holds for AI agents too: an agent never runs `git push` to `main` (or any future `dev`/`staging` branch) and never uses `--no-verify`.

Enforcement — this file is a convention; the real gate is: branch protection on GitHub (required checks = `lint`, `test`; 1 approval; no force-push) + optional lefthook `pre-push` refusing pushes to protected branch names. (Recipe in `PULL_REQUEST_TEMPLATE.proposal.md` §Appendix.)

**Evidence, not promises** (the transferable core of Takumi's Evidence Gate, adopted without Takumi):

- **Study** — before coding: scope, files/touchpoints, blast radius (which screens/tables/PDFs can break), acceptance criteria. Goes in the PR body.
- **Test** — the *actual* commands run and their *actual* output/exit codes pasted into the PR (`bun run test`, `bun run check`, `bun run typecheck`, plus the manual steps with the **role** used — test as `staff`, not only `admin`). A checkbox saying "tests pass" is not evidence.
- **Review** — the author does not seal their own work. The AI session that wrote the code is not the reviewer: a human, or a *fresh* session running `/code-review` (or `/security-review` for money/auth/帳票), records the verdict and unresolved items in the PR. No self-grading agents (`quality-verifier` is retired for this reason).
- **Depth scales with risk**: money・auth・帳票・schema・infra changes = high depth (Grill answers mandatory, tests mandatory, security review). UI-only / copy changes = standard depth (Study + Test evidence only).

## Implementation Grill（実装グリル）— for high-risk changes

For money・auth・帳票・schema・infra changes, a new dependency, or anything ADR-worthy: if the `grilling` skill is available, run it against the plan **before** coding and paste the surviving rationale; otherwise answer these 5 in the PR (permissions and rollback are already covered by Hard Rules #2/#12 and the Study section — don't repeat them):

1. **Why** this approach — what problem, in business terms?
2. What **alternatives** were rejected, and why?
3. **Failure modes**: concurrent use, bad input, mid-operation crash?
4. **Compliance surface**: 帳票 fields, retention, audit? (cite the INVESTIGATION_03 section)
5. **Proof**: which test demonstrates the core behavior, and which edge cases below does it cover?

## Testing Guidelines

**Enforceable core (mandatory):** any change to **money calculation, 採番/numbering, RBAC, or audit logging** ships with tests in the same PR — no exceptions. Everything else: t-wada TDD (Red → Green → Refactor) as the default; if you skip tests, say so and why in the PR ("deliberate coverage gaps").

**What is testable today** (no test DB exists yet — integration tests against a real DB start when the dev Supabase project lands):
1. **Pure modules** — tax/totals (`computeInvoiceTotals`), 採番 formatting, status transitions. Requires the logic to live in one module under `src/server/` (Hard Rule #4 / §API 4), not inside a router or PDF builder.
2. **Router role-matrix tests** — call each procedure through `appRouter.createCaller({ user })` with `vi.mock("~/server/db")`; assert `UNAUTHORIZED` (no session), `FORBIDDEN` (wrong role), success (allowed role). One table-driven test per router covers Hard Rule #2 for all its procedures.
3. **Component tests** — error state (`isError`) and empty state render differently; confirm dialog appears before delete.
4. Server test files need `// @vitest-environment node` at the top (the vitest default is `jsdom`, which breaks `postgres`/`pdfkit` imports). Tests live in `__tests__/` mirroring `src/`, Given-When-Then naming.

**Edge cases this domain must cover** — pick the applicable rows for every PR and list them in the PR's test plan:

| Area | Edge cases |
| --- | --- |
| Money | ¥0, negative, `null`/`undefined` amount; ¥1 rounding at 10-yen boundaries; subtotal = sum of items exactly; tax rate not hardcoded |
| Payments | double-submit on the same order (two calls, same `remaining`); payment > remaining; delete restores remaining; locked 支払済み row rejected |
| Concurrency | stale `version` → 409 and no write; missing `version` → rejected |
| Soft delete | deleted project/vendor/customer on every by-id read, PDF route, and send route → NOT_FOUND, no email |
| RBAC | no session → `UNAUTHORIZED`; `staff` on money/destructive → `FORBIDDEN`; `accounting` allowed where business-rules.md says so |
| 採番 | month boundary (引渡月 change → new number, old record frozen); duplicate number rejected; PDF prints the stored number |
| Errors | DB error → error state, not empty list; toast on mutation failure; 500 never shown as 「登録されていません」 |
| Auth flows | expired invite; reused invite token; suspended user's live session; logout then old cookie |
| Input | empty strings vs `null`; Japanese full-width digits in amounts; very long 備考; invalid email in `to` |

**Minimal test plan per PR** (3 rows in the PR body): what behavior is tested · which edge cases above are covered · which are not and why.

**Coverage**: once the shared money/numbering modules exist, add a Vitest coverage threshold scoped to `src/server/{money,numbering}/**` only (not global) so the enforceable core can't regress silently.

## Skill pipeline — which skill, when, and what makes it fire

Skills do not run because their description says "MUST". They run when the model decides, when a human types `/skill`, or when a **hook** puts the instruction into the session. In `winwin-constructor-pro`, `.claude/settings.json` + `.claude/hooks/` do the third (INVESTIGATION_10 §4); everywhere else, the table is the contract.

| Phase | Skill(s) | Fires by |
| --- | --- | --- |
| Session start | `using-superpowers` | SessionStart hook injects the rules + this order |
| Plan | `brainstorming` → `impact-analysis` (blast radius incl. the shared prod DB) → `writing-plans`; high-risk: `grilling` / Grill answers | Convention; PR §1 Study cannot be filled without it |
| Implement | `test-driven-development` (mandatory for money・採番・RBAC・audit) · `manage-agent-native-design-system` (UI) · `manage-adr` (any decision) · `supabase-postgres-best-practices` (queries, locks, pool) | PostToolUse nudge per edited path (tests: "no mirrored test file" check) |
| Verify | `domain-guardrails-review` (Hard Rules as greps + reading questions) · `jp-compliance-review` (帳票/保存/税率 paths — not legal advice) · `asset-license-check` (fonts, images, deps) · `verification-before-completion` | PreToolUse on `git commit`: mechanical greps **block**; skills are named in context |
| Deliver | `commit-changes` → `create-github-pr` (Draft on first push; Study/Test/Review filled) → reviewer: `review-github-pr` in a **fresh** session, `/security-review` for auth・money・帳票 | PreToolUse blocks pushes to protected branches, `--no-verify`, force-push |
| Debug | `systematic-debugging` before any fix; infra incidents are reproduced on staging (Hard Rule 12) | Nudge on `db/index.ts`, `vercel.json`, `next.config.js` |

Blocked by hook = fix it; do not look for a way around the hook (that is what `--no-verify` and `settings.local.json` overrides are, and both are reviewable in the PR). Hooks govern Claude Code sessions; lefthook + branch protection govern everyone else (`docs/management/enforcement.md`).

## Code Quality & Style

- `bun run check` / `check:write` (Ultracite/Biome) and `bun run typecheck` must pass before commit (lefthook pre-commit; CI re-checks). `noExplicitAny`, `noForEach`, `useExhaustiveDependencies` are not to be suppressed.
- Kebab-case files; PascalCase components; camelCase hooks; server components by default; `cn` for Tailwind composition; ES modules; named exports for utilities, default exports for pages; comments explain *why*.
- YAGNI / KISS / DRY: no speculative abstractions; if the same calculation appears twice, extract it now (the 4× tax calc is the cautionary tale).
- **MANDATORY**: before any UI work, invoke the `manage-agent-native-design-system` skill; tokens from `src/styles/globals.css`; base UI on shadcn/ui.

## Commits & PRs

- Conventional Commits with prefix (from sun-ai-ready-sdlc): `[#issue]feat(scope): …` — `build / ci / docs / feat / fix / perf / refactor / style / test`.
- 1 PR = 1 purpose; target ≤ ~400 changed lines (AI output sprawls — split it). Which parts were AI-generated and how they were verified is stated in the PR.
- AI review (claude-code-action) is advisory when enabled; required gates remain CI green + 1 human approval. `CODEOWNERS` routes `src/server/**` and `src/server/pdf/**` to a human reviewer.

## API Development with tRPC

1. Router files in `src/server/api/routers/`; register in `src/server/api/root.ts`; Zod on every input.
2. Auth context exists: `protectedProcedure`, `adminProcedure`, `accountingOrAdminProcedure` in `src/server/api/trpc.ts` (roles re-read from DB per request). Choose per Hard Rule #2. *(Supersedes the stale "template ships without auth" text — the auth-design ADR is still owed: write it.)*
3. Route handlers (`src/app/api/**`) validate input with Zod too — hand-cast `req.json()` is not validation.
4. Shared business logic (invoice totals, tax, numbering) lives in one module under `src/server/`, imported by routers, PDF builders, and (via tRPC) the client — never re-implemented per call site.

## Architecture Decision Records (ADR)

Write an ADR (via the `manage-adr` skill, template in `docs/adr/`) for: new library/framework, architectural pattern, significant API/data-model decision, infra/config decisions with production impact (pool sizing, region), or reversing a prior decision — **in the same PR as the code**. Backfill candidates: same-DB mirror strategy, cookie-auth design, base64-file storage, E2E policy, PDF font choice.

## Essential Commands

- `bun install` / `bun add {pkg}` / `bunx --bun shadcn@latest add {component}`
- `bun run dev` · `bun run build` · `bun run start` · `bun run preview`
- `bun run check` · `bun run check:write` · `bun run typecheck` · `bun run test` · `bun run check:adr`
- GitHub via `gh` CLI (issues/PRs). Prerequisites: Bun, Node ≥ 20.9.

## Project Structure & Docs Map

```text
src/…                    (see docs/directory-structure.md)
fonts/                   PDF font (OFL-licensed only — Hard Rule #11)
docs/
├── adr/                 decisions (the only decision log — no parallel decision.md)
├── investigation/       audits, QA sheets, sprint plan (INVESTIGATION_01–09)
├── poc-reference/       kickoff deck, 機能一覧/画面一覧/要件定義書, business-rules.md
├── screens/             screen spec
└── management/          (proposed) definition-of-done.md, risk-list.md, test-plan.md
```

Definition of Done for the Nov release = Gate 1/Gate 2 in `docs/investigation/INVESTIGATION_04_TEAM_QUALITY_PLAN.md` §5, plus the Evidence sections of every merged PR.
