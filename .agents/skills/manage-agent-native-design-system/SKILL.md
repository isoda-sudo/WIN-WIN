---
name: manage-agent-native-design-system
description: Manage the Agent-Native Design System in this repo. Use when modifying, creating, or reviewing any UI component, page, or layout. This includes adding new Shadcn/UI components, editing files in src/components/, src/app/_components/, or src/app/**/page.tsx, changing design tokens in src/styles/globals.css, or any task involving visual/styling changes. Always invoke this skill before making UI-related code changes to ensure design system consistency.
---

# Agent-Native Design System

## Philosophy

This design system follows the Agent-Native Design System model: **Tokens (values) + Components (behavior) + Skills (process)**.

- **Tokens** define "what values exist" (color, spacing, radius, typography)
- **Components** define "what behaviors exist" (contracts: variants, states, accessibility)
- **Skills** (this file) define "how to use them" (judgment criteria, procedures, guardrails)

Tokens and Components are **static correctness** (Source of Truth). Skills are **dynamic correctness** (decision-making process). All three layers working together create consistent UI.

**Core principle**: Communicate at the abstract level (token names, component names), not the concrete level (raw px values, hex colors). AI produces concrete output; humans design abstract process.

## Sources of Truth

| Layer | Location | Role |
|-------|----------|------|
| Tokens | `src/styles/globals.css` | Named values (`:root` and `.dark`) |
| Components | `src/components/ui/` | Shared UI contracts (Shadcn-based) |
| Design System Page | `src/app/design-system/` | Living reference for visual verification |

Code is the Source of Truth. Figma is for exploration and consensus-building, not the final reference.

## Pre-Implementation Procedure (MANDATORY)

Before writing ANY UI code, follow this sequence:

### Step 1: Understand Intent
- What is the UI trying to achieve?
- What tone/impression should it convey?
- What constraints apply (accessibility, responsiveness, existing patterns)?

### Step 2: Check Existing Tokens
1. Read `src/styles/globals.css` to see available tokens
2. Can an existing token cover this need? Use it
3. Never use raw values (`12px`, `#0066cc`) when a token exists (`--spacing-3`, `--primary`)

### Step 3: Check Existing Components
1. Search `src/components/ui/` for an existing component or variant
2. Can an existing component cover this need? Use it
3. Can an existing component be extended with a new variant? Prefer that over creating new
4. Only create new when existing truly doesn't fit

### Step 4: Implement Using the Design System
- Use tokens via CSS variables or Tailwind token classes
- Use `cn()` for class composition
- Follow component contracts (see below)

### Step 5: Verify
- Check the design-system page (`src/app/design-system/`) visually reflects changes
- Confirm `:root` and `.dark` parity for any new tokens

## Component Contracts

Components are not just code -- they are **contracts** that define must-satisfy behaviors. When using or modifying a component:

- **States**: Every interactive component must handle default, hover, focus, disabled, and (where applicable) loading states
- **Variants**: Differences in appearance are expressed through variants (`variant`, `size`), not per-page custom components
- **Accessibility**: Focus outlines, ARIA attributes, keyboard navigation must be maintained
- **Token consumption**: Colors, spacing, and radii must come from tokens, not hard-coded values

When adding a new Shadcn component: `bunx --bun shadcn@latest add <component>`. Then customize to align with project tokens.

## Decision Rules

### When to Reuse vs. Extend vs. Create

```
Existing component covers the need?
  -> YES: Use it as-is
  -> PARTIALLY: Add a variant to the existing component
  -> NO: Does a Shadcn base component exist?
    -> YES: Add it via shadcn CLI, then customize
    -> NO: Create a new component in src/components/ui/
           Document WHY existing components were insufficient
```

### Token Selection Guide

| Context | Token pattern | Example |
|---------|--------------|---------|
| Page/section background | `--background`, `--card` | `bg-background`, `bg-card` |
| Primary actions (CTA) | `--primary` / `--primary-foreground` | `bg-primary text-primary-foreground` |
| Secondary/supporting | `--secondary` / `--secondary-foreground` | `bg-secondary text-secondary-foreground` |
| De-emphasized text | `--muted-foreground` | `text-muted-foreground` |
| Borders & dividers | `--border` | `border-border` |
| Destructive actions | `--destructive` | `bg-destructive text-destructive-foreground` |
| Form inputs | `--input` | `border-input` |
| Focus rings | `--ring` | `ring-ring` |
| Corner rounding | `--radius-sm/md/lg/xl` | `rounded-lg` |
| Shadows | `--shadow-xs` to `--shadow-2xl` | `shadow-md` |

### Spacing

Use Tailwind's spacing scale (based on `--spacing: 0.25rem`). Prefer consistent spacing units:
- Tight: `gap-1` to `gap-2` (4-8px)
- Standard: `gap-3` to `gap-4` (12-16px)
- Loose: `gap-6` to `gap-8` (24-32px)
- Section-level: `gap-12` or more (48px+)

## Handling Exceptions

When the existing design system doesn't cover a requirement:

1. **Document why** existing tokens/components are insufficient (as a code comment or PR description)
2. **Propose an addition** rather than a one-off workaround:
   - New token? Add to both `:root` and `.dark` with `@theme inline` mapping
   - New component? Follow Shadcn patterns; place in `src/components/ui/`
   - New variant? Extend the existing component's variant definitions
3. **Update the design-system page** to reflect the new addition
4. **Never silently hard-code** a raw value as a shortcut

## Token Change Workflow

1. Check if an existing token can be reused
2. Update `:root` and `.dark` values in `src/styles/globals.css` (always both)
3. If adding a new token, map it in the `@theme inline` section
4. Update the design-system page to show the new/changed token
5. Verify dark mode parity visually

## Component Change Workflow

1. Check `src/components/ui/` for existing component/variant
2. If new, add via `bunx --bun shadcn@latest add <component>`
3. Customize to consume project tokens (replace any hard-coded values)
4. Ensure contract compliance: states, sizes, variants, accessibility
5. If product-specific, wrap in `src/components/` and keep the base in `ui/`
6. Update `src/app/design-system/components/page.tsx` with usage examples

## Review Checklist

- [ ] No raw color/spacing values when a token exists
- [ ] `:root` and `.dark` both updated for any new token
- [ ] Component variants cover common states (hover, focus, disabled, loading)
- [ ] Accessibility maintained (focus outlines, ARIA, keyboard nav)
- [ ] Design-system page reflects the change
- [ ] No per-page/per-screen custom components that should be shared variants
- [ ] Exception is documented if existing system was insufficient

## Feedback Loop (Resilience)

When implementation drift is detected during review:

1. **Fix the immediate issue** in the code
2. **Analyze the root cause**: Why did the drift happen? Was a rule unclear? Was a token missing?
3. **Update this Skill** if the cause was an unclear or missing guideline
4. **Add a token or variant** if the cause was a gap in the design system

This ensures the same drift doesn't recur. The design system evolves through use, not just upfront design. Skills are a **learning device**, not a static document.

## Common Mistakes

- Adding tokens without dark-mode parity
- Hard-coding values (`text-[#333]`, `p-[12px]`) instead of using tokens (`text-foreground`, `p-3`)
- Creating per-screen components instead of extending shared ones with variants
- Changing component behavior without updating the design-system page
- Skipping Step 2-3 (existing check) and jumping straight to new implementation
- Making a one-off workaround without documenting why existing system was insufficient
