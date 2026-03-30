# Phase 3: Flag Type Generation - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a Command Palette entry "PostHog: Generate Flag Types" that generates TypeScript type definitions from live PostHog flag data into a `.posthog.d.ts` file in the workspace root. This is a pure additive feature — new service + new command + new constant. No modifications to existing features.

</domain>

<decisions>
## Implementation Decisions

### Generated file structure
- Output file: `.posthog.d.ts` in workspace root (via `vscode.workspace.fs.writeFile`, NOT Node `fs` — must work in remote workspaces)
- File contains a namespace `PostHogFlags` with a type per flag key
- Flags without payloads: type is `boolean`
- Flags with JSON payloads in `filters.payloads`: infer TypeScript interface from the JSON shape
- Include a header comment with generation timestamp and flag count
- Overwrite on each generation (idempotent)

### Type inference from payloads
- Use template literal string building (no ts-morph or AST library — research confirmed this is sufficient)
- For each flag, check `flag.filters.payloads` for variant payload definitions
- JSON `string` → `string`, `number` → `number`, `boolean` → `boolean`, `null` → `null`
- JSON `array` → infer element types, use `Type[]`
- JSON `object` → generate inline interface
- Nested objects: generate nested inline types (max 3 levels deep, then `Record<string, unknown>`)
- If payload is unparseable or missing: fall back to `unknown`

### Command behavior
- Command ID: `posthog.generateFlagTypes` registered in package.json and constants.ts
- Command title: "PostHog: Generate Flag Types"
- Guard: must be authenticated and have a project selected
- If no flags in cache: show `vscode.window.showInformationMessage("No feature flags found. Refresh flags first.")`
- If cache has flags: generate file, show success message with file path
- Open the generated file in editor after creation

### Service architecture
- New file: `src/services/codegenService.ts` — pure function `generateFlagTypes(flags: FeatureFlag[]): string`
- No VS Code API calls in the service — keeps it testable
- Command handler in `src/commands/featureFlagCommands.ts` — handles file write and UI feedback
- Wire command in `extension.ts` activate()

### Claude's Discretion
- Exact TypeScript formatting and indentation in generated file
- How to handle edge cases (duplicate keys, special characters in flag names)
- Whether to add JSDoc comments per flag type
- Exact info/success message wording

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Type system
- `src/models/types.ts` — `FeatureFlag` interface with `filters: Record<string, unknown>` (payload data lives in `filters.payloads`)
- `src/services/flagCacheService.ts` — `getFlags()` returns `FeatureFlag[]`, `getFlag(key)` returns single flag

### Command registration pattern
- `src/commands/featureFlagCommands.ts` — existing flag commands pattern to follow
- `src/constants.ts` — command ID constants
- `src/extension.ts` — command registration in `activate()`
- `package.json` — command contributions

### Requirements
- `.planning/REQUIREMENTS.md` — CGEN-01, CGEN-02, CGEN-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FlagCacheService.getFlags()`: returns all flags with full filter data
- `FlagCacheService.getFlagKeys()`: returns just keys (for validation)
- `registerFeatureFlagCommands()` pattern: returns `vscode.Disposable[]`, takes auth/postHog/sidebar/flagCache

### Established Patterns
- Commands registered via `registerXxxCommands()` functions that return disposable arrays
- Command IDs stored in `Constants.Commands` object
- `package.json` contributes.commands array for Command Palette entries
- Guards: `authService.isAuthenticated()` + `authService.getProjectId()` checks before API-dependent operations

### Integration Points
- `extension.ts`: add command registration in `context.subscriptions.push(...registerFeatureFlagCommands(...))`
- `constants.ts`: add `GENERATE_FLAG_TYPES` command ID
- `package.json`: add command contribution
- `featureFlagCommands.ts`: add command handler that calls `codegenService.generateFlagTypes()`

</code_context>

<specifics>
## Specific Ideas

- Research confirmed this is a genuine differentiator — no competitor has it
- Template literals are the right approach (no ts-morph needed for simple JSON→TS mapping)
- Must use `vscode.workspace.fs.writeFile` (not Node `fs`) for remote workspace compatibility

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-flag-type-generation*
*Context gathered: 2026-03-30*
