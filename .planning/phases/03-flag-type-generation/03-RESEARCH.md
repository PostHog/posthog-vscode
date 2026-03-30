# Phase 3: Flag Type Generation - Research

**Researched:** 2026-03-30
**Domain:** VS Code extension command + TypeScript code generation from PostHog flag payloads
**Confidence:** HIGH

## Summary

This phase adds a single Command Palette entry that generates a `.posthog.d.ts` declaration file from live flag data held in `FlagCacheService`. The domain is narrow and well-bounded: one new service, one new command handler, three file touch-points (constants, package.json, extension.ts), and no modifications to existing features.

All design decisions are locked in CONTEXT.md. Research focused on verifying the exact runtime shape of `filters.payloads`, confirming the correct VS Code API for remote-safe file writes, identifying TypeScript identifier edge cases, and mapping the exact integration points against live source files.

The `codegenService.ts` function is a pure string-building function with zero VS Code dependencies, making it the only unit in this phase that can be directly unit-tested with Node.js alone (no Extension Development Host required).

**Primary recommendation:** Implement `generateFlagTypes(flags: FeatureFlag[]): string` as a pure function, filter deleted flags, parse each `filters.payloads` value with `JSON.parse` inside a try/catch, infer TypeScript types via recursive template literal builder with a depth cap at 3, then write via `vscode.workspace.fs.writeFile(Uri, Buffer.from(output, 'utf8'))`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Generated file structure**
- Output file: `.posthog.d.ts` in workspace root (via `vscode.workspace.fs.writeFile`, NOT Node `fs` — must work in remote workspaces)
- File contains a namespace `PostHogFlags` with a type per flag key
- Flags without payloads: type is `boolean`
- Flags with JSON payloads in `filters.payloads`: infer TypeScript interface from the JSON shape
- Include a header comment with generation timestamp and flag count
- Overwrite on each generation (idempotent)

**Type inference from payloads**
- Use template literal string building (no ts-morph or AST library — research confirmed this is sufficient)
- For each flag, check `flag.filters.payloads` for variant payload definitions
- JSON `string` → `string`, `number` → `number`, `boolean` → `boolean`, `null` → `null`
- JSON `array` → infer element types, use `Type[]`
- JSON `object` → generate inline interface
- Nested objects: generate nested inline types (max 3 levels deep, then `Record<string, unknown>`)
- If payload is unparseable or missing: fall back to `unknown`

**Command behavior**
- Command ID: `posthog.generateFlagTypes` registered in package.json and constants.ts
- Command title: "PostHog: Generate Flag Types"
- Guard: must be authenticated and have a project selected
- If no flags in cache: show `vscode.window.showInformationMessage("No feature flags found. Refresh flags first.")`
- If cache has flags: generate file, show success message with file path
- Open the generated file in editor after creation

**Service architecture**
- New file: `src/services/codegenService.ts` — pure function `generateFlagTypes(flags: FeatureFlag[]): string`
- No VS Code API calls in the service — keeps it testable
- Command handler in `src/commands/featureFlagCommands.ts` — handles file write and UI feedback
- Wire command in `extension.ts` activate()

### Claude's Discretion
- Exact TypeScript formatting and indentation in generated file
- How to handle edge cases (duplicate keys, special characters in flag names)
- Whether to add JSDoc comments per flag type
- Exact info/success message wording

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CGEN-01 | User can generate TypeScript type definitions from flag payloads via Command Palette | `posthog.generateFlagTypes` command registered in package.json + constants.ts; command handler in featureFlagCommands.ts calls codegenService |
| CGEN-02 | Generated types are written to a `.posthog.d.ts` file in the workspace root | `vscode.workspace.fs.writeFile` with `vscode.workspace.workspaceFolders[0].uri` + `vscode.Uri.joinPath`; confirmed as the remote-safe API |
| CGEN-03 | Generated types include all active flag keys with their payload shapes | Filter `!flag.deleted` from `FlagCacheService.getFlags()`; parse `filters.payloads` per flag; infer TS types via recursive template builder |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vscode` API | built-in | `workspace.fs.writeFile`, `window.showTextDocument`, `Uri` | Only correct way to write files in remote/WSL/codespaces workspaces |
| TypeScript template literals | language | String-building for `.d.ts` output | No deps, fully sufficient for depth-capped JSON→TS inference |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Buffer.from(str, 'utf8')` | Node built-in | Convert string to `Uint8Array` for `workspace.fs.writeFile` | Always — `writeFile` requires `Uint8Array` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Template literal builder | ts-morph | ts-morph is correct for complex AST manipulation but is a heavyweight dep (>1MB) and unnecessary for simple JSON→TS scalar mapping |
| `vscode.workspace.fs.writeFile` | Node `fs.writeFileSync` | Node fs breaks remote workspaces (SSH, Codespaces, WSL) — locked decision |

**Installation:** No new dependencies required.

---

## Architecture Patterns

### Recommended Project Structure

The phase is additive only — no structural changes. New files slot into existing patterns:

```
src/
├── services/
│   └── codegenService.ts     ← NEW: pure function, no VS Code imports
├── commands/
│   └── featureFlagCommands.ts ← MODIFIED: add generateFlagTypes command handler
├── constants.ts               ← MODIFIED: add GENERATE_FLAG_TYPES command ID
└── extension.ts               ← MODIFIED: wire new command in activate()
.posthog.d.ts                  ← GENERATED: output artifact (workspace root)
package.json                   ← MODIFIED: add command contribution
```

### Pattern 1: Pure Service Function

**What:** `codegenService.ts` exports a single function with no VS Code API imports. It takes `FeatureFlag[]` and returns a `string`. This matches the project's "data layer has no VS Code UI" principle.

**When to use:** Always for logic that can be tested without launching an Extension Development Host.

```typescript
// src/services/codegenService.ts
import { FeatureFlag } from '../models/types';

export function generateFlagTypes(flags: FeatureFlag[]): string {
    const active = flags.filter(f => !f.deleted);
    // ... build string output
    return output;
}
```

### Pattern 2: Command Handler with File Write

**What:** The command handler in `featureFlagCommands.ts` does all VS Code API work: guards, file write, messages, open file. Follows the existing `createFlag` command handler shape exactly.

**When to use:** All VS Code-dependent operations stay in the command layer, not the service layer.

```typescript
// Inside registerFeatureFlagCommands(), alongside existing commands
const generateTypes = vscode.commands.registerCommand(Commands.GENERATE_FLAG_TYPES, async () => {
    if (!authService.isAuthenticated() || !authService.getProjectId()) {
        vscode.window.showErrorMessage('PostHog: Please sign in first.');
        return;
    }

    const flags = flagCache?.getFlags() ?? [];
    const active = flags.filter(f => !f.deleted);
    if (active.length === 0) {
        vscode.window.showInformationMessage('No feature flags found. Refresh flags first.');
        return;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('PostHog: No workspace folder open.');
        return;
    }

    const output = generateFlagTypes(active);
    const uri = vscode.Uri.joinPath(folders[0].uri, '.posthog.d.ts');
    await vscode.workspace.fs.writeFile(uri, Buffer.from(output, 'utf8'));
    await vscode.window.showTextDocument(uri);
    vscode.window.showInformationMessage(`PostHog: Generated flag types → .posthog.d.ts (${active.length} flags)`);
});
```

### Pattern 3: Type Inference Builder

**What:** Recursive function that maps a parsed JSON value to a TypeScript type string. Depth-limited to 3 levels.

**When to use:** Called for each flag's payload value during code generation.

```typescript
function inferType(value: unknown, depth = 0): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) {
        if (value.length === 0) return 'unknown[]';
        const elementType = inferType(value[0], depth);
        return `${elementType}[]`;
    }
    if (typeof value === 'object') {
        if (depth >= 3) return 'Record<string, unknown>';
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) return 'Record<string, unknown>';
        const fields = entries.map(([k, v]) => `${safeIdentifier(k)}: ${inferType(v, depth + 1)}`);
        return `{ ${fields.join('; ')} }`;
    }
    return 'unknown';
}
```

### Pattern 4: Flag Key → TypeScript Identifier

**What:** Flag keys from PostHog are kebab-case strings like `"my-new-feature"`. TypeScript namespace members can be quoted property names, but the cleanest approach is quoting all keys that contain non-identifier characters.

**When to use:** Always — flag keys are arbitrary strings and must be safely encoded as TypeScript property names.

```typescript
function safePropertyName(key: string): string {
    // If key is a valid identifier, use unquoted; otherwise quote it
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}
```

### Pattern 5: `filters.payloads` Runtime Shape

**Confirmed from source (DetailPanelProvider.ts line 726, 775):**
- `filters.payloads` is `Record<string, unknown>` at the TypeScript level
- Keys are: `"true"` for boolean (non-multivariate) flags; variant keys (e.g., `"control"`, `"test"`) for multivariate flags
- Values are the raw payload — the PostHog API stores them as strings (raw JSON text), but may also be pre-parsed objects depending on API version
- Must `JSON.parse()` inside a try/catch — if already an object, no parse needed; if string, parse it

```typescript
function extractPayloadValue(rawPayload: unknown): unknown {
    if (typeof rawPayload === 'string') {
        try { return JSON.parse(rawPayload); } catch { return undefined; }
    }
    // Already parsed (object/number/boolean/null)
    return rawPayload;
}
```

**For multivariate flags:** the generated type is a union of per-variant types.

```typescript
// Boolean flag with payload:
// filters.payloads = { "true": '{"theme":"dark","version":2}' }
// → type MyFlag = { theme: string; version: number };

// Multivariate flag:
// filters.payloads = { "control": '"baseline"', "test": '{"newUi":true}' }
// → type MyFlag = string | { newUi: boolean };
```

### Pattern 6: Generated File Header

```typescript
// .posthog.d.ts — generated by PostHog for VSCode
// Generated: 2026-03-30T16:24:05.630Z
// Flags: 12
// Do not edit manually — re-run "PostHog: Generate Flag Types" to refresh.

declare namespace PostHogFlags {
    type "my-boolean-flag" = boolean;
    type "my-payload-flag" = { theme: string; version: number };
    type "my-multivariate-flag" = string | { newUi: boolean };
}
```

Note: `declare namespace` with quoted type names is valid TypeScript. Alternatively, the namespace can use a `types` interface or index signature — planner has discretion on exact formatting.

### Anti-Patterns to Avoid

- **Using Node `fs` module:** Breaks remote workspace scenarios (SSH, WSL, Codespaces). Always use `vscode.workspace.fs`.
- **Importing `vscode` in codegenService.ts:** Breaks unit testability. All VS Code API calls must stay in the command handler.
- **Not filtering `deleted` flags:** `FlagCacheService.getFlags()` returns all flags including deleted ones. Filter `!f.deleted` before generating types.
- **Assuming payload values are always parsed objects:** The PostHog API stores payloads as JSON strings. Always attempt `JSON.parse` with a fallback.
- **Not guarding for missing workspace:** `vscode.workspace.workspaceFolders` can be undefined if no folder is open. Guard before accessing `[0]`.
- **Using `flag.active` as the filter:** `active` controls rollout, but deleted flags should be excluded regardless of active status. Use `!flag.deleted`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Remote-safe file write | Node `fs.writeFileSync` | `vscode.workspace.fs.writeFile` | VS Code's FS API handles remote URIs (SSH, WSL, Codespaces) |
| TypeScript AST generation | Custom AST builder | Template literal strings | Sufficient for flat/depth-limited JSON→TS; no added complexity |
| Identifier sanitization | Complex regex parser | `JSON.stringify(key)` for quoting | Handles all Unicode edge cases correctly |

**Key insight:** The scope is narrow enough that template literals are the right tool. Any library that builds TypeScript AST is overengineering for depth-capped JSON scalar mapping.

---

## Common Pitfalls

### Pitfall 1: `filters.payloads` Value Type Ambiguity
**What goes wrong:** Code treats `payloads[key]` as always a string (JSON text) and calls `JSON.parse` on an already-parsed object, producing `[object Object]` in the output.
**Why it happens:** PostHog's API documentation and actual behavior can differ — older endpoints returned pre-parsed objects; newer ones return JSON strings.
**How to avoid:** Check `typeof rawPayload === 'string'` before parsing. If it's already an object/number/boolean, use it directly.
**Warning signs:** `inferType` receives a string like `'{"theme":"dark"}'` instead of `{theme: "dark"}`.

### Pitfall 2: Flag Keys with Special Characters
**What goes wrong:** Flag key `"my-flag"` generates `type my-flag = boolean` which is a TypeScript syntax error (interpreted as subtraction).
**Why it happens:** PostHog allows any string as a flag key including hyphens, dots, slashes.
**How to avoid:** Wrap all non-identifier keys in quotes: `type "my-flag" = boolean`. Use `safePropertyName()` on every key.
**Warning signs:** TypeScript errors in the generated file when opening it.

### Pitfall 3: Missing Workspace Folder Guard
**What goes wrong:** `vscode.workspace.workspaceFolders[0]` throws when no folder is open (e.g., extension opened on a single file).
**Why it happens:** Developers opening a single file without a workspace folder.
**How to avoid:** Guard `if (!folders || folders.length === 0)` and show an error message.
**Warning signs:** Uncaught TypeError at runtime.

### Pitfall 4: `flagCache` Optionality
**What goes wrong:** `flagCache` parameter is `FlagCacheService | undefined` in `registerFeatureFlagCommands` signature (confirmed from source: `flagCache?:`). Accessing `flagCache.getFlags()` without a null check throws.
**Why it happens:** The existing function signature makes `flagCache` optional.
**How to avoid:** Use `flagCache?.getFlags() ?? []` in the command handler.
**Warning signs:** Runtime crash when extension activates without cache.

### Pitfall 5: Empty Payload for Boolean Flag
**What goes wrong:** Boolean flag has no entry in `filters.payloads` — code tries to access `payloads["true"]` and gets `undefined`, but the flag still needs a type definition.
**Why it happens:** Flags without any JSON payload simply don't have a `payloads` entry at all, or `payloads["true"]` is `null`/`undefined`.
**How to avoid:** Check if payload is absent or null/undefined first. If so, type is `boolean`.
**Warning signs:** Flags missing from generated file.

### Pitfall 6: Array Element Type Inference on Empty Arrays
**What goes wrong:** `inferType([])` has no elements to inspect and cannot infer element type.
**Why it happens:** Some flags store empty arrays as payloads.
**How to avoid:** Return `unknown[]` when array is empty. This is safe and honest.

---

## Code Examples

Verified patterns from live source code:

### Existing Guard Pattern (from featureFlagCommands.ts)
```typescript
// Source: src/commands/featureFlagCommands.ts line 41-45
const projectId = authService.getProjectId();
if (!projectId) {
    vscode.window.showErrorMessage('PostHog: Please sign in first.');
    return;
}
```

### Existing `filters.payloads` Access (from DetailPanelProvider.ts line 726)
```typescript
// Source: src/views/DetailPanelProvider.ts line 726
const payloads = filters.payloads || {};
// Values accessed as: payloads[variantKey]
// typeof payloads[pk] === 'string' ? payloads[pk] : JSON.stringify(payloads[pk], null, 2)
```

### VS Code File Write (vscode.workspace.fs API)
```typescript
// Source: VS Code API (HIGH confidence — workspace.fs is the documented remote-safe API)
const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.posthog.d.ts');
await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
// Buffer.from() produces a Uint8Array as required by the API
```

### Open File After Write
```typescript
// Source: VS Code API — showTextDocument opens a URI in the editor
const doc = await vscode.workspace.openTextDocument(uri);
await vscode.window.showTextDocument(doc);
```

### Register Command (from extension.ts pattern, line 144)
```typescript
// Source: src/extension.ts line 144
...registerFeatureFlagCommands(authService, postHogService, sidebarProvider, flagCache),
```

### Add Constant (from constants.ts pattern)
```typescript
// Source: src/constants.ts — add alongside existing Commands
export const Commands = {
    // ... existing ...
    GENERATE_FLAG_TYPES: 'posthog.generateFlagTypes',
} as const;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Node `fs` module for file writes | `vscode.workspace.fs` | VS Code Remote development era (~2019) | Required for SSH/WSL/Codespaces compatibility |
| ts-morph for TS code generation | Template literals for simple cases | — | ts-morph only justified for complex refactors, not scalar type mapping |

**No deprecated items affect this phase.**

---

## Open Questions

1. **Multivariate flag type shape — union vs. indexed**
   - What we know: Flags with multiple variants have multiple payload keys (e.g., `control`, `test`, `holdout`)
   - What's unclear: Whether the generated type should be a union (`string | { newUi: boolean }`) or an indexed type (`{ control: string; test: { newUi: boolean } }`)
   - Recommendation: Planner decides. Union is simpler to consume at call sites (`const x: PostHogFlags.MyFlag = posthog.getFeatureFlagPayload(...)`). Indexed is more descriptive. Both are valid TypeScript.

2. **`declare namespace` vs. `interface` approach**
   - What we know: Both `declare namespace PostHogFlags { type X = ... }` and `interface PostHogFlags { 'x': ... }` are valid TypeScript
   - What's unclear: Which integrates better with downstream usage patterns (e.g., `PostHogFlags['my-flag']` vs `PostHogFlags.MyFlag`)
   - Recommendation: Planner decides. Namespace with quoted type aliases is explicit and mirrors PostHog flag keys directly.

3. **Whether to add `.posthog.d.ts` to `.gitignore`**
   - What we know: Generated files are often gitignored; but users may want to commit types for team sharing
   - What's unclear: User preference
   - Recommendation: Do not add to `.gitignore` automatically. A generated file comment is sufficient notice.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @vscode/test-cli (Mocha under the hood) |
| Config file | `.vscode-test.mjs` |
| Quick run command | `pnpm compile-tests && pnpm test` |
| Full suite command | `pnpm pretest && pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CGEN-01 | Command `posthog.generateFlagTypes` is registered and callable | smoke (Extension Host) | `pnpm pretest && pnpm test` | ❌ Wave 0 |
| CGEN-02 | `generateFlagTypes()` produces valid `.d.ts` string | unit (pure Node) | `pnpm compile-tests && node out/test/codegenService.test.js` | ❌ Wave 0 |
| CGEN-03 | All active non-deleted flags appear in output; payload shapes are correctly inferred | unit (pure Node) | same as CGEN-02 | ❌ Wave 0 |

**Note:** `codegenService.ts` is a pure function with no VS Code imports. Its unit tests can run under plain Node without an Extension Development Host. The Mocha test runner already configured via `@vscode/test-cli` can run these as part of the `out/test/**/*.test.js` glob.

### Sampling Rate
- **Per task commit:** `pnpm compile-tests` (type-check only, fast)
- **Per wave merge:** `pnpm pretest && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/test/codegenService.test.ts` — covers CGEN-02, CGEN-03 (pure unit tests for `generateFlagTypes`)
  - Test cases: boolean flag (no payload), string payload, number payload, nested object, array, `null`, unparseable payload, deleted flag excluded, empty flags array, flag key with hyphens, flag key with special chars, depth > 3 truncation, multivariate flag
- [ ] No framework install needed — `@vscode/test-cli` and `@types/mocha` already present in devDependencies

---

## Sources

### Primary (HIGH confidence)
- `src/models/types.ts` — `FeatureFlag` interface shape confirmed: `filters: Record<string, unknown>`
- `src/services/flagCacheService.ts` — `getFlags()` returns all flags; `!f.deleted` filter confirmed in `getFlagKeys()`
- `src/commands/featureFlagCommands.ts` — command registration pattern, `flagCache?:` optionality confirmed
- `src/views/DetailPanelProvider.ts` lines 726, 775 — `filters.payloads` runtime access pattern confirmed
- `src/constants.ts` — `Commands` object shape confirmed
- `src/extension.ts` line 144 — command wiring pattern confirmed
- `package.json` — existing command contribution format confirmed
- `tsconfig.json` — `strict: true`, `target: ES2022`, `rootDir: src`
- `.vscode-test.mjs` — test runner config confirmed
- VS Code API docs (workspace.fs) — remote-safe file write API

### Secondary (MEDIUM confidence)
- VS Code remote development documentation — `workspace.fs` required for SSH/WSL/Codespaces

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed from live source files, no external dependencies needed
- Architecture: HIGH — all integration points verified against actual source code
- Pitfalls: HIGH — derived from direct inspection of live code and confirmed runtime patterns
- Type inference patterns: HIGH — based on TypeScript language spec, no library research needed

**Research date:** 2026-03-30
**Valid until:** 2026-06-30 (stable — VS Code API, TypeScript spec, PostHog flag schema are all stable)
