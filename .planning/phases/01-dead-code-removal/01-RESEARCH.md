# Phase 1: Dead Code Removal - Research

**Researched:** 2026-03-30
**Domain:** TypeScript dead code removal, VS Code extension cleanup
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Remove feature-by-feature with atomic commits per feature (not one big pass)
- Order: (1) HogQL editor, (2) error tracking, (3) smart capture insertion, (4) Python/Go/Ruby languages
- Each removal cleans all three surfaces atomically: package.json contributions, extension.ts wiring, source files

**HogQL editor removal:**
- Delete: `src/views/HogQLEditorProvider.ts`
- Delete: `syntaxes/hogql.tmLanguage.json`
- Remove from package.json: `posthog.openHogQLEditor` command, `posthog.runHogQLFile` command, `hogql` language registration, `hogql` grammar registration, editor/title menu entry for `runHogQLFile`
- Remove from extension.ts: HogQLEditorProvider import, instantiation, command registrations (`OPEN_HOGQL_EDITOR`, `RUN_HOGQL_FILE`)
- Remove from constants.ts: `OPEN_HOGQL_EDITOR` and `RUN_HOGQL_FILE` command IDs

**Error tracking removal:**
- Delete: `src/services/errorCacheService.ts`, `src/providers/errorDecorationProvider.ts`
- Remove from extension.ts: ErrorCacheService and ErrorDecorationProvider imports, instantiation, `errorCache` variable, `getErrorOccurrences` startup call, `errorDecorationProvider.register()` subscriptions
- Remove from SidebarProvider.ts: errorCache constructor parameter, any error tab/rendering in sidebar
- Remove ErrorOccurrence type from `models/types.ts` if only used by error tracking
- Remove `getErrorOccurrences` from `postHogService.ts` if only used by error tracking

**Smart capture insertion removal:**
- Delete: `src/providers/captureCodeActionProvider.ts`
- Remove from package.json: `posthog.insertCapture` command
- Remove from extension.ts: CaptureCodeActionProvider import, instantiation, code action provider registration, `registerCaptureCommands` import and call
- Remove from constants.ts: `INSERT_CAPTURE` command ID

**Python/Go/Ruby language removal:**
- Delete WASM files: `wasm/tree-sitter-python.wasm`, `wasm/tree-sitter-go.wasm`, `wasm/tree-sitter-ruby.wasm`
- Delete grammar source files: `grammars/tree-sitter-python.wasm`, `grammars/tree-sitter-go.wasm`, `grammars/tree-sitter-ruby.wasm`
- Remove from treeSitterService.ts: Python query definitions (`PYTHON_QUERIES`), Go query definitions (`GO_QUERIES`), Ruby query definitions (`RUBY_QUERIES`), Python/Go/Ruby method sets, `python`/`go`/`ruby` entries from the language config map
- Keep: JavaScript, TypeScript, TSX grammars and their WASM files
- Update `supportedLanguages` getter if it dynamically reads from config

**Post-removal verification:**
- TypeScript compilation must produce zero errors (`pnpm compile`)
- Command Palette must show no commands for removed features
- Bundle size should drop measurably (3-6 MB from WASM grammars alone)
- Sidebar should show no error tracking tab

### Claude's Discretion
- Exact commit message wording per removal
- Whether to clean up any leftover type imports that become unused
- Ordering of deletions within each feature removal

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLEAN-01 | Remove error tracking code (errorCacheService, errorDecorationProvider, sidebar error tab) | Verified: errorCacheService.ts, errorDecorationProvider.ts confirmed to exist; SidebarProvider takes errorCache as optional constructor param; extension.ts calls getErrorOccurrences() on startup |
| CLEAN-02 | Remove HogQL editor (HogQLEditorProvider, .hogql language registration, commands) | Verified: HogQLEditorProvider.ts confirmed to exist; package.json has hogql language + grammar + 2 commands + 1 menu entry; constants.ts has OPEN_HOGQL_EDITOR + RUN_HOGQL_FILE |
| CLEAN-03 | Remove smart capture insertion (captureCodeActionProvider, related commands) | Verified: captureCodeActionProvider.ts confirmed to exist; package.json has posthog.insertCapture; constants.ts has INSERT_CAPTURE; extension.ts registers code action + registerCaptureCommands() |
| CLEAN-04 | Remove Python, Go, Ruby tree-sitter grammars and WASM files | Verified: wasm/ has go/python/ruby .wasm files; grammars/ mirrors same set; treeSitterService.ts has PYTHON_QUERIES, GO_QUERIES, RUBY_QUERIES plus PY_/GO_/RB_ method sets and entries in LANG_FAMILIES map |
| CLEAN-05 | Remove all package.json contributions for dropped features (commands, menus, languages) | Verified: package.json contributions section has posthog.openHogQLEditor, posthog.runHogQLFile, posthog.insertCapture commands; editor/title menu for runHogQLFile; hogql language and grammar entries |
</phase_requirements>

---

## Summary

This phase is pure subtraction: four dead features need to be excised from three surfaces each — source files, `extension.ts` wiring, and `package.json` contributions. The codebase has been read in full; every file to delete and every line to remove is known precisely. No library research is needed; the work is surgical TypeScript editing and file deletion.

The primary risk is **cascading type errors after removal**. The TypeScript compiler is the safety net. Because `errorCache` flows through the constructor of `SidebarProvider`, removing that parameter requires updating both the constructor definition and the call site in `extension.ts`. Similarly, removing `ErrorOccurrence` from `models/types.ts` requires removing its import from `postHogService.ts` and `errorDecorationProvider.ts` (the latter is being deleted anyway). The `StackFrame` and `ExceptionEntry` types in `models/types.ts` must be preserved — they are referenced by `SidebarProvider.ts` via its `StackFrame` import on line 6.

**Primary recommendation:** Execute removals in the locked order, run `pnpm compile` after each atomic commit to validate zero TypeScript errors before proceeding to the next feature.

---

## Standard Stack

No new libraries are introduced in this phase. The work uses only what is already present.

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | ~5.9 (in package.json) | Type-checks all edits; zero errors is the acceptance criterion |
| webpack + ts-loader | existing | Compile runs via `pnpm compile`; bundle size is measurable output |
| pnpm | existing | Package manager; run scripts |
| `@vscode/test-cli` | existing | Test runner, currently a stub — not exercised by this phase |

**Build command (used after each removal):** `pnpm compile`

---

## Architecture Patterns

### The Three-Surface Pattern

Every feature in this extension occupies exactly three surfaces. Removal must clean all three atomically per feature:

1. **Source files** — delete the `.ts` file(s) that implement the feature
2. **`extension.ts` wiring** — remove the import, instantiation, and all `context.subscriptions.push(...)` entries
3. **`package.json` contributions** — remove commands, menus, languages, grammars entries

Missing any surface leaves dead contributions (Command Palette ghost commands) or compile errors (dangling imports).

### extension.ts Wiring Pattern

All providers are wired in `activate()`. The pattern is:

```typescript
// 1. Import at top
import { HogQLEditorProvider } from './views/HogQLEditorProvider';

// 2. Instantiate in activate()
const hogqlEditor = new HogQLEditorProvider(context.extensionUri, authService, postHogService);

// 3. Register in context.subscriptions.push(...)
vscode.commands.registerCommand(Commands.OPEN_HOGQL_EDITOR, () => hogqlEditor.open()),
vscode.commands.registerCommand(Commands.RUN_HOGQL_FILE, () => { ... }),
...errorDecorationProvider.register(),   // spread — removes multiple subscriptions
...registerCaptureCommands(),            // spread — removes multiple subscriptions
```

Removal is: delete import line, delete instantiation, remove from the subscriptions push block. The subscriptions block uses commas between entries — removing an entry with a trailing comma requires removing the comma too, or removing both the entry and the trailing comma of the preceding entry.

### SidebarProvider Constructor Change

`SidebarProvider` currently takes `errorCache` as its last (optional) parameter:

```typescript
constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly authService: AuthService,
    private readonly postHogService: PostHogService,
    private readonly flagCache: FlagCacheService,
    private readonly experimentCache?: ExperimentCacheService,
    private readonly detailPanel?: DetailPanelProvider,
    private readonly errorCache?: ErrorCacheService,   // REMOVE THIS
) {}
```

Both the constructor definition in `SidebarProvider.ts` and the call site in `extension.ts` must have this parameter removed. After removal, `import { ErrorCacheService }` in `SidebarProvider.ts` also becomes unused and must go.

### LANG_FAMILIES Map Removal

`treeSitterService.ts` uses a `LANG_FAMILIES` object as the single source of truth for language support. The `supportedLanguages` getter and `isSupported()` method both derive from this map. Removing three entries from the map is sufficient to drop those languages from all extension behaviour — no other changes needed for language detection logic.

```typescript
// BEFORE
const LANG_FAMILIES: Record<string, LangFamily> = {
    javascript: { ... },
    javascriptreact: { ... },
    typescript: { ... },
    typescriptreact: { ... },
    python: { ... },   // DELETE
    go: { ... },       // DELETE
    ruby: { ... },     // DELETE
};

// AFTER
const LANG_FAMILIES: Record<string, LangFamily> = {
    javascript: { ... },
    javascriptreact: { ... },
    typescript: { ... },
    typescriptreact: { ... },
};
```

The `PYTHON_QUERIES`, `GO_QUERIES`, `RUBY_QUERIES` const objects above the map, and all `PY_*`, `GO_*`, `RB_*` method set constants, become unreferenced and must be deleted to avoid TypeScript unused variable warnings (if strict mode enables them — tsconfig shows `strict: true`, but `noUnusedLocals` is not set; however clean code is the goal regardless).

---

## Don't Hand-Roll

This phase has no libraries to choose. The one "don't hand-roll" concern is verification:

| Problem | Don't Do | Do Instead | Why |
|---------|----------|-----------|-----|
| Verify nothing is missed | Manual grep for each symbol | `pnpm compile` — TypeScript catches dangling imports | Compiler is exhaustive; grep can miss string references |
| Check bundle size | Manual byte count | `pnpm package` then `ls -lh dist/extension.js` + `ls -lh wasm/` | Exact, reproducible |

---

## Common Pitfalls

### Pitfall 1: Partial Import Line Removal
**What goes wrong:** Removing `ErrorOccurrence` from `models/types.ts` but leaving it in the import statement of `postHogService.ts` causes a compile error even though the type is no longer used.
**Why it happens:** The import in `postHogService.ts` line 1 imports ~14 types from types.ts in one destructured import. After removing the `ErrorOccurrence` type definition, that name in the import becomes unresolvable.
**How to avoid:** When deleting a type from `models/types.ts`, search for all files importing that name and remove it from their import list too. `postHogService.ts` imports `ErrorOccurrence` — this must be removed when the type is deleted.
**Warning signs:** `pnpm compile` output: `Module '"../models/types"' has no exported member 'ErrorOccurrence'`

### Pitfall 2: StackFrame Import in SidebarProvider Survives
**What goes wrong:** `SidebarProvider.ts` line 6 imports `StackFrame` from `models/types`. This type is NOT part of error tracking; it is used in session replay display. Removing `ErrorTrackingIssue`, `ExceptionEntry`, `StackFrame`, and `ErrorOccurrence` wholesale from `models/types.ts` would break `SidebarProvider.ts`.
**How to avoid:** Only remove `ErrorOccurrence` and `ErrorTrackingIssue` from `models/types.ts`. Keep `StackFrame`, `ExceptionEntry` (verify whether ExceptionEntry is used elsewhere before removing).
**Verification:** After editing types.ts, run `pnpm compile` — any surviving usages will immediately error.

### Pitfall 3: Comma Punctuation in subscriptions.push() Block
**What goes wrong:** The `context.subscriptions.push(...)` call in `extension.ts` is a single multi-line call with comma-separated arguments. Removing a line without removing its trailing comma (or the preceding entry's comma) produces a syntax error.
**How to avoid:** Remove the full entry including its trailing comma, or if it is the last entry, remove the comma from the line above.

### Pitfall 4: webpack copies all `grammars/*.wasm` to `wasm/`
**What goes wrong:** Deleting only `wasm/tree-sitter-python.wasm` (the already-built output) but not `grammars/tree-sitter-python.wasm` means the next `pnpm compile` (which runs CopyPlugin) will re-copy them back, and `pnpm fetch-grammars` would also re-download them.
**How to avoid:** Delete from both locations: `grammars/` and `wasm/`. The webpack CopyPlugin pattern `grammars/*.wasm` copies whatever is in `grammars/`; if the source files are gone, they cannot be copied back by webpack.
**Warning signs:** After `pnpm compile`, `wasm/tree-sitter-python.wasm` reappears.

### Pitfall 5: getErrorOccurrences Calls getErrorTrackingIssues Which Uses HogQLQuery Internally
**What goes wrong:** Removing `getErrorOccurrences` is straightforward, but `getErrorTrackingIssues` is a separate private helper that only `getErrorOccurrences` calls. If `getErrorTrackingIssues` is left behind, it becomes dead code but does not cause a compile error (it's a method, not an import).
**How to avoid:** Remove both `getErrorTrackingIssues` and `getErrorOccurrences` from `postHogService.ts`. Also remove `ErrorOccurrence` and `ErrorTrackingIssue` from the import at line 1 of that file.

### Pitfall 6: runHogQLQuery remains used by other methods
**What goes wrong:** `runHogQLQuery` in `postHogService.ts` is called by `HogQLEditorProvider`, but it is also legitimately used by other service methods (event volumes, sparklines, event properties — all use internal HogQL queries). Do not remove `runHogQLQuery` — only `HogQLEditorProvider.ts` and its two command registrations go away.
**How to avoid:** Remove only the external-facing `runHogQLQuery` method... wait — verify: the method is called from `HogQLEditorProvider` only for the editor use case; internally `postHogService` uses `this.request(...)` directly, not `this.runHogQLQuery()`. So `runHogQLQuery` is only called from `HogQLEditorProvider`. It is safe to remove.
**Verification confirmed (from source read):** `runHogQLQuery` on line 489 of `postHogService.ts` is the only public HogQL method. Internal methods call `this.request<HogQLQueryResponse>(...)` directly. Safe to remove with the editor.

---

## Code Examples

### Exact Lines to Remove from extension.ts

```typescript
// IMPORTS TO REMOVE (lines 19, 23, 25-26)
import { CaptureCodeActionProvider, registerCaptureCommands } from './providers/captureCodeActionProvider';
import { HogQLEditorProvider } from './views/HogQLEditorProvider';
import { ErrorCacheService } from './services/errorCacheService';
import { ErrorDecorationProvider } from './providers/errorDecorationProvider';

// INSTANTIATIONS TO REMOVE
const errorCache = new ErrorCacheService();
const hogqlEditor = new HogQLEditorProvider(context.extensionUri, authService, postHogService);
const captureCodeActionProvider = new CaptureCodeActionProvider(treeSitter);
const errorDecorationProvider = new ErrorDecorationProvider(errorCache, authService);

// STARTUP CALL TO REMOVE (inside if(authed) block)
postHogService.getErrorOccurrences(projectId).then(occurrences => errorCache.update(occurrences)).catch(() => {});

// SUBSCRIPTIONS TO REMOVE FROM context.subscriptions.push(...)
vscode.languages.registerCodeActionsProvider(languageSelector, captureCodeActionProvider, {
    providedCodeActionKinds: CaptureCodeActionProvider.providedCodeActionKinds,
}),
vscode.commands.registerCommand(Commands.OPEN_HOGQL_EDITOR, () => hogqlEditor.open()),
vscode.commands.registerCommand(Commands.RUN_HOGQL_FILE, () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) { hogqlEditor.runFile(editor.document); }
}),
...errorDecorationProvider.register(),
...registerCaptureCommands(),

// SidebarProvider CALL: remove errorCache argument (7th param)
const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    authService,
    postHogService,
    flagCache,
    experimentCache,
    detailPanel,
    errorCache,         // REMOVE THIS LINE
);
```

### Exact Entries to Remove from package.json `contributes`

```json
// commands array — remove these 3 objects:
{ "command": "posthog.openHogQLEditor", "title": "PostHog: Open HogQL Editor", "icon": "$(play)" },
{ "command": "posthog.runHogQLFile", "title": "PostHog: Run HogQL File", "icon": "$(play)" },
{ "command": "posthog.insertCapture", "title": "PostHog: Track Function with PostHog" },

// menus.editor/title — remove entire array entry:
{ "command": "posthog.runHogQLFile", "when": "resourceLangId == hogql", "group": "navigation" },

// languages array — remove entire hogql object (all 9 lines)
// grammars array — remove entire hogql object (all 5 lines)
```

### Exact Lines to Remove from constants.ts

```typescript
// Remove these two entries from the Commands object:
OPEN_HOGQL_EDITOR: 'posthog.openHogQLEditor',
RUN_HOGQL_FILE: 'posthog.runHogQLFile',
INSERT_CAPTURE: 'posthog.insertCapture',
```

### Exact Blocks to Remove from treeSitterService.ts

```typescript
// Method sets (lines ~60-78):
const PY_CAPTURE_METHODS = new Set(['capture']);
const PY_FLAG_METHODS = new Set([...]);
const PY_ALL_METHODS = new Set([...]);
const GO_CAPTURE_METHODS = new Set(['Capture']);
const GO_FLAG_METHODS = new Set([...]);
const GO_ALL_METHODS = new Set([...]);
const RB_CAPTURE_METHODS = new Set(['capture']);
const RB_FLAG_METHODS = new Set([...]);
const RB_ALL_METHODS = new Set([...]);

// Query objects (lines ~194-329):
const PYTHON_QUERIES: QueryStrings = { ... };  // entire block
const GO_QUERIES: QueryStrings = { ... };       // entire block
const RUBY_QUERIES: QueryStrings = { ... };     // entire block

// LANG_FAMILIES entries (lines 338-340):
python: { wasm: 'tree-sitter-python.wasm', ... },
go: { wasm: 'tree-sitter-go.wasm', ... },
ruby: { wasm: 'tree-sitter-ruby.wasm', ... },
```

### Types to Remove from models/types.ts

```typescript
// Remove entirely:
export interface ErrorTrackingIssue { ... }   // only used by error tracking
export interface ErrorOccurrence { ... }       // only used by error tracking

// KEEP (used by session replay / sidebar):
export interface StackFrame { ... }
export interface ExceptionEntry { ... }
```

### Import Updates Required in postHogService.ts

```typescript
// Line 1 — remove ErrorTrackingIssue, ErrorOccurrence from the import:
// BEFORE:
import { ..., ErrorTrackingIssue, ..., ErrorOccurrence, ... } from '../models/types';
// AFTER: remove both names from the destructure
```

---

## State of the Art

This is not a domain requiring library research. The patterns are conventional TypeScript module cleanup.

| Step | Conventional Approach |
|------|-----------------------|
| Remove dead TypeScript module | Delete file, remove import, run compiler |
| Verify nothing missed | `tsc --noEmit` or `pnpm compile` |
| Remove VS Code extension contributions | Edit `package.json` contributes section directly |
| Reduce bundle size | Delete source WASM from `grammars/`, webpack CopyPlugin handles the rest |

---

## Open Questions

1. **ExceptionEntry type in models/types.ts**
   - What we know: `ErrorDecorationProvider.ts` imports it; that file is being deleted.
   - What's unclear: Whether `SidebarProvider.ts` or any other file imports `ExceptionEntry` independently.
   - Recommendation: Search for `ExceptionEntry` before removing from types.ts. Run `pnpm compile` after to confirm. If compile passes, the removal is safe.

2. **HogQLQueryResponse type in models/types.ts**
   - What we know: Used by `postHogService.ts` for internal HogQL queries (event volumes, sparklines, etc.) — not only by the HogQL editor.
   - What's unclear: Nothing — it must be kept. `runHogQLQuery` public method returns it; even after removing that method, the type is used internally.
   - Recommendation: Keep `HogQLQueryResponse`. Do not remove it.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `@vscode/test-cli` + Mocha (VS Code extension test runner) |
| Config file | `.vscode-test.mjs` (runs `out/test/**/*.test.js`) |
| Quick run command | `pnpm compile` (TypeScript compile = primary validator for this phase) |
| Full suite command | `pnpm test` (requires VS Code Extension Host; compile-tests first) |

The existing test file (`src/test/extension.test.ts`) contains only a stub with no assertions relevant to this phase. The TypeScript compiler is the authoritative validation tool for dead code removal.

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEAN-01 | Error tracking code removed; no compile errors | compile | `pnpm compile` | n/a (compile validates) |
| CLEAN-02 | HogQL editor code removed; no compile errors | compile | `pnpm compile` | n/a |
| CLEAN-03 | Smart capture code removed; no compile errors | compile | `pnpm compile` | n/a |
| CLEAN-04 | Python/Go/Ruby WASM absent from wasm/ and grammars/ | manual | `ls wasm/ grammars/` | n/a (file check) |
| CLEAN-05 | package.json has no contributions for dropped commands/languages | manual | `cat package.json \| grep -E 'hogql\|insertCapture\|runHogQLFile\|openHogQL'` | n/a |

### Sampling Rate
- **Per task commit:** `pnpm compile` — must exit 0
- **Per wave merge:** `pnpm compile` again on clean checkout
- **Phase gate:** `pnpm compile` exits 0 AND manual checks for CLEAN-04/CLEAN-05 pass before `/gsd:verify-work`

### Wave 0 Gaps
None — the existing test stub requires no changes. This phase's acceptance criterion is compiler clean + manual spot-checks, not automated test coverage.

---

## Sources

### Primary (HIGH confidence)
- Direct source file reads: `src/extension.ts`, `src/constants.ts`, `src/services/treeSitterService.ts`, `src/services/errorCacheService.ts`, `src/services/postHogService.ts`, `src/providers/errorDecorationProvider.ts`, `src/providers/captureCodeActionProvider.ts`, `src/views/HogQLEditorProvider.ts`, `src/views/SidebarProvider.ts`, `src/models/types.ts`, `package.json`, `webpack.config.js`
- File system inventory: `wasm/` directory, `grammars/` directory, `syntaxes/` directory

### Secondary (MEDIUM confidence)
- None required — all findings are grounded in direct code reads.

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- What to delete: HIGH — every file read, every line identified
- Where to edit: HIGH — exact line references confirmed by reading source
- Risk of cascading errors: HIGH — TypeScript compiler is the catcher; specific pitfalls documented
- Test strategy: HIGH — `pnpm compile` is the canonical validator

**Research date:** 2026-03-30
**Valid until:** This research reflects the exact current state of the codebase and is valid until any of the listed files change. No external libraries are involved, so there is no staleness from upstream changes.
