---
name: create-github-issue
description: Use when asked to create a GitHub issue for bugs, enhancements, docs, or chores, including searching for duplicates and documenting context.
---

# Create GitHub Issue

## Overview
Create a well-scoped issue with context, acceptance criteria, and related files.

## Workflow
1. Search duplicates. Use `gh issue list --search` with the topic.
2. Locate context. Identify related files and recent changes.
3. Draft issue. Include summary, acceptance criteria, and related files.
4. Create issue. Use `gh issue create` with title and body.
5. Label issue. Add a type label that matches the request.
6. Report result. Share issue number and URL.

## Common Mistakes
- Skipping duplicate search.
- Missing acceptance criteria.
- Omitting related file paths.
