# Project: Uniflow

## Execution Rules & Session Behavior
- **Explicit Constraints Only**: Follow instructions exactly as written. Never execute unrequested work, guess missing parameters, or assume features are wanted unless explicitly written in the prompt.
- **Context Continuity**: Track this session as "Project: Uniflow". Reuse established context (Django 5 + DRF, React 19 + Vite, PostgreSQL, Dexie IndexedDB) instead of re-asking setup questions.
- **Scope Locking**: If a request drifts outside this project's scope (e.g. into premature CMS, POS, multi-tenancy, Redis, or microservices), stop immediately and confirm before proceeding. Do not silently cross-contaminate project contexts.
- **Tool Efficiency**: Minimize tool calls and turns. Use tools with high intent to respect rate limits (60 requests/min, 1,000/day). Activate only the skills/tools explicitly needed for the immediate step.
- **Commit Authorization Gate**: NEVER execute `git commit` automatically unless the user explicitly grants permission in that prompt (e.g. "commit them for me", "Yes, commit this"). Always present the proposed commit command, files, and commit message first so the user can inspect, review, or edit before committing.
- **File-by-File Atomic Commits**: Commit changes file-by-file with individual, focused commit messages rather than bundling multiple files into a single commit. This ensures granular version control history and makes it safe and trivial to revert any specific file without rolling back adjacent files.

## Coding Philosophy & Rigor
- **Simplicity Over Cleverness**: Write simple, direct, readable code over hyper-efficient, library-heavy, or clever solutions. 
- **Structural Cleanliness**: Keep functions small (under 30 lines) and single-purpose. Use guard clauses to eliminate nested logic. Do not introduce design patterns (factories, strategies) until at least 2–3 explicit duplicate cases demand them.
- **Efficiency Metrics**: Avoid runtime overhead in hot paths (e.g., reallocating inside loops, compiling regex repeatedly, running redundant DB queries). Do not sacrifice readability for micro-optimizations unless a measurable performance bottleneck is proven.
- **Defensive Reliability**: Handle failure and edge cases explicitly. Do not use silent fallbacks. In inventory mutations, always wrap in `transaction.atomic()` with `select_for_update()` row locks and reject negative balances safely.
- **Style Reusability**: Centralize global UI/UX variables (colors, spacing, typography) in a single, shared style dictionary / Tailwind design tokens. Check for existing components in `components/ui/` before writing a new one.

## Frontend Component Modularity & Unified Design System
- **Strict Directory Boundaries**: Structure frontend strictly according to `Plan/Master_plan.md`:
  - `src/components/ui/`: Unified design primitives (Button, Input, Card, Badge, Dialog, Table, Dropdown).
  - `src/components/forms/`, `src/components/tables/`, `src/components/feedback/`: Reusable specialized structural components.
  - `src/modules/<domain>/`: Domain-specific views and containers (auth, dashboard, catalog, inventory, suppliers, purchasing, reports, settings).
  - `src/services/` & `src/offline/`: API transport, outbox queue, and sync engine. Never couple data-fetching or Dexie calls directly inside visual presentation components.
- **Zero One-Off Styled Elements**: All views must use the unified primitives from `src/components/ui/` (e.g. `<Button>`, `<Card>`, `<Input>`). Never create ad-hoc raw `<button className="...">` or `<input className="...">` with custom styles inside domain views.
- **Composition Over Configuration**: Build composable primitives (e.g. `<Card><CardHeader><CardTitle>...</CardTitle></CardHeader><CardContent>...</CardContent></Card>`) using `cn()` from `@/lib/utils` rather than monolithic prop-heavy components.
- **Container vs. Presentation Separation**: In domain modules, separate data orchestration/mutations (containers/hooks) from pure visual rendering components so components are easy to test and modify.

## Absolute Scope Discipline
- **Minimum Viable Change**: Write the absolute minimum code required to solve the task at hand. **Never refactor adjacent code, add unrequested features, or anticipate future requirements (Strict YAGNI).**
- **Modification Limits**: Bound multi-file changes to a maximum of 2–5 files per session. If a task requires more, pause execution and propose explicit stages.
- **Architectural Gates**: If a task requires touching files outside the immediate instruction scope or forces a major architectural decision, stop and ask the user for permission.
- **Analytical Loop**: If multiple valid solutions exist, state the trade-offs and your chosen direction in a single concise sentence before coding. Do not choose silently.

## Factual Grounding & Anti-Hallucination
- **Zero Fabrications**: Do not invent APIs, external libraries, parameters, or codebase paths. If you lack information or the codebase state is hidden, say "I don't know" or "Context missing."
- **Strict Verification**: Never reference a file, line number, or URL unless you have directly opened, read, or fetched it during this active session.
- **Verbatim Accuracy**: Copy numbers, configuration tokens, statistics, and code identifiers exactly as they appear in the source files. No rounding or approximations.

## Code Review Strictness
Flag by default during automated code evaluations:
- Any function exceeding 30 lines of active logic.
- Any block of identical or highly similar logic duplicated across 2+ files.
- Any missing catch blocks or unhandled errors on network, database, or disk I/O calls.

## Refactoring Classification Checklist
- **Clarity Adjustments**: Guard clauses, extracted methods, consolidated conditionals -> Tag as `"Clarity: No runtime change"`.
- **Performance Adjustments**: Hoisted constants, batched N+1 queries, cheap-checks-first -> Tag as `"Performance: Runtime impact"`.

## Explaining Changes
- For every modified file, provide a 1-sentence summary detailing **what** changed, **why** it changed, and **how** it safely integrates with the codebase. Do not dump naked diffs.
