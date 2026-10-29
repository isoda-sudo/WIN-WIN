# INVESTIGATION 09 — Re-verification at HEAD (6d3510e) + prioritized action list

Date: 2026-09-09 (Wed) / Target: `construct-pro-next` @ `6d3510e` (2026-09-09 13:05 JST) / Previous audit: [INVESTIGATION_07](INVESTIGATION_07_NEXT_REPO_REVIEW.md) @ `5998503` (2026-09-02)
Method: grep-level re-verification of every INVESTIGATION_07 P0/P1 at the current commit (line numbers below are HEAD, not the 09-02 ones), full read of the 7 commits landed since, and a status audit of `WORKLOG.md`. Read-only — nothing was run against `DATABASE_URL`, no team file was edited.

> **Excerpt (§0–§3).** The original report also had §4 (QA's own action list for the 09-10 MTG) and §5 (WORKLOG corrections); they are internal working notes and are omitted here. The full version is kept locally by QA.

## 0. Verdict first

1. **Nothing from INVESTIGATION_07 has been fixed.** All 11 old-P0 rows and all P1 rows reproduce at HEAD. The 7 commits since 09-02 are: 1 UI bug fix (sidebar contrast), 1 UI feature (column toggle on 受注一覧), 1 Vercel region pin, 1 `.gitignore` line, and **3 production connection-pool changes within 18 hours**.
2. **The two 「すぐ対応」 items the team approved on 09-04 have not landed** 5 days later: `src/app/api/auth/signup/route.ts` still exists, `login/page.tsx:123` still shows the 新規登録 button, and there is still exactly one `DATABASE_URL` (production) with no dev/staging project or seed.
3. **New risk signal — the pool flip-flop**: `MAX_CONNECTIONS` went 3 → 1 (09-08 18:18) → 3 (09-09 10:16, commit message describes a production stall: 「1本の滞留が全リクエストを道連れにする」) → 10 (09-09 11:43). That is debugging in production against the shared live DB, because no other environment exists. It is the strongest evidence yet for the 環境構成案 task (WORKLOG §A row 4).
4. The rest of this excerpt is **§3 what the dev team must fix, ordered risk → easy**.

## 1. The 7 commits since 5998503 — review

| Commit | Change | Review |
| --- | --- | --- |
| `0aae17b` 09-07 | Sidebar/notification/customers link color: `text-secondary` → `text-secondary-foreground` / `text-primary` | ✅ Legit bug fix. Design-system token use is correct. |
| `c4d39bf` 09-08 18:18 | Prod pool `max: 3 → 1` (「サーバーレスの多重起動対策」) | ⚠️ Reasoning (N containers × max) is right, the number was wrong — a single stranded connection blocks the whole container. |
| `689cd43` 09-09 09:40 | `vercel.json` `regions: ["hnd1"]` | ✅ Fine. Only meaningful if the Supabase project is also ap-northeast-1 (`.env.example` says it is). |
| `95c8ea1` 09-09 10:16 | Revert `1 → 3`; commit message documents the stall | 🔴 A production incident was the test. There is no staging to have caught it. |
| `d0dac24` 09-09 11:43 | `max: 10` unconditionally, justified as 「旧appと同じ」 | ⚠️ **The justification is wrong in a way that matters.** The old app is *also* Vercel serverless (INVESTIGATION_01 §9: `api/index.js` re-exports Express, region hnd1) with `max: 10` per container, so "10 worked for one long-lived process" is not what happened — it is N containers × 10, and now there are **two** apps doing N × 10 against the *same* Supabase pooler. The docblock at `src/server/db/index.ts:43-47` still says the opposite (「sized much smaller… `max: 10` was fine for one long-lived process」) while the constant below it is 10 — the file contradicts itself. Whether 2 × N × 10 fits the pooler's client limit depends on the Supabase compute tier and Vercel's concurrency ceiling — **cannot be verified from the repo; ask the team** (§4). |
| `6d3510e` 09-09 13:05 | 受注一覧: 備考列 moved next to 工事計画; 表示項目 toggle (Popover + Checkbox, `localStorage` key `projects-columns`) | ✅ Clean: `try/catch` around storage, default = all columns, edit-row and view-row kept in sync. Minor: `useEffect` reads storage after first paint → one-frame layout shift for users who hid columns. No `isError` handling added (consistent with the rest of the app — see §2). |
| `.gitignore` +`.env*` | (bundled) | ✅ No `.env` was ever committed (`git log --all -- .env` empty). `.env.example` stays tracked (ignore rules don't affect tracked files). |

**Addendum (09-09, README review):** `fonts/jp.ttc` (7.8 MB) is **Hiragino Sans W3**, Apple's macOS system font, committed to git and shipped to Vercel through `next.config.js` `outputFileTracingIncludes`. Apple's font license does not allow redistribution or use outside macOS, so every PDF in production is rendered with an unlicensed font and every clone of the repo redistributes it. Fix is cheap: replace with an SIL-OFL Japanese font (Noto Sans JP or BIZ UDPGothic), update `font.ts:9-10`, and purge the file from history before the repo is mirrored anywhere else. Added as Tier A7 below.

Also unchanged since 09-02: `bun-version: latest` in CI (`ci_cd.yml:27,65`), deploy jobs still commented out, `.claude/agents/quality-verifier.md` still present (QA_HANDOFF §5 recommended retiring it), `title: "Next.js App"` in `src/app/layout.tsx:11`, zero server/router tests (`__tests__/` = 5 template tests).

## 2. INVESTIGATION_07 re-verification at HEAD (cite these lines at the MTG, not the 09-02 ones)

| # | Finding | HEAD evidence | Status |
| --- | --- | --- | --- |
| 1 | Open self-signup, role `user` unmanageable | `api/auth/signup/route.ts:46` (`role: "user"`), `login/page.tsx:123` (`setView("signup")`) | ❌ still — and 「すぐ対応」 approved 09-04 |
| 2 | Same prod DB, no staging, no seed, no drift check | `.env.example` (single `DATABASE_URL`), `drizzle.config.ts`, old app `server.js:28,248,437` (`ensureAux()` still runs DDL) | ❌ still — 「すぐ対応」 approved 09-04; pool flip-flop is the consequence |
| 3 | RBAC bypasses | `orders.ts:316` `updateRemaining: protectedProcedure` (defeats `payments.create` gate at `payments.ts:77`); `orders.ts:353/397` `uploadFile/deleteFile` ungated vs `updateDocStatus` gated `:285`; `invoices.ts:128` `delete: protectedProcedure`; every `delete` in projects/orders/receipts/vendors/customers/categories is `protectedProcedure`; `vendors.ts:63` `getById` returns full bank digits to any role | ❌ still |
| 4 | Payment TOCTOU | `payments.ts:96-135`: order read outside tx, absolute `remaining` write, no `FOR UPDATE` (`grep -i "for update" src/server` → 0 hits; advisory lock exists only for numbering) | ❌ still |
| 5 | Optimistic lock opt-in | `orders.ts:29,198` / `projects.ts:117,159` — `version: z.number().nullish()`, predicate applied only `if hasVersion` | ❌ still |
| 6 | 請求額 = Σ原価; hardcoded bank/登録番号 ×2 persisted into rows | `invoices.ts:10-11` (`REGISTRATION_NO`, `BANK_INFO = "〇〇銀行 京都支店 (普)0777777"`), `:92` persisted on create; second copy `pdf/company.ts:14-15` | ❌ still — placeholder bank string is being written into real invoice rows on every issue |
| 7 | invoice_no COUNT-based, no UNIQUE, PDF prints a different number | `schema.ts:236` (`invoice_no` text, no unique index — compare `:138` for project_no which has one); `pdf/document.ts:375` prints `"WW-" + project.id` | ❌ still |
| 8 | Tax `0.1` × 4, float math | `invoices.ts:13,73` · `pdf/document.ts:368` · `pdf/order-ack-sheet.ts:131` · `projects/page.tsx:1207` — all `Math.floor(x * 0.1)` | ❌ still |
| 9 | Soft-deleted projects still invoice/email | 22 `eq(projects.id, …)` by-id reads in `src/server` + `src/app/api`; none has `deletedAt` within ±4 lines (`grep -B4 -A4`). `projects.deletedAt` is filtered in exactly 6 places, all list-level (`projects.ts:50`, `dashboard.ts:424/601/947`, `receipts.ts:269`, `export/[type]/route.ts:78`). Verified unfiltered on the invoice path: `invoices.ts:49`, `invoice/project/[projectId]/route.ts:27`, `…/pdf/route.ts:32` | ❌ still |
| 10 | Open mail relay / unaudited send | `po/send/route.ts:20-33` auth-only, arbitrary `to/subject/body` via hand-cast `req.json()`; `estimate/send/route.ts` same + **no `logAudit`**; `invoice/send` is the only one role-gated (`:21`) and it still marks **all** project invoices 発送済み (`:70-73`) | ❌ still |
| 11 | Arbitrary client-supplied prices into invoice PDF | `invoice/project/[projectId]/pdf/route.ts:44-52` accepts `items?: CustomLineItem[]` from the body, unrecorded | ❌ still |
| 12 | Invite URL from `Host` header | `invitations.ts:21-25` (`headers.get("host")`), no `APP_URL` in `env.js` | ❌ still |
| 13 | `invitations.list` hard-DELETEs inside a query | `invitations.ts:42-49` | ❌ still |
| 14 | No error surface | `grep -rl isError src/app` → 0 files; no `error.tsx`; tRPC `onError` is an empty function in dev and `undefined` in prod (`api/trpc/[trpc]/route.ts:23-28`); `AlertDialog` used in 1 file | ❌ still |
| 15 | ¥0 line-item init in 見積書/請求書 modal | `projects/page.tsx:1193` (`initialLineItems`), `:1339`, `:1527` — `useState(() => initialLineItems(project, allOrders…))` before `orders.list` resolves | ❌ still (moved from :1233/:1420) |
| 16 | Logout non-revoking; in-memory rate limit; no password reset | `logout/route.ts` deletes cookie only; `rate-limit.ts:5-6` own comment 「NOT production-safe」 | ❌ still |
| 17 | `/design-system/*` public in prod; scaffold title | no `middleware.ts`/`proxy.ts`; `(app)/layout.tsx:10` gates only the app group; `layout.tsx:11` | ❌ still |

Not verifiable from this machine: branch protection on `main` (`gh` CLI not installed here — check in the GitHub UI or from a machine with `gh`).

## 3. What the dev team must fix — ordered most risky → easiest

Tiering: **A** = can lose or corrupt money/data or leak it, or is the reason other fixes can't be tested safely. **B** = wrong on the day the client uses it. **C** = cheap hygiene, do in the same week.

### Tier A — do before any more feature work (this sprint)

| # | Fix | Why first | Size |
| --- | --- | --- | --- |
| A1 | **Stand up a non-production DB + seed** (Supabase project for dev, one for 検証; a seed that creates a login-able admin + one project/order/payment) | Every other fix below is currently tested in production. The pool flip-flop (§1) is what "no staging" costs in practice. Approved 09-04 as すぐ対応. | M (1–2 days incl. seed) |
| A2 | ✅ **解消 (f46c1f2, 2026-09-09 — signup route + login view deleted)** — was: **Delete signup** (`api/auth/signup/route.ts` + the 新規登録 view in `login/page.tsx`); keep invitations as the only onboarding path | Anyone on the internet can create an account that passes every `protectedProcedure` (full bank numbers, invoice create/delete, CSV export, mail send). Approved 09-04 as すぐ対応. | XS (< 1 h) |
| A3 | **Role-gate the money/destructive procedures**: `orders.updateRemaining` → `accountingOrAdminProcedure`; `invoices.delete`, `orders.uploadFile/deleteFile` → same; all `*.delete` → at least `accountingOrAdminProcedure`; `vendors.getById` → accounting/admin (or mask unless accounting); `po/send` + `estimate/send` → role-gate like `invoice/send`, Zod-validate `to` as email, add `logAudit` to `estimate/send` | Gates exist but are bypassable — worse than no gates because the team believes they hold. | S (½ day) — mechanical |
| A4 | **Payment concurrency**: in `payments.create/delete`, read the order **inside** the tx with `FOR UPDATE` (or `pg_advisory_xact_lock(orderId)`, the pattern already used for numbering); make `version` **required** in `orders.update`/`projects.update` | Two 経理 users paying the same order = lost update on 残金. Silent. | S |
| A5 | **Stop persisting placeholder bank data**: delete `invoices.ts:10-11`, import from `pdf/company.ts`; then get the **real** 振込先/登録番号 from the client (QA V3 ⑤) and backfill the rows already written | Every invoice issued today writes 「〇〇銀行 … 0777777」 into the DB. Backfill cost grows daily. | XS code + client input |
| A6 | **Pool sizing decision with numbers, not guesses**: confirm Supabase compute tier → pooler client limit; confirm Vercel max concurrency for both apps; set `max` from that; fix the contradictory docblock in `db/index.ts:43-47`; add a `/api/health` that does `select 1` | Third change in 18 h against prod. The next stall is a client-visible outage during a demo. | S (½ day) once numbers are known |
| A7 | **Replace `fonts/jp.ttc` (Hiragino Sans W3, Apple-licensed) with an OFL font** (Noto Sans JP / BIZ UDPGothic); purge from git history | Unlicensed redistribution + server use in every PDF and every clone. Zero-risk swap. | XS |

### Tier B — before the November release (next 2 sprints)

| # | Fix | Why |
| --- | --- | --- |
| B1 | **Business ruling on 請求額** (Σ原価 vs 契約額) — then implement one shared `computeInvoiceTotals()` used by `invoices.ts`, `pdf/document.ts`, `pdf/order-ack-sheet.ts`, and the client preview | Coded as "intentional parity"; the 売上 report disagrees with the invoice by design. Needs business, not code. |
| B2 | **Tax in one module**: `TAX_RATE` constant + integer math (`Math.floor(x / 10)` or `Math.round`-with-rule), delete the other 3 copies; **tests** on the module | 4 copies drift; ¥1 errors on invoices are a client-trust event. |
| B3 | **Invoice numbering**: UNIQUE index on `invoice_no` (a schema change → needs A1 + the migration process, WORKLOG §A row 1); PDF reads the stored `invoiceNo` instead of `"WW-"+id`; `invoice/send` marks only the invoice it sent | Number reuse after delete + PDF ≠ DB is an インボイス制度 problem, not a cosmetic one. |
| B4 | **Soft-delete discipline**: a `findActiveProject(id)` helper that filters `deletedAt`; use it in all 22 by-id reads | Deleted projects still generate and email invoices. |
| B5 | **Error surface**: `error.tsx` in `(app)/`, real tRPC `onError` (log + 500), `isError` branch on every list screen, `AlertDialog` on every delete | Today a 500 renders as 「登録されていません」. Guaranteed 「データが消えた」 tickets. |
| B6 | Fix ¥0 line-item init (derive items from `allOrders` with `useMemo`/`useEffect` or gate the modal on `isSuccess`) | Money-critical preview opens showing zero. |
| B7 | Remove `items` body override from the invoice PDF route, or record what was printed (電帳法 写し保存 positioning — QA V3 ⑬) | Arbitrary prices on a legally-weighted PDF with no record. |
| B8 | Invite URL from an `APP_URL` env var; move expiry cleanup out of `invitations.list` into `create` or a cron | Host-header injection into emails; read path mutates. |
| B9 | Tests for money・採番・RBAC (the "enforceable core" in `CLAUDE.template.md`) — start with B2's module and a role-matrix test over the routers | Zero domain tests today; TDD mandate in CLAUDE.md is unenforced. |
| B10 | Deploy pipeline (uncomment `deploy_preview`, needs Vercel secrets) + monitoring (Sentry or Vercel logs alert + the `/api/health` from A6) | UAT plan (per-feature preview) and the early-Nov backup rehearsal both depend on this. |

### Tier C — cheap hygiene (same week, any order)

`bun-version` pinned in CI · `title` metadata · gate `/design-system/*` behind `requireSession` or exclude from prod build · retire `.claude/agents/quality-verifier.md` (it auto-edits until green — no evidence gate) · fix the stale CLAUDE.md §API "no auth" line + absolute-path plan reference (lands with the CLAUDE.template.md adoption) · write the missing auth ADR · logout bumps `token_version` (the column already exists) · `.env.example` documents `sslmode`.
