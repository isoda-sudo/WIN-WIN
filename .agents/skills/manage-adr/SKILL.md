---
name: manage-adr
description: Use when making a design decision, choosing or changing technology/architecture, or when an ADR or decision record is mentioned, to create or update Architecture Decision Records under docs/adr/.
---

# Manage ADR

## Overview
Record significant design decisions as Architecture Decision Records (ADRs) in `docs/adr/`. Each ADR captures the context, the decision, and its consequences so future contributors understand why the codebase is the way it is. ADR files themselves are written in Japanese; keep them in the same PR as the code change they describe.

## Workflow
1. Review existing ADRs. List them and read the ones related to your change so the new decision does not contradict a past one.
   ```bash
   ls docs/adr/
   ```
   Read every related ADR (for example the ones touching the same stack, layer, or feature) before deciding.
2. Decide whether an ADR is warranted. Consult the criteria in `docs/adr/README.md`. Write an ADR when the decision is architecturally significant, hard to reverse, or affects many parts of the system (framework/library selection, data model, API boundaries, auth strategy, directory conventions, etc.). Skip the ADR for trivial or easily reversible changes (renaming a variable, formatting, dependency bumps, small bug fixes). If in doubt and the change matches the README criteria, write one.
3. Assign the next number. Take the highest existing ADR number and add 1, zero-padded to 4 digits (`0001`, `0002`, ...).
   ```bash
   ls docs/adr/ | grep -E '^[0-9]{4}-' | sort | tail -n 1
   ```
   If no numbered ADR exists yet, start at `0001`.
4. Copy the template and fill in every section. Do not leave placeholders.
   ```bash
   cp docs/adr/template.md docs/adr/NNNN-short-kebab-title.md
   ```
   Replace `NNNN` with the number from step 3 and use a short kebab-case English slug for the filename. Fill in all sections (context, decision, status, consequences, alternatives considered, etc.). Write the ADR body in Japanese.
5. Set the status. For a brand-new decision, set the status to `提案中 (Proposed)`. After the PR is reviewed and approved, update it to `承認 (Accepted)`.
6. Handle superseded decisions. If this decision reverses a previous one, create a new ADR (do not edit the old decision text). Then update only the status line of the old ADR to `置換 (Superseded by ADR-NNNN)`, pointing at the new ADR number. Never rewrite the body of the old ADR — it must remain a faithful record of what was decided at the time.
7. Update the index. Add a row for the new ADR to the index table in `docs/adr/README.md` (number, title, status, date). If you superseded an old ADR, update its status in the same table.
8. Commit ADRs with the code. Include the ADR (and any index/status updates) in the same PR as the implementation change it justifies, so the decision and its realization land together.

## Common Mistakes
- Forgetting to add the new ADR row to the `docs/adr/README.md` index table.
- Rewriting the body of an old ADR instead of only updating its status to `置換 (Superseded by ADR-NNNN)`.
- Implementing the change first and forgetting to write the ADR, or writing it in a separate PR.
- Writing an ADR for a trivial or easily reversible change that does not meet the README criteria.
- Reusing an existing number or skipping the zero-padding, causing collisions or mis-sorted files.
- Writing the ADR body in English instead of Japanese.
- Leaving the status as `提案中 (Proposed)` after the PR has been approved.
