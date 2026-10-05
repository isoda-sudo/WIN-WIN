---
name: project-kickoff
description: Use when starting a new project from this template, or when asked to do the initial setup or customization of the template, to replace template-specific content with the real project's details and verify the baseline builds.
---

# Project Kickoff

## Overview
Turn this Next.js/T3 template into a concrete project. Replace template placeholder content across metadata, docs, and configuration, decide what sample code to keep, and confirm the baseline is healthy before the first commit. Work through the checklist top to bottom.

## Workflow
1. Rename the package. In `package.json`, change the `name` field from the template name to the new project name.
2. Update the project overview in `CLAUDE.md`. Rewrite the `## Project Overview` section to describe the real project (purpose, features, goals) and delete the template `> Note` about updating this section.
3. Update the project overview in `AGENTS.md`. Rewrite its `Project Overview` section to match the real project, consistent with `CLAUDE.md`.
4. Rewrite the READMEs. Update `README.md` for the project. If the localized variants `README.en.md` and `README.vi.md` are needed, update them too; if they are not needed, delete them (and remove any links to them).
5. Configure environment variables. Review `.env.example`, add the environment variables the project needs, and mirror every one of them in the schema in `src/env.js` (both the `server`/`client` schema and the `runtimeEnv` mapping). Never read env vars directly via `process.env` — always go through `src/env.js`.
6. Review existing ADRs. Read the existing ADRs in `docs/adr/` (for example `0001`–`0004`). If the project changes any decision recorded there (swapping part of the stack, etc.), record it with a new ADR that supersedes the old one — do not silently diverge. Use the `manage-adr` skill for this.
7. Confirm sample code disposition with the user. Ask whether to keep or remove the sample/demo code (for example `src/app/design-system/` and related demo pages). Do not delete it unprompted.
8. Verify the baseline is healthy. Run the following and fix any failures before committing:
   ```bash
   bun install
   bun run check
   bun run typecheck
   bun run test
   ```
9. Make the initial commit. Once the checklist is done and checks pass, create the first commit for the customized project.

## Common Mistakes
- Leaving the template `> Note` and generic overview text in `CLAUDE.md` (and `AGENTS.md`) instead of describing the real project.
- Adding a variable to `.env.example` but not updating `src/env.js`, or referencing env vars directly through `process.env` instead of `src/env.js`.
- Changing part of the tech stack without recording it via a superseding ADR, leaving the ADRs inconsistent with reality.
- Deleting sample code (or keeping it) without first confirming with the user.
- Forgetting to rename `package.json` `name`, or leaving unused localized READMEs and dead links behind.
- Committing before `bun run check`, `bun run typecheck`, and `bun run test` all pass.
