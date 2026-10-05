# Claude Code Configuration

## Project Overview

construct-pro-next is the Next.js/tRPC rewrite of construct-pro, the internal business management system built for 株式会社WIN WIN (a construction company). It replaces order/project intake, subcontractor purchase orders, payment tracking, and receipt reconciliation that used to run across six disconnected Excel files.

This project is a from-scratch reimplementation of an existing, currently-live Express + vanilla HTML/JS system (`~/construct-pro`), targeting functional parity plus two deliberate improvements: httpOnly-cookie session storage (replacing localStorage JWT) and a working email-send flow for purchase orders/invoices (the old system's send buttons were disabled stubs). See `/Users/hiromu.umeda/.claude/plans/mutable-gliding-metcalfe.md` for the full migration plan, phase breakdown, and the three deliberately-unresolved decisions (file storage location, notification read-state scope, history-screen RBAC granularity) that still need the client's input.

Same Supabase Postgres instance and schema as the old app (no data migration) — see `src/server/db/schema.ts` once authored, cross-checked against `~/construct-pro/supabase/schema.sql` and `server.js`'s `ensureAux()` block (the real live schema, since it drifts from the seed file).

## Tech Stack

- **Next.js** - Full-stack React framework with App Router
- **TypeScript** - Type-safe JavaScript development
- **Tailwind CSS** - Utility-first CSS framework
- **tRPC** - End-to-end type-safe API communication
- **Ultracite** - AI-ready code formatter and linter (built on Biome)
- **Zod** - TypeScript-first schema validation
- **Vitest** - Fast unit testing framework
- **Shadcn/UI** - Customizable UI components
- **Drizzle ORM** - `postgres` (postgres.js) driver, `{ prepare: false }` (Supabase pooler is transaction-mode PgBouncer)
- **pdfkit** - PDF generation (purchase orders, invoices, estimates), Node runtime only
- **nodemailer** - SMTP email send (purchase order / invoice / estimate send flows)

## Essential Commands

### Package Management
- `bun install` - Install dependencies
- `bun add {packages}` - Add new packages
- `bunx --bun shadcn@latest add {components}` - Add Shadcn/UI components

### Development
- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run start` - Start production server

### Code Quality
- `bun run check` - Check code quality with Ultracite
- `bun run check:write` - Auto-fix code issues with Ultracite
- `bun run check:unsafe` - Apply unsafe fixes with Ultracite
- `bun run typecheck` - Run TypeScript type checking

### Testing
- `bun run test` - Run unit tests with Vitest

### Git Hooks
- Git hooks are automatically installed via `bun install` (postinstall script)
- Hooks run Ultracite formatting and TypeScript type checking on pre-commit

### GitHub Operations
- `gh issue list` - List GitHub issues
- `gh pr list` - List pull requests
- `gh pr create` - Create new pull request
- `gh issue create` - Create new issue

## Code Style Guidelines

### Coding Principles
- **Readability First**: Code should be easily understandable by other developers
- **Type Safety**: Leverage TypeScript's type system for better development experience
- **Consistent Naming**: Use descriptive names for variables, functions, and components
- **Effective Comments**: Explain "why" not "what" - focus on intent and context

### File Organization
- Use kebab-case for file names (e.g., `user-profile.tsx`)
- Place components in appropriate directories (`src/components/` for shared, `src/app/_components/` for app-specific)
- Mirror test file structure in `__tests__/` directory
- Follow Next.js App Router conventions for routing

### Import/Export Style
- Use ES modules (import/export) syntax, not CommonJS (require)
- Prefer destructuring imports when possible (e.g., `import { Button } from './button'`)
- Use default exports for pages and main components
- Use named exports for utilities and shared functions

### Component Development
- Use TypeScript interfaces for props definition
- Implement proper error boundaries for robust UX
- Follow React best practices (hooks rules, component composition)
- Use Shadcn/UI components as base for custom UI elements
- Follow the design system documented in `src/app/design-system/` for all UI implementations
- Use design tokens defined in `src/styles/globals.css` for consistent styling across the application
- **MANDATORY**: Before any UI-related change (new components, styling updates, layout modifications, page creation), invoke the `manage-agent-native-design-system` skill to ensure design system consistency. This applies to all files in `src/components/`, `src/app/_components/`, page files, and `src/styles/`.

## Testing Guidelines

### Test-Driven Development (TDD) - t-wada Style
**MANDATORY**: Always follow t-wada's TDD methodology when implementing new features or fixing bugs.

**Red-Green-Refactor Cycle**:
1. **Red**: Write a failing test that describes the desired behavior
2. **Green**: Write the minimal code that makes the test pass
3. **Refactor**: Improve code quality while keeping tests green

**Core Principles**:
- Never write production code without a failing test first
- Write the simplest code that passes the test (avoid over-engineering)
- Take small, incremental steps (one test case at a time)
- Use descriptive test names that express behavior, not implementation
- Focus on what the code should do, not how it does it
- Triangulate when discovering the right abstraction (add multiple test cases)

**Implementation Order**:
1. Start with the simplest failing test case
2. Make it pass with minimal code
3. Add more test cases to drive out edge cases and abstractions
4. Refactor only when tests are green
5. Repeat for each new behavior

### Unit Testing with Vitest
- Test files should be placed in `__tests__/` directory
- Use `.test.ts` or `.test.tsx` extensions
- Follow Given-When-Then pattern for test structure
- Mock external dependencies appropriately using `vi.mock()`

### Best Practices
- Each test should be independent and isolated
- Use descriptive test names that explain what is being tested
- Test both happy paths and error cases
- Prefer integration tests over unit tests for React components

## Architecture Decision Records (ADR)

### When to Write an ADR
Record an ADR whenever you make a decision that future contributors would need context to understand, including:
- Adopting a new library or framework
- Choosing or changing an architectural pattern
- Making a significant API or data model decision
- Reversing or superseding an existing decision

Skip ADRs for routine implementation details, bug fixes, or changes that don't affect how future work is approached.

### How to Write an ADR
- Use `docs/adr/template.md` as the starting point for every new record
- Follow the rules and numbering/index conventions in `docs/adr/README.md`
- **MANDATORY**: Use the `manage-adr` skill to record ADRs; it encodes the correct workflow and file naming
- Read existing ADRs under `docs/adr/` before starting implementation work to confirm your approach doesn't contradict a prior decision
- Include the new or updated ADR in the same pull request as the code change it documents

## API Development with tRPC

### Creating New API Endpoints
1. Create router files in `src/server/api/routers/`
2. Define procedures with proper input validation using Zod
3. Register routers in `src/server/api/root.ts`
4. This template ships without an auth mechanism, so `src/server/api/trpc.ts` only defines `publicProcedure`; use it for all endpoints
5. When introducing auth, define a `protectedProcedure` in `src/server/api/trpc.ts` that validates the auth context, and record that design decision as an ADR (use the `manage-adr` skill)

### Type Safety
- All API inputs/outputs are automatically type-safe
- Use Zod schemas for runtime validation
- Leverage tRPC's React Query integration for client-side data fetching

## Project Structure

```
src/
├── app/              # Next.js App Router pages and layouts
│   ├── _components/  # App-specific components
│   ├── api/          # API routes (including tRPC)
│   └── ...           # Page routes
├── components/       # Shared UI components
│   └── ui/           # Shadcn/UI components
├── lib/              # Utility functions and shared logic
├── server/           # Server-side logic and tRPC API definitions
│   └── api/          # tRPC routers and procedures
├── styles/           # Global styles
└── trpc/             # tRPC client configuration
```

## Important Notes

- Always run type checking after making changes: `bun run typecheck`
- Use Ultracite for consistent code formatting: `bun run check:write`
- Prefer running single tests during development for performance
- Keep dependencies up to date using Dependabot PRs
- Follow the existing patterns in the codebase for consistency
- Record architectural decisions in docs/adr/ (use the manage-adr skill)

## Claude AI Guidance

### Custom Instructions for Development
Follow these guidelines when assisting with code generation, reviews, or modifications:

- **Coding Principles**: Prioritize understandability in code. Use meaningful names for variables/functions. Add comments explaining 'why' not 'what'. Format code consistently with proper indentation and grouping. Simplify control flows using guards and early returns. Decompose complex logic into smaller parts. Optimize variable scopes and eliminate unnecessary temporaries. Include tests and examples to demonstrate intent.

- **UI/UX Design**: Design user-centered interfaces with clarity, simplicity, consistency, and efficiency. Follow visual hierarchy, thoughtful color/typography, intuitive interactions, accessibility (WCAG), and responsive design. Use shadcn/ui for components and adhere to component-driven design. **IMPORTANT**: Follow the design system documented in `src/app/design-system/` and use design tokens from `src/styles/globals.css` for all UI implementations to ensure consistency. **MANDATORY**: Always invoke the `manage-agent-native-design-system` skill before any UI/styling/component work.

- **Package Management**: Use bun for all package operations: `bun add {packages}` for adding, `bun install` for dependencies. For UI components: `bunx --bun shadcn@latest add {components}`.

- **Testing**: Use Vitest for unit tests. Place tests in __tests__ with .test.ts(x) naming. Ensure test independence, readability (Given-When-Then), proper mocking, assertions, and coverage of error cases.

- **Linting and Formatting**: Use Biome via `bun run check:write` for safe fixes. Avoid violations like noForEach, noUnusedVariables, useExhaustiveDependencies, noExplicitAny.

- **Documentation**: Update docs/ when code changes, especially docs/directory-structure.md for structure updates.

- **General**: Prevent duplicates by checking existing implementations. Follow TDD (Red-Green-Refactor). Use GitHub CLI for issues/PRs.

These instructions ensure consistency in both CI/CD and local development.

