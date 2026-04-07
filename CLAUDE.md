# Codehog — PostHog for VS Code

VS Code extension that brings PostHog into the editor: feature flags, experiments, event analytics, and session replay — all inline in your code.

See [ROADMAP.md](ROADMAP.md) for v1 scope, features, and what's been dropped.

## Design Principles

1. **User-first** — every discussion starts with the user, every feature focuses on usability
2. **Beautiful UI** — aim for the best-looking VS Code extension possible
3. **PostHog brand** — stay within the PostHog visual language
4. **Solve real problems** — for every feature ask "what problem does this solve?" and drop what people don't need
5. **Simplify ruthlessly** — less code, fewer features, better experience

## Architecture

```
extension.ts                          ← orchestrator, wires everything
├── services/                         ← data layer (no VS Code UI)
│   ├── authService.ts                ← SecretStorage + Memento wrapper
│   ├── postHogAuthProvider.ts        ← VS Code authentication provider (OAuth + API key)
│   ├── postHogService.ts             ← all PostHog API calls + HogQL queries
│   ├── treeSitterService.ts          ← AST parsing via web-tree-sitter (6 languages)
│   ├── flagCacheService.ts           ← in-memory flag cache + onChange
│   ├── eventCacheService.ts          ← event definitions + volumes + sparklines
│   ├── experimentCacheService.ts     ← experiments + Bayesian results
│   ├── staleFlagService.ts           ← codebase-wide flag reference scanner
│   ├── codegenService.ts             ← TypeScript type generation from flag configs
│   ├── configService.ts              ← .posthog.json team config + workspace settings
│   └── telemetryService.ts           ← extension self-telemetry (posthog-node)
├── providers/                        ← VS Code language features (19 total)
│   ├── flagCompletionProvider.ts     ← flag key autocomplete
│   ├── eventCompletionProvider.ts    ← event name autocomplete
│   ├── eventPropertyCompletionProvider.ts ← property name + top values
│   ├── variantCompletionProvider.ts  ← variant key autocomplete (in if/case)
│   ├── flagDecorationProvider.ts     ← inline flag status after code
│   ├── eventDecorationProvider.ts    ← inline sparkline + volume
│   ├── initDecorationProvider.ts     ← inline init() info (host, project)
│   ├── flagCodeActionProvider.ts     ← "create flag" quick-fix
│   ├── flagToggleCodeActionProvider.ts    ← toggle flag from code
│   ├── staleFlagCodeActionProvider.ts     ← clean up stale flag references
│   ├── wrapInFlagCodeActionProvider.ts    ← wrap selection in flag check
│   ├── flagCodeLensProvider.ts       ← CodeLens above flag calls
│   ├── sessionCodeLensProvider.ts    ← "X sessions" above calls
│   ├── flagLinkProvider.ts           ← cmd+click on flag keys
│   ├── variantHighlightProvider.ts   ← experiment variant code paths
│   ├── variantDiagnosticProvider.ts  ← invalid/missing variant warnings
│   ├── eventNamingDiagnosticProvider.ts   ← typo detection on event names
│   ├── staleFlagTreeProvider.ts      ← stale flags tree view
│   └── debugTreeProvider.ts          ← debug info tree view
├── commands/                         ← Command Palette actions
│   ├── authCommands.ts
│   ├── featureFlagCommands.ts
│   └── staleFlagCommands.ts
├── views/                            ← webview panels
│   ├── SidebarProvider.ts            ← main sidebar webview
│   ├── DetailPanelProvider.ts        ← editor-tab detail panels
│   ├── FeedbackViewProvider.ts       ← feedback survey panel
│   └── webview/                      ← HTML/CSS/JS sources for sidebar + detail panels
├── utils/                            ← pure utility functions (heavily tested)
│   ├── hogql.ts                      ← escapeHogQLString (string literal escaping)
│   ├── flagClassification.ts         ← boolean / multivariate / remote_config detection
│   ├── formatting.ts                 ← formatCount, formatPct, buildBar
│   └── codeCleanup.ts                ← findMatchingBrace, dedentBlock
├── models/types.ts                   ← all TypeScript interfaces
└── constants.ts                      ← command IDs, view IDs, storage keys
```

## Code Patterns

### Cache Service
All caches follow the same shape. Data flows: API → cache.update() → listeners fire → providers re-render.

```typescript
class XxxCacheService {
    private items: T[] = [];
    private listeners: Array<() => void> = [];
    getXxx(key: string): T | undefined { /* lookup */ }
    update(items: T[]): void { /* replace all + notify listeners */ }
    onChange(listener: () => void): void { /* subscribe */ }
}
```

### Decoration Provider
All decoration providers: construct with cache + treeSitter, register listeners, debounce 200ms, filter by method set, render via `renderOptions.after`.

```typescript
class XxxDecorationProvider {
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    constructor(private cache: CacheService, private treeSitter: TreeSitterService) {}
    register(): vscode.Disposable[] {
        // listen to: editor changes, document changes, cache changes
        // call triggerUpdate() on each
    }
    private triggerUpdate() { clearTimeout + setTimeout(updateDecorations, 200) }
    private async updateDecorations() {
        // 1. guard: active editor? treeSitter.isSupported()?
        // 2. const calls = await treeSitter.findPostHogCalls(doc)
        // 3. filter by METHOD_SET (FLAG_METHODS or CAPTURE_METHODS)
        // 4. build DecorationOptions with renderOptions.after { contentText, color, fontStyle:'italic' }
        // 5. editor.setDecorations(this.decoration, decorations)
    }
}
```

### Completion Provider
```typescript
class XxxCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private cache: CacheService, private treeSitter: TreeSitterService) {}
    async provideCompletionItems(doc, pos) {
        // 1. guard: treeSitter.isSupported()
        // 2. ctx = treeSitter.getCompletionContext(doc, pos)
        // 3. guard: ctx.type matches expected
        // 4. return CompletionItem[] from cache data
    }
}
```

### Code Action Provider
```typescript
class XxxCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];
    constructor(private cache: CacheService, private treeSitter: TreeSitterService) {}
    async provideCodeActions(doc, range) {
        // 1. guard: treeSitter.isSupported()
        // 2. calls = treeSitter.findPostHogCalls(doc)
        // 3. find call on current line + matching method
        // 4. return CodeAction with command
    }
}
```

### PostHog API calls
All API calls go through `postHogService.request<T>(path, options?)`.
- REST endpoints: `/api/projects/{id}/` or `/api/environments/{id}/`
- HogQL queries: `POST /api/environments/{id}/query/` with `{ kind: 'HogQLQuery', query }`
- **Always** use `escapeHogQLString()` from `src/utils/hogql.ts` for user-supplied values in HogQL string literals. NEVER use `\\'` escaping — HogQL doubles single quotes (`''`).
- `escapeHogQLString` is for STRING LITERAL contexts only. It does NOT make values safe inside identifier paths like `properties.$feature.${key}` — those need separate identifier validation.
- Pagination: `while(nextPath)` loop, parse `data.next` URL

### Webview panels
HTML is built from template literal functions in `views/webview/`:
- `styles.ts` → CSS string
- `layout.ts` → HTML structure string
- `script.ts` → JS logic string
- Composed in `getWebviewHtml.ts` with CSP nonce
- Communication: `vscode.postMessage()` ↔ `webview.onDidReceiveMessage()`

### Registration in extension.ts
All providers are constructed in `activate()`, passed their dependencies, and pushed to `context.subscriptions`. No dependency injection framework — just constructor parameters.

## Conventions

- **Constants**: all command IDs, view IDs, storage keys in `constants.ts`
- **Types**: all PostHog API response shapes in `models/types.ts`
- **FLAG_METHODS**: duplicated across files (each provider defines its own Set) — this is intentional, not a DRY violation to fix. Parity is enforced by `src/test/regression/methodSetParity.test.ts` — when adding a new flag method, you MUST update every provider AND `staleFlagService.FLAG_METHODS` AND `staleFlagService.POSTHOG_FLAG_METHODS` (the array used by cleanup edits — easy to miss).
- **Colors**: `#4CBB17` green (active), `#F9BD2B` yellow (warning), `#1D4AFF` PostHog blue, `#E53E3E` red (error), `#F54E00` orange
- **CSS variables**: `--ph-blue`, `--ph-yellow`, `--ph-orange`, `--ph-green`, `--ph-red`
- **Debounce**: 200ms on all decoration/highlight updates
- **Error handling**: `.catch(() => {})` on startup cache loads; `try/catch` with `console.warn` in services
- **Build**: `pnpm`, webpack → `dist/extension.js`, WASM files in `wasm/`
- **Publish**: changesets + GitHub Actions → VS Code Marketplace + Open VSX. **Publishing is gated on the test suite** — `release.yml`, `publish-vscode.yml`, and `publish-ovsx.yml` all call `test.yml` as a reusable workflow before any publish step. Do not add manual workflow_dispatch shortcuts that bypass this gate. (See CONTRIBUTING.md "Release gate" section.)
- **Commit style**: conventional commits (`feat:`, `fix:`, `ci:`)

## Multi-language support

The extension supports 6 language families via tree-sitter: JavaScript, TypeScript (+JSX/TSX), Python, Go, and Ruby. The core engine is `src/services/treeSitterService.ts`. Each language has its own query strings, method sets, and AST node handling.

### SDK calling conventions per language

Each language has its own PostHog SDK conventions — never assume one pattern works everywhere:

| Language | Capture event | Flag check |
|----------|--------------|------------|
| JS browser | `posthog.capture('event', {props})` — event is 1st arg | `posthog.getFeatureFlag('key')` |
| JS Node SDK | `client.capture({event: 'x', distinct_id: 'u'})` — event in object | same |
| Python | `posthog.capture(distinct_id, event, properties=...)` — event is **2nd positional** or `event=` keyword | `posthog.get_feature_flag('key', 'user_id')` |
| Go | `client.Enqueue(posthog.Capture{Event: 'x'})` — struct field | `client.GetFeatureFlag('key')` or struct form |
| Ruby | `posthog.capture(distinct_id: 'u', event: 'x')` — `event:` keyword arg | `posthog.get_feature_flag('key', 'user_id')` |

### Tree-sitter AST gotchas (very easy to mess up)

Tree-sitter node names are **per-language** and inconsistent. Always verify with a parse before writing queries — do not assume node names from one language work in another:

| Concept | JS/TS | Python | Go | Ruby |
|---------|-------|--------|-----|------|
| Method call | `call_expression` | `call` | `call_expression` | `call` |
| Call's callee | `function` field → `member_expression` | `function` field → `attribute` | `function` field → `selector_expression` | **NO `function` field** — uses `receiver` + `method` as separate fields |
| String | `string` > `string_fragment` | `string` > `string_content` | `interpreted_string_literal` (text includes quotes) | `string` > `string_content` |
| Binary comparison | `binary_expression` | `comparison_operator` | `binary_expression` | `binary` |
| Negation | `unary_expression` | `not_operator` | `unary_expression` | `unary` |
| If statement | `if_statement` | `if_statement` | `if_statement` | `if` |
| Else if | `else_clause` wrapping `if_statement` | `elif_clause` (alternative directly) | `if_statement` (alternative directly) | `elsif` |
| Switch statement | `switch_statement` with `body` field | n/a | `expression_switch_statement`, no `body` — cases are direct children | `case`, `when`, `else` |
| Switch case | `switch_case` | n/a | `expression_case` (value is `expression_list`) | `when` (pattern is direct child) |
| Constants | `lexical_declaration` / `variable_declaration` | `assignment` (left: `identifier`) | `short_var_declaration`, `const_declaration` | `assignment` (left: `identifier` or `constant`) |

**The Ruby `call` node has NO `function` field.** Many helpers in `treeSitterService.ts` check `callNode.childForFieldName('function')` first, then fall back to `receiver` + `method` for Ruby. If you forget this fallback, Ruby support silently breaks.

### Adding a new language

When adding a new language, you MUST update ALL of these:
1. `src/services/treeSitterService.ts`: new `*_CAPTURE_METHODS` / `*_FLAG_METHODS` / `*_QUERIES` constants, register in `LANG_FAMILIES`, handle the language's AST node types in `findPostHogCalls`, `findVariantBranches`, `findInitCalls`, `findIfChainsForVar`, `findSwitchForVar`, `extractIfChainBranches`, `findInlineFlagIfs`, `findEnabledIfs`, `extractComparison`, `extractFlagCallComparison`, `extractEnabledCall`, `isNegated`, `isTruthinessCheckForVar`, `buildConstantMap`, `getCompletionContext`, `findAliases`, the dynamic call detection query, and the constant-resolution `identArgQueryStr`
2. `src/services/staleFlagService.ts`: add the file extension to the glob; add any new method names to `FLAG_METHODS` AND `POSTHOG_FLAG_METHODS`
3. All 8 provider files (`src/providers/flag*Provider.ts`, `sessionCodeLensProvider.ts`, `staleFlagCodeActionProvider.ts`, `variantCompletionProvider.ts`): add new method names to `FLAG_METHODS`. Also update the regex patterns in `variantCompletionProvider.ts` (it has its own regex for assignments and switch/case detection that needs language-specific syntax)
4. `scripts/fetch-grammars.js`: pin the new grammar to a version compatible with `web-tree-sitter@0.24.7` (ABI 13-14 only)
5. `playgrounds/<lang>/`: create a comprehensive playground covering all 18 features
6. `src/test/integration/<lang>Snapshot.test.ts`: snapshot tests
7. `src/test/integration/playgroundSnapshot.test.ts`: add the playground to the snapshot list
8. `src/test/integration/crossLanguageParity.test.ts`: add language variants to each scenario
9. `src/test/regression/methodSetParity.test.ts`: update canonical sets if needed
10. `README.md`: add to the Supported Languages table

This is a lot — but it's enforced by tests. Run `pnpm test` after every step.

## Pitfalls (lessons from past incidents)

These are real bugs that have happened. Each has a regression test in `src/test/regression/`.

- **CodeQL: never use `string.includes('https://...')` for URL matching**, even in test code. Use `new URL(x).hostname === 'expected.com'` or extract hostnames structurally. CodeQL flags substring matching as incomplete URL sanitization. This applies to source AND tests.
- **HogQL escaping**: never do `value.replace(/'/g, "\\'")` — HogQL doubles single quotes, not backslash-escapes them. Always use `escapeHogQLString()`.
- **HogQL identifier injection**: `escapeHogQLString` is safe for string literals but NOT for identifier paths. `properties.$feature.${userKey}` is dangerous even after escaping — sanitize the identifier separately.
- **Tree-sitter WASM ABI**: `web-tree-sitter@0.24.7` only supports ABI 13-14. Newer grammar packages may be ABI 15+ and silently fail to load. Pin every grammar to a known-compatible version in `scripts/fetch-grammars.js`. Currently: javascript@0.23.1, python@0.23.5, go@0.23.4, ruby@0.23.1.
- **Python `capture` first arg is `distinct_id`, NOT the event name** — the event is the 2nd positional or `event=` keyword. The generic `postHogCalls` query in treeSitterService matches first-arg strings, so it MUST skip `capture` for Python (and Ruby) — this is done via the `pythonCaptureCalls` / `rubyCaptureCalls` discriminator.
- **Multivariate flag truthiness checks**: `if (showFlag)` where `showFlag` is from a multivariate flag should NOT highlight branches as if it were a boolean check. The variantHighlightProvider skips truthiness when the resolved variant is `'true'`/`'false'` AND the flag is multivariate.
- **Unknown flags should not produce variant branches** — `if (showFlag)` where `showFlag` doesn't exist in cache previously produced "disabled disabled disabled" duplicates. Skip when `!flag`.
- **Boolean flag `else` resolves to `'false'`, not `'else'`** — for `if (enabled) { } else { }` on a boolean flag, the else branch must produce `variantKey: 'false'` so it gets the gray "disabled" highlight, not the `'else'` fallback.
- **Variant labels deduplicate per condition line** — if multiple branches share the same `conditionLine`, deduplicate via a `labelledConditionLines` Set or you'll get repeated labels.
- **JS `else if` middle branches must recurse into the inner `if_statement`** — JavaScript `else_clause` wraps an `if_statement` for "else if". The handling for `else_clause` MUST first check `alternative.namedChildren.find(c => c.type === 'if_statement')` and recurse if found, rather than blindly treating it as a terminal else. Forgetting this drops every middle branch in 3+ arm chains. Python `else_clause` (which has a `body` field) is the same node type but handled by the same fallback. Caught by `crossLanguageParity.test.ts` and `treeSitterProperty.test.ts` Property 6.
- **React hooks must be in FLAG_METHODS** — `useFeatureFlag`, `useFeatureFlagPayload`, `useFeatureFlagVariantKey`, `useActiveFeatureFlags` are flag methods. Bare function call detection in treeSitter handles them, and providers must include them.
- **`POSTHOG_FLAG_METHODS` array in staleFlagService is separate from `FLAG_METHODS` Set** — the array is used by `buildCleanupEditForRef()` for regex cleanup. Both must be kept in sync. The QA team caught a regression where Go methods were missing from the array. The parity test now locks this in.
- **Stale flag scan glob must include all language extensions** — currently `**/*.{ts,tsx,js,jsx,py,go,rb}`. Forgetting an extension means flags are detected by tree-sitter but not by the workspace scanner.
- **Always use the dedicated tools for file operations** — Glob/Grep/Read/Edit, never bash `find`/`grep`/`cat`/`sed`. The hooks and permissions are configured for these tools.
- **`pnpm test` fails when VS Code is open** — VS Code locks the user data dir. Use `npx vscode-test --user-data-dir /tmp/vscode-test-userdata` for local test runs. CI is unaffected.
- **GitHub Actions workflows: pin third-party actions to commit SHAs** — only the official `actions/*` namespace is on PostHog's audit allowlist (e.g. `actions/checkout`, `actions/setup-node`, `actions/create-github-app-token`). Any non-`actions/*` action MUST be pinned to a full SHA with a comment, including `pnpm/action-setup`, `mymindstorm/setup-emsdk`, etc. Example: `pnpm/action-setup@41ff72655975bd51cab0327fa583b6e92b6d3061 # v4`. The "Audit Actions" CI check (`zgosalvez/github-actions-ensure-sha-pinned-actions`) enforces this and will block the PR if violated.
- **GitHub Actions workflows: never interpolate `${{ steps.*.outputs.* }}` directly into `run:` shell scripts** — this is a shell injection vector flagged as `dotgithub-repo..semgrep.rules.github-actions-shell-injection`. Always pass through an `env:` block: define `VERSION: ${{ steps.x.outputs.y }}` and use `"$VERSION"` in the shell script. Same rule applies to any context output (`github.event.*`, `inputs.*`, etc.).

## Testing

The test suite is the safety net. There are ~550 tests across these directories:

```
src/test/
├── extension.test.ts                 ← extension activation smoke test
├── cacheServices.test.ts             ← cache service unit tests
├── codegenService.test.ts            ← code generation tests
├── generateType.test.ts              ← type generation tests
├── utils/                            ← pure utility tests (hogql, formatting, etc.)
├── integration/                      ← tree-sitter snapshot + cross-language tests
│   ├── treeSitterSnapshot.test.ts    ← JS/TS multi-language snapshots
│   ├── pythonSnapshot.test.ts        ← Python-specific
│   ├── goSnapshot.test.ts            ← Go-specific
│   ├── rubySnapshot.test.ts          ← Ruby-specific
│   ├── crossLanguageParity.test.ts   ← matrix: same scenario across all languages
│   ├── playgroundSnapshot.test.ts    ← snapshots of playground/* files
│   ├── extensionHostSmoke.test.ts    ← real Extension Host smoke tests
│   └── __snapshots__/                ← committed snapshot fixtures
├── regression/                       ← one file per past bug (NEVER delete these)
│   ├── methodSetParity.test.ts       ← FLAG_METHODS parity across providers
│   ├── multivariateTruthiness.test.ts
│   ├── duplicateLabels.test.ts
│   ├── reactHookDetection.test.ts
│   ├── pythonCaptureFirstArgSkip.test.ts
│   ├── pythonFeatureEnabledMethod.test.ts
│   ├── pythonKeywordConstructor.test.ts
│   ├── codeqlUrlSubstring.test.ts
│   ├── hogqlEscapingMetaTest.test.ts ← grep-based meta-test
│   ├── booleanElseBranch.test.ts
│   ├── goSwitchCase.test.ts
│   └── rubyCaseWhen.test.ts
├── providers/                        ← provider unit tests with mocked deps
├── services/                         ← service unit tests with mocked fetch
└── property/                         ← fast-check property + fuzz tests
```

### Test conventions

- **Every fixed bug must add a regression test in `src/test/regression/`** — one file per bug, named after the bug. Failure messages must clearly identify the bug so future developers know what broke.
- **Snapshot tests are committed** — `__snapshots__/` is NOT in `.gitignore`. PRs show snapshot diffs.
- **Coverage thresholds enforced in CI** — currently 30% lines / 30% functions, configured in `.github/workflows/test.yml`. Ratchet upward as coverage grows.
- **`pnpm test:coverage`** generates HTML at `coverage/index.html` for local inspection.
- **Mocks are NOT shared between test files** — each file is self-contained with its own `mockDoc`, fake caches, and fake treeSitter. This prevents test coupling.
- **Provider tests mock `setDecorations`** by overriding `vscode.window.activeTextEditor` via `Object.defineProperty` and intercepting decoration calls.

## Development

```bash
pnpm install                    # install deps
pnpm compile                    # webpack build (also runs fetch-grammars)
pnpm watch                      # webpack watch mode
pnpm package                    # production build
pnpm lint                       # eslint
pnpm test                       # full test suite (~550 tests)
pnpm test:coverage              # tests + coverage report (open coverage/index.html)
# Press F5 in VS Code to launch Extension Development Host
```

If `pnpm test` fails with "Running extension tests from the command line is currently only supported if no other instance of Code is running", run with a custom user data dir:

```bash
npx vscode-test --user-data-dir /tmp/vscode-test-userdata
```

## PostHog Brand Colors (reference)
- Blue: #1D4AFF
- Yellow: #F9BD2B
- Orange: #F54E00
- Red: #F44336 / #E53E3E
- Green: #4CBB17
- Background: use VS Code theme variables (--vscode-*)
