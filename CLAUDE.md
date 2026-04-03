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
│   ├── postHogService.ts             ← all PostHog API calls + HogQL queries
│   ├── treeSitterService.ts          ← AST parsing via web-tree-sitter
│   ├── flagCacheService.ts           ← in-memory flag cache + onChange
│   ├── eventCacheService.ts          ← event definitions + volumes + sparklines
│   ├── experimentCacheService.ts     ← experiments + Bayesian results
│   └── staleFlagService.ts           ← codebase-wide flag reference scanner
├── providers/                        ← VS Code language features
│   ├── flagCompletionProvider.ts     ← flag key autocomplete
│   ├── eventCompletionProvider.ts    ← event name autocomplete
│   ├── eventPropertyCompletionProvider.ts ← property name + top values
│   ├── flagDecorationProvider.ts     ← inline flag status after code
│   ├── eventDecorationProvider.ts    ← inline sparkline + volume
│   ├── flagCodeActionProvider.ts     ← "create flag" quick-fix
│   ├── flagLinkProvider.ts           ← cmd+click on flag keys
│   ├── variantHighlightProvider.ts   ← experiment variant code paths
│   ├── sessionCodeLensProvider.ts    ← "X sessions" above calls
│   └── staleFlagTreeProvider.ts      ← stale flags tree view
├── commands/                         ← Command Palette actions
│   ├── authCommands.ts
│   ├── featureFlagCommands.ts
│   └── staleFlagCommands.ts
├── views/                            ← webview panels
│   ├── SidebarProvider.ts            ← main sidebar webview
│   ├── DetailPanelProvider.ts        ← editor-tab detail panels
│   └── webview/
│       ├── styles.ts                 ← CSS (template literal)
│       ├── layout.ts                 ← HTML structure (template literal)
│       └── script.ts                 ← JS logic (template literal)
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
- Always use `escapeHogQLString()` for user-supplied values in HogQL
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
- **FLAG_METHODS**: duplicated across files (each provider defines its own Set) — this is intentional, not a DRY violation to fix
- **Colors**: `#4CBB17` green (active), `#F9BD2B` yellow (warning), `#1D4AFF` PostHog blue, `#E53E3E` red (error), `#F54E00` orange
- **CSS variables**: `--ph-blue`, `--ph-yellow`, `--ph-orange`, `--ph-green`, `--ph-red`
- **Debounce**: 200ms on all decoration/highlight updates
- **Error handling**: `.catch(() => {})` on startup cache loads; `try/catch` with `console.warn` in services
- **Build**: `pnpm`, webpack → `dist/extension.js`, WASM files in `wasm/`
- **Publish**: changesets + GitHub Actions → VS Code Marketplace + Open VSX (see CONTRIBUTING.md)
- **Commit style**: conventional commits (`feat:`, `fix:`, `ci:`)

## Development

```bash
pnpm install                    # install deps
pnpm compile                    # webpack build
pnpm watch                      # webpack watch mode
pnpm package                    # production build
pnpm lint                       # eslint
# Press F5 in VS Code to launch Extension Development Host
```

## PostHog Brand Colors (reference)
- Blue: #1D4AFF
- Yellow: #F9BD2B
- Orange: #F54E00
- Red: #F44336 / #E53E3E
- Green: #4CBB17
- Background: use VS Code theme variables (--vscode-*)
