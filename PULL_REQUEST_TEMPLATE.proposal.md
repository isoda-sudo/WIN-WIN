<!--
PROPOSAL (2026-09-09, QA/パニ) — replaces .github/PULL_REQUEST_TEMPLATE/pull_request_template.md on team agreement.
Design: every section asks for EVIDENCE (pasted output, named roles, file paths), not checkboxes.
Sections marked (high-risk only) may be deleted for UI-only / copy changes. Everything else is mandatory before "Ready for review".
-->

## 1. Study — scope before code

- **Problem (business terms)**: <!-- what breaks or is missing for the client today -->
- **Change type**: feat / fix / refactor / infra / docs — **Risk level**: high (money・auth・帳票・schema・infra) / standard
- **Files & touchpoints**: <!-- routers, routes, PDF builders, screens, tables touched -->
- **Blast radius**: <!-- which screens / PDFs / tables / the old app can be affected -->
- **Acceptance criteria**: <!-- 1–3 observable outcomes -->
- **Roles that can invoke this** (Hard Rule #2): <!-- admin / accounting / staff — and why -->
- **Related**: Fixes #<!-- issue --> · ADR: <!-- docs/adr/NNNN or "not needed because…" -->

## 2. Grill answers (high-risk only)

1. Why this approach?
2. Alternatives rejected, and why?
3. Failure modes (concurrent use, bad input, mid-operation crash)?
4. Compliance surface (帳票 fields / retention / audit — cite INVESTIGATION_03 §)?
5. Proof — which test demonstrates the core behavior?

## 3. Test evidence — actual output, not checkboxes

```text
$ bun run check
<paste last lines + exit code>

$ bun run typecheck
<paste last lines + exit code>

$ bun run test
<paste summary line: files / tests / duration + exit code>
```

**Manual verification** (role used for each step — test as `staff` too, not only `admin`):
1. As `<role>`: … → observed …
2. …

**Test plan**

| Behavior tested | Edge cases covered (from CLAUDE.md §Testing table) | Not covered — and why |
| --- | --- | --- |
| | | |

**Infra changes only** (Hard Rule #12): tried on dev/検証 project `<name>` on `<date>`; observed before/after numbers: <!-- connections, latency, error rate -->

## 4. Review — sealed by someone other than the author

- **Reviewer**: <!-- human name, or "fresh Claude session /code-review" + date --> (not the session that wrote the code)
- **Verdict**: approve / changes requested
- **Unresolved items**: <!-- list, or "none" -->
- **AI-generated parts & how verified**: <!-- which files/functions; what was checked by hand -->

## 5. Checklist (reviewer ticks, not author)

- [ ] Hard Rules #1–#12 checked against the diff (grep `0.1`, new binaries, `Host` header, `protectedProcedure` on money/destructive ops)
- [ ] `logAudit` on every mutation with real details
- [ ] Soft-delete filter on new by-id reads
- [ ] Screenshots attached for UI changes (light + dark)
- [ ] ≤ ~400 changed lines, 1 purpose
- [ ] ADR added/updated if a decision was made

---

### Appendix — enforcement recipe (apply on the repo, once)

Branch protection on `main` (GitHub → Settings → Branches → Add rule):
- Require a pull request before merging · 1 approval · dismiss stale approvals
- Require status checks: `lint`, `test` (job names from `.github/workflows/ci_cd.yml`) · require branches up to date
- Do not allow bypassing the above settings · block force pushes · block deletions
- (If a `dev`/`staging` branch is added later: same rule, and add it to `on.push.branches` in CI so the push trigger fires.)

Optional lefthook `pre-push` (add to `lefthook.yml`) — refuses direct pushes to protected branches even with hooks otherwise passing:

```yaml
pre-push:
  jobs:
    - run: |
        branch=$(git rev-parse --abbrev-ref HEAD)
        case "$branch" in main|dev|staging) echo "Direct push to $branch is blocked — open a PR."; exit 1;; esac
```

`CODEOWNERS` (`.github/CODEOWNERS`) so money/PDF paths always get a human reviewer:

```
src/server/**        @<human-reviewer>
src/server/pdf/**    @<human-reviewer>
fonts/**             @<human-reviewer>
```

Security workflows to copy from `sun-ai-ready-sdlc`: `osv-scanner.yml`, `scorecard.yml` (complements Dependabot).
