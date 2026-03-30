# Phase 1: Dead Code Removal - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove all dropped features from the extension: HogQL editor, error tracking, smart capture insertion, and Python/Go/Ruby language support. The extension bundle should contain only code that is used. No dead features in the Command Palette, sidebar, or package.json contributions.

</domain>

<decisions>
## Implementation Decisions

### Removal order and atomicity
- Remove feature-by-feature with atomic commits per feature (not one big pass)
- Order: (1) HogQL editor, (2) error tracking, (3) smart capture insertion, (4) Python/Go/Ruby languages
- Each removal cleans all three surfaces atomically: package.json contributions, extension.ts wiring, source files

### HogQL editor removal
- Delete: `src/views/HogQLEditorProvider.ts`
- Delete: `syntaxes/hogql.tmLanguage.json`
- Remove from package.json: `posthog.openHogQLEditor` command, `posthog.runHogQLFile` command, `hogql` language registration, `hogql` grammar registration, editor/title menu entry for `runHogQLFile`
- Remove from extension.ts: HogQLEditorProvider import, instantiation, command registrations (`OPEN_HOGQL_EDITOR`, `RUN_HOGQL_FILE`)
- Remove from constants.ts: `OPEN_HOGQL_EDITOR` and `RUN_HOGQL_FILE` command IDs

### Error tracking removal
- Delete: `src/services/errorCacheService.ts`, `src/providers/errorDecorationProvider.ts`
- Remove from extension.ts: ErrorCacheService and ErrorDecorationProvider imports, instantiation, `errorCache` variable, `getErrorOccurrences` startup call, `errorDecorationProvider.register()` subscriptions
- Remove from SidebarProvider.ts: errorCache constructor parameter, any error tab/rendering in sidebar
- Remove ErrorOccurrence type from `models/types.ts` if only used by error tracking
- Remove `getErrorOccurrences` from `postHogService.ts` if only used by error tracking

### Smart capture insertion removal
- Delete: `src/providers/captureCodeActionProvider.ts`
- Remove from package.json: `posthog.insertCapture` command
- Remove from extension.ts: CaptureCodeActionProvider import, instantiation, code action provider registration, `registerCaptureCommands` import and call
- Remove from constants.ts: `INSERT_CAPTURE` command ID

### Python/Go/Ruby language removal
- Delete WASM files: `wasm/tree-sitter-python.wasm`, `wasm/tree-sitter-go.wasm`, `wasm/tree-sitter-ruby.wasm`
- Delete grammar source files: `grammars/tree-sitter-python.wasm`, `grammars/tree-sitter-go.wasm`, `grammars/tree-sitter-ruby.wasm` (if they exist there)
- Remove from treeSitterService.ts: Python query definitions (`PYTHON_QUERIES`), Go query definitions (`GO_QUERIES`), Ruby query definitions (`RUBY_QUERIES`), Python/Go/Ruby method sets, `python`/`go`/`ruby` entries from the language config map
- Keep: JavaScript, TypeScript, TSX grammars and their WASM files
- Update `supportedLanguages` getter if it dynamically reads from config

### Post-removal verification
- TypeScript compilation must produce zero errors (`pnpm compile`)
- Command Palette must show no commands for removed features
- Bundle size should drop measurably (3-6 MB from WASM grammars alone)
- Sidebar should show no error tracking tab

### Claude's Discretion
- Exact commit message wording per removal
- Whether to clean up any leftover type imports that become unused
- Ordering of deletions within each feature removal

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Feature inventory (what to remove)
- `ROADMAP.md` — v1 scope: lists dropped features (error tracking, HogQL editor, smart capture, Python/Go/Ruby)
- `.planning/REQUIREMENTS.md` — CLEAN-01 through CLEAN-05 requirements

### Removal surfaces (where to clean)
- `package.json` — Commands, languages, grammars, menus contributions for dropped features
- `src/extension.ts` — Wiring for all providers and services (imports, instantiation, subscriptions)
- `src/constants.ts` — Command IDs for dropped features (OPEN_HOGQL_EDITOR, RUN_HOGQL_FILE, INSERT_CAPTURE)

### Source files to delete
- `src/views/HogQLEditorProvider.ts` — HogQL editor webview
- `src/services/errorCacheService.ts` — Error occurrence cache
- `src/providers/errorDecorationProvider.ts` — Inline error decorations
- `src/providers/captureCodeActionProvider.ts` — Smart capture code action

### WASM files to delete
- `wasm/tree-sitter-python.wasm` — Python grammar
- `wasm/tree-sitter-go.wasm` — Go grammar
- `wasm/tree-sitter-ruby.wasm` — Ruby grammar

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None specifically reusable — this phase is removal, not addition

### Established Patterns
- All providers register via `context.subscriptions.push()` in `extension.ts` — removal must mirror registration
- Cache services follow the same constructor → `update()` → `onChange()` pattern — removing errorCacheService is clean
- SidebarProvider takes caches as constructor params — removing errorCache param requires updating the constructor call

### Integration Points
- `extension.ts:activate()` — central wiring point; all removals converge here
- `package.json contributes` — commands, languages, grammars, menus sections
- `src/constants.ts` — command ID constants referenced by removed features
- `src/models/types.ts` — ErrorOccurrence type used by error tracking
- `src/services/postHogService.ts` — `getErrorOccurrences()` method used only by error tracking
- `src/views/SidebarProvider.ts` — receives errorCache in constructor
- `src/services/treeSitterService.ts` — Python/Go/Ruby language configs, query definitions, method sets
- `webpack.config.js` — `grammars/*.wasm` copy rule may need scoping to JS/TS only

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard dead code removal following the three-surface-per-feature pattern identified in research.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-dead-code-removal*
*Context gathered: 2026-03-30*
