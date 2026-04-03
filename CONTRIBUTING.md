# Contributing to Codehog

Thank you for your interest in contributing to Codehog, the PostHog extension for VS Code. This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- **Node.js 20+**
- **pnpm** (package manager)
- **VS Code** (latest stable)
- A PostHog account (US Cloud, EU Cloud, or self-hosted)

### Setup

```bash
git clone https://github.com/PostHog/posthog-vscode.git
cd posthog-vscode
pnpm install
pnpm compile
```

### Running the Extension

Press **F5** in VS Code to launch the Extension Development Host OR open the "Run and Debug" panel. This opens a new VS Code window with the extension loaded from source.

### Useful Commands

```bash
pnpm compile          # Build with webpack
pnpm watch            # Build in watch mode (auto-recompile on save)
pnpm package          # Production build with hidden source maps
pnpm lint             # Run ESLint
pnpm test             # Run tests in VS Code host
```

## Architecture Overview

The extension follows a three-layer architecture with a central orchestrator. See [CLAUDE.md](CLAUDE.md) for the full file tree and code patterns.

### Services (`src/services/`)

The data layer. Services handle API calls, caching, authentication, and AST parsing. They have **no VS Code UI dependencies** beyond storage APIs.

- **authService** -- credentials via SecretStorage and Memento
- **postHogService** -- all PostHog REST and HogQL API calls
- **treeSitterService** -- AST parsing via web-tree-sitter for code intelligence
- **flagCacheService / eventCacheService / experimentCacheService** -- in-memory caches with listener-based change notification
- **staleFlagService** -- scans the workspace for stale flag references
- **telemetryService** -- extension telemetry via PostHog

### Providers (`src/providers/`)

VS Code language features: completions, decorations, code actions, code lenses, document links, and tree views. Each provider receives its dependencies (caches, tree-sitter) via constructor parameters.

### Commands (`src/commands/`)

Command Palette actions. Each file exports a registration function that binds command IDs (from `constants.ts`) to handler logic.

### Views (`src/views/`)

Webview panels for the sidebar and detail views. HTML is assembled from template literal functions in `views/webview/` (styles, layout, script) and composed with a CSP nonce.

### Extension Entry Point (`src/extension.ts`)

The orchestrator. Constructs all services, providers, and commands in `activate()`, wires dependencies, and pushes disposables to `context.subscriptions`.

## Code Patterns

### Cache Service Pattern

All caches follow the same shape:

```
API response --> cache.update(items) --> listeners fire --> providers re-render
```

A cache service holds an array of items, a lookup method, an `update()` method that replaces the array and notifies listeners, and an `onChange()` method for subscriptions.

When adding a new cache, follow the existing pattern in `flagCacheService.ts`.

### Decoration Provider Pattern

All decoration providers:

1. Accept a cache service and `TreeSitterService` in the constructor
2. Register listeners for editor changes, document changes, and cache changes
3. Debounce updates at **200ms**
4. Use `treeSitterService.findPostHogCalls()` to locate relevant calls
5. Filter by a provider-local `METHOD_SET` (e.g., `FLAG_METHODS` or `CAPTURE_METHODS`)
6. Render via `renderOptions.after` with `contentText`, `color`, and `fontStyle: 'italic'`

### Completion Provider Pattern

1. Guard: `treeSitterService.isSupported()`
2. Get context: `treeSitterService.getCompletionContext(doc, pos)`
3. Guard: `ctx.type` matches the expected completion type
4. Return `CompletionItem[]` built from cache data

### Adding a New PostHog API Call

All API calls go through `postHogService.request<T>(path, options?)`.

- REST endpoints use `/api/projects/{id}/` or `/api/environments/{id}/`
- HogQL queries use `POST /api/environments/{id}/query/` with `{ kind: 'HogQLQuery', query }`
- Always use `escapeHogQLString()` for user-supplied values in HogQL strings
- For paginated endpoints, use a `while(nextPath)` loop and parse the `next` URL from the response

### Adding a New Command

1. Add the command ID to `src/constants.ts` in the `Commands` object
2. Create or extend a file in `src/commands/`
3. Register the command in `src/extension.ts` inside `activate()`
4. Add the command entry to `contributes.commands` in `package.json`

### Adding a New Setting

1. Add the setting definition to `contributes.configuration.properties` in `package.json`
2. Read the setting with `vscode.workspace.getConfiguration('posthog').get('yourSetting')` in the relevant provider or service

## Testing

Tests run in the VS Code Extension Host via `@vscode/test-electron`.

```bash
pnpm test
```

### Test Structure

- `src/test/extension.test.ts` -- basic extension activation test
- `src/test/cacheServices.test.ts` -- tests for FlagCacheService, EventCacheService, and ExperimentCacheService (update, lookup, listener notification)
- `src/test/codegenService.test.ts` -- tests for code generation logic
- `src/test/generateType.test.ts` -- tests for type generation
- `src/test/utils/hogql.test.ts` -- tests for `escapeHogQLString` (injection prevention)
- `src/test/utils/flagClassification.test.ts` -- tests for flag type classification, rollout extraction, variant parsing
- `src/test/utils/formatting.test.ts` -- tests for `formatCount`, `formatPct`, `buildBar`
- `src/test/utils/codeCleanup.test.ts` -- tests for `findMatchingBrace`, `dedentBlock`

### Writing Tests

Pure logic belongs in `src/utils/` and is tested in `src/test/utils/`. Cache services are tested directly in `src/test/`. Keep tests focused on behavior, not implementation details.

## Conventions

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` -- new feature
- `fix:` -- bug fix
- `ci:` -- CI/CD changes
- `docs:` -- documentation
- `chore:` -- maintenance tasks

### Constants and Types

- All command IDs, view IDs, and storage keys live in `src/constants.ts`
- All PostHog API response shapes live in `src/models/types.ts`

### FLAG_METHODS Duplication

Each provider defines its own `FLAG_METHODS` Set. This is intentional -- do not refactor into a shared constant.

### Colors

| Purpose | Hex       | CSS Variable  |
| ------- | --------- | ------------- |
| Active  | `#4CBB17` | `--ph-green`  |
| Warning | `#F9BD2B` | `--ph-yellow` |
| Brand   | `#1D4AFF` | `--ph-blue`   |
| Error   | `#E53E3E` | `--ph-red`    |
| Accent  | `#F54E00` | `--ph-orange` |

For backgrounds, use VS Code theme variables (`--vscode-*`).

### Debounce

All decoration and highlight updates use a **200ms** debounce.

### Error Handling

- Startup cache loads: `.catch(() => {})` (silent -- the UI shows empty state)
- Service methods: `try/catch` with `console.warn`

## Telemetry

The extension is instrumented with PostHog via `TelemetryService`. Telemetry is **disabled in development mode** (when running via F5) and respects the user's VS Code telemetry setting.

To capture a new event:

```typescript
telemetry.capture("event_name", { key: "value" })
```

Add telemetry events for meaningful user actions (sign in, flag toggle, scan initiated, etc.). Do not instrument internal implementation details.

## Releasing

This project uses [changesets](https://github.com/changesets/changesets) for version management and automated releases.

### Adding a changeset

When you make a change that should be released, run:

```bash
pnpm changeset
```

This prompts you to select the change type (patch/minor/major) and write a summary. A markdown file is created in `.changeset/` describing your change.

### Version types

- **patch** — bug fixes, small improvements, documentation
- **minor** — new features, non-breaking changes
- **major** — breaking changes

### Automated release process

When PRs with changesets are merged to `main`, the release workflow automatically:

1. Consumes all pending changesets
2. Bumps the version in `package.json`
3. Updates `CHANGELOG.md` with the changeset summaries
4. Commits the version bump to `main`
5. Creates a git tag (`v{version}`)
6. Creates a GitHub Release with the changelog
7. Builds and packages the extension
8. Publishes to both VS Code Marketplace and Open VSX Registry

Do not manually bump the version in `package.json`. The CI pipeline handles it.

## PR Guidelines

- Use the [pull request template](.github/PULL_REQUEST_TEMPLATE.md) when opening a PR
- Keep PRs focused on a single change
- Include before/after screenshots for UI changes
- Ensure `pnpm compile` and `pnpm test` pass before submitting
- Use conventional commit messages in the PR title
