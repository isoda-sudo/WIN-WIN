---
name: review-github-pr
description: Use when asked to review a GitHub pull request, including running a structured review and issuing approve/request-changes/comment outcomes.
---

# Review GitHub PR

## Overview
Deliver a structured PR review with clear verdicts and actionable feedback.

## Workflow
1. Prefer a review skill if available. Use any installed PR review skill first.
2. Collect context. Run `gh pr view` and `gh pr diff` for the PR.
3. Review for correctness. Check logic, error handling, types, security, and tests.
4. Check project standards. Confirm conventions in `AGENTS.md`.
5. Decide verdict. Approve, request changes, or comment.
6. Post review. Use `gh pr review` with the chosen verdict.
7. Report summary. Provide key findings and next steps.

## Review Checklist
- Logic correctness and edge cases
- Error handling and type safety
- Security and data exposure risks
- Tests added or updated
- Performance or regression risks

## Common Mistakes
- Approving without checking tests.
- Ignoring repo conventions.
- Leaving feedback without a clear verdict.
