# Architecture Research

**Domain:** VS Code extension — developer tools (PostHog integration)
**Researched:** 2026-03-30
**Confidence:** HIGH (based on current codebase + verified VS Code API docs)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Extension Host Process                     │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌───────────────────────────────────────┐  │
│  │   extension.ts  │  │           Commands Layer              │  │
│  │  (orchestrator) │  │  authCommands  featureFlagCommands    │  │
│  └────────┬────────┘  │  staleFlagCommands                    │  │
│           │           └───────────────────┬───────────────────┘  │
│           │                               │                      │
├───────────┴───────────────────────────────┴──────────────────────┤
│                        Services Layer (data)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  authService │  │postHogService│  │   treeSitterService   │   │
│  └──────────────┘  └──────┬───────┘  └──────────────────────┘   │
│  ┌──────────────┐  ┌──────┴───────┐  ┌──────────────────────┐   │
│  │ flagCache    │  │ eventCache   │  │  experimentCache      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                      ┌───────────────┐                           │
│                      │ staleFlagSvc  │                           │
│                      └───────────────┘                           │
├──────────────────────────────────────────────────────────────────┤
│                      Providers Layer (VS Code features)           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  completion  │  │  decoration  │  │     codeAction        │   │
│  │  providers   │  │  providers   │  │     providers         │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  flagLink    │  │  variantHigh │  │  sessionCodeLens       │   │
│  │  Provider    │  │  lightProv   │  │  staleFlagTree         │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│                        Views Layer (webviews)                     │
│  ┌──────────────────────┐     ┌──────────────────────────────┐   │
│  │    SidebarProvider   │     │     DetailPanelProvider       │   │
│  │  (WebviewView)       │     │   (WebviewPanel per item)     │   │
│  └──────────────────────┘     └──────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│                  Isolated Webview Sandbox (per view)              │
│  HTML + CSS (template literals) + vanilla JS (template literal)  │
│  postMessage() ←→ onDidReceiveMessage()                          │
└──────────────────────────────────────────────────────────────────┘
                              ↕ fetch (Bearer token)
┌──────────────────────────────────────────────────────────────────┐
│                         PostHog API                               │
│  REST: /api/projects/, /api/environments/                        │
│  HogQL: POST /api/environments/{id}/query/                       │
│  OAuth: /oauth/authorize, /oauth/token, /oauth/introspect/       │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| `extension.ts` | Wire all components together, register disposables, load caches on startup | All services, providers, views |
| `authService` | Store/retrieve API key (SecretStorage), host, project ID, auth state (Memento) | postHogService (read token), views (auth state) |
| `postHogService` | All HTTP requests to PostHog API — REST and HogQL | authService (get token), cache services (callers) |
| Cache services (flag/event/experiment) | In-memory data + observer pattern; fire onChange listeners | postHogService (populated by), providers + views (consumed by) |
| `treeSitterService` | AST parsing, find PostHog calls in active document, completion context | Providers (consumed by) |
| `staleFlagService` | Scan all workspace files for flag references, classify staleness | flagCache, experimentCache, treeSitter |
| Providers | VS Code language features — completions, decorations, code actions, CodeLens, links | Cache services, treeSitter |
| `SidebarProvider` | Multi-tab webview in sidebar; tab state, search, lazy load per tab | authService, postHogService, caches, DetailPanelProvider |
| `DetailPanelProvider` | Per-item editor-tab panels (flag, experiment, insight, sessions) | authService, postHogService, flagCache |

---

## New Components for This Milestone

### OAuth Authentication Component

The current auth is API-key-only (`phx_...` personal API key stored in SecretStorage). The new OAuth flow adds:

```
┌─────────────────────────────────────────────────────────────┐
│  NEW: OAuthService (replaces/extends authService)           │
│                                                             │
│  ┌───────────────────────┐  ┌──────────────────────────┐   │
│  │  AuthService          │  │  VS Code UriHandler       │   │
│  │  (existing, extended) │  │  vscode://posthog.codehog │   │
│  │  + OAuth token store  │  │  /callback?code=...       │   │
│  └───────────┬───────────┘  └────────────┬─────────────┘   │
│              │                           │                  │
│              └──────────────┬────────────┘                  │
│                             ↓                               │
│               createSession() completes, fires              │
│               onDidChangeSessions event                     │
└─────────────────────────────────────────────────────────────┘
```

**OAuth flow sequence:**
1. User clicks "Sign in with PostHog" in sidebar
2. Extension generates PKCE code verifier + challenge (crypto.randomBytes)
3. Extension calls `vscode.env.openExternal()` with PostHog authorize URL + redirect to `vscode://posthog.codehog/callback`
4. PostHog redirects browser back to the vscode:// URI
5. Registered `UriHandler.handleUri()` receives the code in query params
6. Extension POSTs to `/oauth/token` with code + verifier
7. Access token stored in `SecretStorage` (same storage as existing API key)
8. `postHogService.request()` needs no changes — still uses `Bearer ${token}`

**Key integration constraint:** PostHog's OAuth redirects must support `vscode://` URIs as allowed redirect URIs. This requires registering the VS Code extension as an OAuth app in PostHog. This is a dependency that must be resolved with the PostHog team before implementation.

**Fallback:** Keep personal API key path working. OAuth is additive — authService gains a second auth path, not a replacement.

**Storage shape (extended authService):**
```typescript
// Existing keys unchanged
StorageKeys.API_KEY          // phx_ personal key OR OAuth access token
StorageKeys.HOST             // still needed (self-hosted instances)
StorageKeys.PROJECT_ID       // still needed
StorageKeys.IS_AUTHENTICATED // still needed

// New keys
StorageKeys.OAUTH_REFRESH_TOKEN  // SecretStorage — refresh token for renewal
StorageKeys.AUTH_METHOD          // Memento: 'apikey' | 'oauth'
```

### Analytics Tab Component (existing, being improved)

The analytics tab already exists in `SidebarProvider` and `layout.ts`. The "Sidebar Analytics tab" item in PROJECT.md refers to improving it. Current state: functional but needs UX polish. Architecture is already correct — lazy load on tab switch, insights cached in `this.insightsCache`.

**Existing data flow (no change needed):**
```
Tab switch to "analytics"
    → SidebarProvider.handleMessage({ type: 'loadInsights' })
    → postHogService.getInsights(projectId)
    → postMessage({ type: 'insights', data: insights })
    → webview script renders insight cards
    → click on insight → openInsightPanel(id)
    → DetailPanelProvider.showInsight(insight)
```

### Code Generation Component

This is a new component that does not exist yet. It generates TypeScript type definitions from feature flag payload schemas.

```
┌──────────────────────────────────────────────────────────────┐
│  NEW: CodegenService                                          │
│                                                             │
│  Input:  FeatureFlag[] from flagCacheService                │
│  Output: TypeScript string (.d.ts or inline)                │
│                                                             │
│  ┌────────────────────────────────────────────────────┐     │
│  │  generateFlagTypes(flags: FeatureFlag[]): string   │     │
│  │    → builds union types from flag variants         │     │
│  │    → builds payload type from flag.filters         │     │
│  │    → returns .d.ts content string                  │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│  NEW: featureFlagCodegenCommand (in featureFlagCommands.ts)   │
│                                                              │
│  1. Reads flagCache.getFlags()                               │
│  2. Calls codegenService.generateFlagTypes()                 │
│  3. Writes file using vscode.workspace.fs.writeFile()        │
│     OR opens virtual document with vscode.workspace.         │
│        openTextDocument({ content, language: 'typescript' }) │
│  4. Shows in editor for user to copy/save                    │
└──────────────────────────────────────────────────────────────┘
```

**Two implementation options:**

Option A — Write to file (recommended): Generate `posthog-flags.d.ts` in workspace root. Uses `vscode.workspace.fs.writeFile()`. User can commit the generated file. This is the model used by tools like GraphQL Codegen and Prisma.

Option B — Virtual document: Open a readonly TypeScript document the user can copy from. No file written. Lower friction but less useful (user must manually save).

Use Option A. It matches how developers expect codegen tools to work.

---

## Recommended Project Structure

The current structure is already correct. New components fit cleanly into it:

```
src/
├── extension.ts                         ← wire new components in activate()
├── services/
│   ├── authService.ts                   ← EXTEND: add OAuth token handling
│   ├── postHogService.ts                ← unchanged (request() already Bearer)
│   ├── flagCacheService.ts              ← unchanged
│   ├── eventCacheService.ts             ← unchanged
│   ├── experimentCacheService.ts        ← unchanged
│   ├── treeSitterService.ts             ← unchanged
│   ├── staleFlagService.ts              ← unchanged
│   └── codegenService.ts               ← NEW: TypeScript type generation
├── providers/
│   └── ...                             ← minor cleanup only (remove dropped)
├── commands/
│   ├── authCommands.ts                  ← EXTEND: add OAuth sign-in command
│   └── featureFlagCommands.ts           ← EXTEND: add codegen command
├── views/
│   ├── SidebarProvider.ts               ← EXTEND: better auth landing UX
│   ├── DetailPanelProvider.ts           ← unchanged
│   └── webview/
│       ├── layout.ts                    ← EXTEND: auth landing redesign
│       ├── script.ts                    ← EXTEND: search/filter UX
│       └── styles.ts                    ← EXTEND: auth landing styles
├── models/types.ts                      ← add OAuth token types
└── constants.ts                         ← add OAuth storage keys, commands
```

### Structure Rationale

- **services/**: `codegenService.ts` is a pure data transformation (flags → TypeScript string). No VS Code UI dependency. Lives in services, not commands.
- **commands/**: Codegen is user-triggered via Command Palette. Command handler in `featureFlagCommands.ts` (file I/O + editor interaction), service does the generation logic.
- **authService.ts (extended)**: OAuth token storage is auth concern. Extend in place rather than create a new service. Keeps the `postHogService` dependency boundary clean.
- **No new views folder needed**: Auth landing improvement is a UX change to existing webview templates, not a new panel.

---

## Architectural Patterns

### Pattern 1: Lazy Tab Loading (existing, proven)

**What:** Sidebar tabs only load their data on first visit. `loadedTabs: Set<string>` guards redundant fetches.
**When to use:** Any sidebar tab that requires an API call on first view.
**Trade-offs:** First tab switch has latency; subsequent visits are instant from cache. Correct trade-off for sidebar UX.

```typescript
// In webview script.ts
if (!loadedTabs.has(tab)) {
    loadedTabs.add(tab);
    send({ type: 'loadFlags' }); // triggers SidebarProvider.loadFlags()
}
```

Analytics tab already uses this. No change needed.

### Pattern 2: Cache + Observer for Decorations (existing, proven)

**What:** Cache services expose `onChange(listener)`. Decoration/highlight providers subscribe and re-render on cache updates. Extension host → cache → provider chain ensures UI stays in sync after any API refresh.
**When to use:** Any provider that renders data from the API.
**Trade-offs:** All providers stay current with zero polling. Memory cost is one Set of listeners per cache.

### Pattern 3: UriHandler + PKCE for OAuth (new)

**What:** Register a `vscode.UriHandler` to capture the OAuth callback. Use PKCE (code verifier + challenge) to secure the flow without a client secret. Store tokens in `SecretStorage`.
**When to use:** OAuth 2.0 authorization code flow from a VS Code extension.
**Trade-offs:** Requires PostHog to register the extension's `vscode://` redirect URI. Simpler and more secure than localhost loopback servers.

```typescript
// In activate()
const uriHandler: vscode.UriHandler = {
    handleUri(uri: vscode.Uri) {
        const code = new URLSearchParams(uri.query).get('code');
        if (code) { authService.completeOAuthFlow(code); }
    }
};
context.subscriptions.push(
    vscode.window.registerUriHandler(uriHandler)
);
```

### Pattern 4: Pure Function Codegen (new)

**What:** `codegenService.generateFlagTypes(flags)` is a pure TypeScript function — takes flag array, returns string. No VS Code API calls inside it.
**When to use:** Any code generation that transforms API data to text.
**Trade-offs:** Fully testable without VS Code. The command handler handles file I/O separately.

```typescript
// services/codegenService.ts
export function generateFlagTypes(flags: FeatureFlag[]): string {
    const flagUnion = flags.map(f => `'${f.key}'`).join(' | ');
    // build variant union, payload type per flag...
    return `// Generated by Codehog\nexport type FeatureFlagKey = ${flagUnion};\n...`;
}
```

---

## Data Flow

### OAuth Sign-In Flow (new)

```
User clicks "Sign in with PostHog"
    ↓
authCommands.ts: SIGN_IN_OAUTH command
    ↓
authService.startOAuthFlow()
    → generate PKCE code_verifier, code_challenge
    → store code_verifier in memory (not persisted)
    → build authorize URL: {host}/oauth/authorize?client_id=...&code_challenge=...&redirect_uri=vscode://posthog.codehog/callback
    ↓
vscode.env.openExternal(authorizeUrl)
    → browser opens, user authenticates
    → PostHog redirects to vscode://posthog.codehog/callback?code=AUTH_CODE
    ↓
UriHandler.handleUri(uri)
    → extract code from uri.query
    ↓
authService.completeOAuthFlow(code)
    → POST {host}/oauth/token with code + code_verifier
    → receive { access_token, refresh_token }
    → SecretStorage.store(StorageKeys.API_KEY, access_token)
    → SecretStorage.store(StorageKeys.OAUTH_REFRESH_TOKEN, refresh_token)
    → globalState.update(StorageKeys.AUTH_METHOD, 'oauth')
    → setAuthenticated(true)
    ↓
sidebar.refresh()
    → postMessage({ type: 'authState', authenticated: true })
    → webview renders main app
```

### Code Generation Flow (new)

```
User: Command Palette → "PostHog: Generate Flag Types"
    ↓
featureFlagCommands.ts: GENERATE_FLAG_TYPES command
    ↓
flagCache.getFlags()  (already loaded)
    ↓
codegenService.generateFlagTypes(flags)
    → returns TypeScript string
    ↓
Find workspace root via vscode.workspace.workspaceFolders[0].uri
    ↓
vscode.workspace.fs.writeFile(uri, Uint8Array.from(content))
    ↓
vscode.workspace.openTextDocument(uri) → vscode.window.showTextDocument()
    → file opens in editor
    ↓
vscode.window.showInformationMessage('Generated posthog-flags.d.ts')
```

### Analytics Tab Flow (existing — no change)

```
Tab click → loadedTabs guard → send({ type: 'loadInsights' })
    ↓
SidebarProvider.loadInsights()
    ↓
postHogService.getInsights(projectId) → POST immediately
postHogService.refreshInsight(id) for stale ones → in parallel
    ↓
postMessage({ type: 'insights', data })
    ↓
webview renders insight cards
    ↓
click card → send({ type: 'openInsightPanel', id })
    ↓
DetailPanelProvider.showInsight(insight)
```

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PostHog REST API | Bearer token in Authorization header, all calls through `postHogService.request<T>()` | Token is either phx_ key or OAuth access token — same header either way |
| PostHog OAuth endpoints | `/oauth/authorize` (browser redirect) + `/oauth/token` (extension HTTP POST) | Requires PostHog to allowlist `vscode://` redirect URIs — verify before building |
| VS Code SecretStorage | `context.secrets.store/get/delete` — OS keychain backed | Already in use for API key |
| VS Code UriHandler | `vscode.window.registerUriHandler` | One handler per extension; must register in `activate()` |
| Filesystem (codegen) | `vscode.workspace.fs.writeFile()` — async, handles remote workspaces | Prefer over Node.js `fs` to work with remote/Codespaces |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `authService` ↔ `postHogService` | Direct method call: `authService.getApiKey()` inside `request()` | No change needed for OAuth — same method returns whatever token is stored |
| `extension.ts` ↔ all providers | Constructor injection at activation time | No DI framework — keep as-is |
| `SidebarProvider` ↔ `DetailPanelProvider` | Direct method call reference passed in constructor | Keep as-is |
| Cache services ↔ providers | Observer pattern: `cache.onChange(() => triggerUpdate())` | Keep as-is |
| Extension host ↔ webview | JSON message passing only — `postMessage` / `onDidReceiveMessage` | All webview state is in the webview; extension is source of truth for data |
| `codegenService` ↔ `flagCache` | Caller (command) fetches flags from cache, passes array to pure function | Keeps service testable without VS Code |

---

## Anti-Patterns

### Anti-Pattern 1: Storing OAuth Tokens in globalState

**What people do:** Store OAuth tokens (including refresh tokens) in `globalState` (Memento) for convenience since it's already used for other auth state.

**Why it's wrong:** `globalState` is stored in plain text in VS Code's SQLite database. Tokens are credentials. On compromise, the attacker gets long-lived access to the user's PostHog account.

**Do this instead:** Store all tokens (API key and OAuth tokens) in `context.secrets` (SecretStorage), which is backed by the OS keychain. Only store non-sensitive metadata (host, projectId, authMethod) in globalState.

### Anti-Pattern 2: Calling PostHog API Directly from Webview

**What people do:** Add fetch calls directly in webview script.ts to avoid the message-passing round-trip.

**Why it's wrong:** Webviews run in a sandboxed context. They can't access VS Code secrets, so they'd need the API key embedded in the HTML (visible in source). CSP violations. No error handling integration. Creates two code paths for the same API.

**Do this instead:** All API calls go through the extension host via `postMessage`. Webview sends `{ type: 'loadXxx' }`, extension host calls `postHogService`, sends result back with `{ type: 'xxx', data }`.

### Anti-Pattern 3: Using Node.js `fs` for Codegen File Output

**What people do:** `const fs = require('fs'); fs.writeFileSync(path, content)` — simpler to write.

**Why it's wrong:** Breaks in remote development (SSH, Containers, Codespaces). VS Code runs the extension host remotely but the file system is also remote. Node.js `fs` operates on the local machine the extension host runs on, which may not be the workspace root.

**Do this instead:** Use `vscode.workspace.fs.writeFile(uri, content)` — it routes writes correctly regardless of whether the workspace is local or remote.

### Anti-Pattern 4: Creating New Views for Small UX Changes

**What people do:** Create a new `SidebarAuthView` or similar for the "better auth landing" feature.

**Why it's wrong:** The auth landing is already part of `SidebarProvider`'s `#welcome-screen` div. Creating a separate view splits auth state management and adds registration overhead for a change that is purely HTML/CSS.

**Do this instead:** Update the HTML template in `views/webview/layout.ts` and the CSS in `styles.ts`. The existing conditional `display:none` pattern on `#welcome-screen` vs `#main-app` is exactly right.

---

## Build Order Implications

Dependencies determine the correct order to implement the milestone features:

1. **Cleanup first (remove dropped features)** — Remove `errorCacheService`, `errorDecorationProvider`, `HogQLEditorProvider`, `captureCodeActionProvider`, Python/Go/Ruby support. Reduces noise, makes subsequent changes cleaner. No dependencies.

2. **Auth UX improvements (better landing page)** — HTML/CSS only changes in `layout.ts` and `styles.ts`. No new services. Unblocks visual testing of the auth flow before OAuth is wired.

3. **OAuth flow** — Depends on authService, adds UriHandler. Must extend `authService.ts` and `authCommands.ts`. No other components depend on the auth method (token is still `Bearer`), so this can land independently. **Blocked on:** PostHog confirming `vscode://` as an allowed redirect URI.

4. **Sidebar search/filter** — Pure webview JS change in `script.ts` and CSS. No service dependencies. Can land any time.

5. **Analytics tab improvements** — The tab exists. Any improvements are webview changes or postHogService additions. No new component boundaries.

6. **Code generation** — Depends on `flagCacheService` (already stable). Add `codegenService.ts` (pure function), then wire into `featureFlagCommands.ts`. No dependency on OAuth or other new features.

---

## Scaling Considerations

VS Code extensions do not scale in the traditional server sense. The relevant scaling axes are:

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Small project (< 50 flags) | Current in-memory caches are correct — full load on startup |
| Large project (500+ flags) | Pagination already handled. Consider lazy loading flag details (variants/results) only when flag detail panel opens |
| Multiple projects | Current single-project model is correct for v1. Project switching works via `SELECT_PROJECT` command |
| Self-hosted PostHog | Host stored in globalState, passed to all requests. OAuth redirect URI must also be configurable if PostHog self-hosted instance registers different client_id |

---

## Sources

- VS Code Webview API: https://code.visualstudio.com/api/extension-guides/webview (HIGH confidence)
- VS Code UriHandler / OAuth flow: https://www.eliostruyf.com/create-authentication-provider-visual-studio-code/ (MEDIUM confidence — community article, pattern verified against VS Code API docs)
- VS Code SecretStorage: https://code.visualstudio.com/api/references/vscode-api (HIGH confidence)
- PKCE recommendation in VS Code extensions: GitHub issue #252892 microsoft/vscode (MEDIUM confidence)
- PostHog OAuth introspection endpoint: Search results from posthog.com (MEDIUM confidence — endpoint confirmed, full scope list not verified)
- Existing codebase analysis: direct inspection of `/Users/fcgomes/codehog/src/` (HIGH confidence)

---
*Architecture research for: Codehog VS Code extension — OAuth, analytics tab, code generation, UX improvements*
*Researched: 2026-03-30*
