---
name: create-github-pr
description: Use when asked to open a GitHub pull request from the current branch, including preparing checks, summarizing changes, and filling the PR template.
---

# Create GitHub PR

## Overview
Prepare and open a pull request using the repository template, with checks completed and a clear summary.

## Workflow
1. Confirm branch and scope. Capture `git branch --show-current` and a diff summary.
2. Run checks. Execute `bun run check:write`, `bun run typecheck`, and `bun run test` when behavior changed.
3. Push branch. Use `git push origin $(git branch --show-current)`.
4. Draft PR body. Follow `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md`.
5. Create PR. Use `gh pr create` with title and body.
6. Set metadata. Assign yourself and add labels if provided.
7. Report result. Share PR number and URL.

## Common Mistakes
- Opening a PR before checks pass.
- Ignoring the PR template or leaving TODOs.
- Missing test status for behavioral changes.
