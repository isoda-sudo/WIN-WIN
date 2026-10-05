---
name: commit-changes
description: Use when asked to commit changes in this repo, including running required checks, staging updates, and writing a Conventional Commit message.
---

# Commit Changes

## Overview
Commit changes with required quality checks, consistent formatting, and a Conventional Commit message.

## Workflow
1. Review status. Show staged and unstaged diffs.
2. Run checks. Use `bun run check:write` and `bun run typecheck`. Run tests if the change affects behavior.
3. Stage changes. Use `git add .` or selective staging when needed.
4. Compose commit. Use Conventional Commits and include issue references if provided.
5. Confirm summary. Report the commit hash and short summary.

## Commit Message Template

```text
<type>: <説明>

<詳細>

Refs #<Issue番号>
```

## Common Mistakes
- Committing without running `bun run check:write` and `bun run typecheck`.
- Using vague commit subjects like "update" or "fix".
- Bundling unrelated changes into one commit.
