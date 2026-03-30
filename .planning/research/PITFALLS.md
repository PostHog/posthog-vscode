# Pitfalls Research

**Domain:** VS Code extension — OAuth addition, feature removal, refactoring
**Researched:** 2026-03-30
**Confidence:** HIGH (OAuth/VSCode API patterns from official docs + codebase inspection), MEDIUM (PostHog OAuth specifics from PostHog Code repo analysis)

---

## Critical Pitfalls

### Pitfall 1: OAuth Redirect URI Not Registered with PostHog

**What goes wrong:**
PostHog's OAuth server rejects the authorization code exchange with `redirect_uri_mismatch`. The extension opens the browser, the user authenticates, but the callback never completes. The OAuth flow silently fails or shows a cryptic error.

**Why it happens:**
PostHog OAuth requires the redirect URI used in the `/authorize` request to exactly match a URI pre-registered on the OAuth application. VS Code extension OAuth typically uses one of three URI patterns:
- `vscode://publisher.extension-name/callback` — via `vscode.window.registerUriHandler`
- `http://127.0.0.1:<port>/callback` — via a local loopback server
- `https://vscode.dev/redirect` — via VS Code's proxy

If the PostHog OAuth app is not configured to accept the specific URI the extension sends, every authentication attempt fails. PostHog Code (the desktop app) uses `http://localhost:8237/callback` and `http://localhost:8239/callback`. Codehog will need its own registered redirect URI, and that app must exist as a PostHog OAuth application before shipping.

**How to avoid:**
Register a PostHog OAuth application with the exact redirect URI scheme chosen for the extension before writing the auth flow code. Decide the redirect URI strategy first (URI handler vs loopback), register it, then implement. Do not hard-code PostHog Code's client ID (`DC5uRLVbGI02YQ82grxgnK6Qn12SXWpCqdPb60oZ`) — that is for the Electron desktop app, not this extension.

**Warning signs:**
- The browser opens PostHog's authorize page but VS Code never receives the callback
- Console shows `redirect_uri_mismatch` or `invalid_client` errors
- The state parameter sent in `/authorize` never arrives back in the extension

**Phase to address:**
OAuth implementation phase — must be resolved before any auth code is written.

---

### Pitfall 2: Package.json Contributions Outliving the Code That Backs Them

**What goes wrong:**
Commands, grammars, and language contributions declared in `package.json` remain visible to users even after the backing implementation is deleted. This shows up as:
- "PostHog: Open HogQL Editor" appearing in the Command Palette but doing nothing (the command is registered but the provider is gone)
- `.hogql` files appearing to have syntax highlighting until the extension reloads
- "PostHog: Track Function with PostHog" (captureCodeActionProvider) persisting as a code action

**Why it happens:**
`package.json` manifest contributions and TypeScript implementation are maintained separately. When removing a feature, developers delete the TypeScript file first, then either forget the `package.json` entries or assume "I'll clean that up later." The extension still activates, the command ID exists in the palette, but calling it throws an unregistered command error (or does nothing if the command is registered elsewhere).

Currently in the codebase, the following must be removed together:
- `HogQLEditorProvider`: `package.json` → `languages[hogql]`, `grammars[source.hogql]`, `commands[openHogQLEditor/runHogQLFile]`, `menus[editor/title]`, `syntaxes/hogql.tmLanguage.json`, `language-configuration.json` | `extension.ts` → import, instantiation, two command registrations
- `captureCodeActionProvider`: `package.json` → `commands[insertCapture]` | `extension.ts` → import, instantiation, code action registration, command registration
- `errorCacheService` + `errorDecorationProvider`: `extension.ts` → import, instantiation, startup load call, `register()` call; `SidebarProvider.ts` → `errorCache` constructor parameter

**How to avoid:**
For each feature being removed, audit all three locations before touching any file: (1) `package.json` `contributes`, (2) `extension.ts` imports + wiring, (3) the feature's own files. Remove all three atomically in a single commit. After removal, run `pnpm compile` and verify zero TypeScript errors, then manually open the Command Palette and confirm the removed commands no longer appear.

**Warning signs:**
- Stale commands appear in Command Palette after removal
- TypeScript compiles cleanly but `.hogql` files still syntax-highlight
- `console.warn: command 'posthog.openHogQLEditor' not found` in extension host log

**Phase to address:**
Dead code removal phase — address all three surfaces simultaneously, not incrementally.

---

### Pitfall 3: OAuth Token Stored in Wrong Location (globalState Instead of SecretStorage)

**What goes wrong:**
Access tokens or refresh tokens are persisted in `globalState` (which is stored in plain JSON on disk) instead of `SecretStorage`. Tokens are exposed to any process that can read VS Code's globalStorage files. This is a security failure that will be flagged in VS Code Marketplace security reviews.

**Why it happens:**
The existing `AuthService` already uses `SecretStorage` for the API key. When adding OAuth, developers sometimes store the entire session object (including tokens) in `globalState` for convenience — it's simpler to serialize and has no async store/retrieve. The temptation is to use `globalState.update('oauth.session', { access_token, refresh_token, expires_at })`.

**How to avoid:**
Store access token and refresh token exclusively in `context.secrets` (SecretStorage). Store only non-sensitive metadata (expiry timestamp, token type) in `globalState`. The existing `AuthService` pattern must be extended: add `setOAuthTokens(access: string, refresh: string)` storing both in SecretStorage under separate keys, and `setOAuthMeta(expiresAt: number)` in globalState. Never log tokens — add a lint rule or code review checklist.

**Warning signs:**
- Any call to `globalState.update()` that includes a value containing the word "token" or "key"
- Session objects serialized with `JSON.stringify` stored in globalState
- Tokens visible in VS Code's `globalStorage/<extension-id>/state.vscdb` SQLite file

**Phase to address:**
OAuth implementation phase — the `AuthService` refactor must establish secure storage before any token is received.

---

### Pitfall 4: OAuth State Parameter Missing or Reused (CSRF Vulnerability)

**What goes wrong:**
The extension starts an OAuth flow, opens the browser, but does not validate the `state` parameter on callback. An attacker can craft a callback URL with a valid authorization code obtained from a different session and inject it into the extension, leading to account takeover.

**Why it happens:**
State validation is easy to overlook because it appears to "work" without it during happy-path development. The URI handler receives the callback, extracts the `code`, exchanges it for a token — done. The state check feels like extra boilerplate that only matters theoretically.

**How to avoid:**
Generate a cryptographically random state value (use `crypto.randomBytes(16).toString('hex')` or equivalent — not `Math.random()`) before opening the browser. Store it temporarily in memory (not storage). In the URI handler, compare the received `state` to the stored value and reject mismatches immediately. Discard the state value after a single use or after a 5-minute timeout.

**Warning signs:**
- The OAuth flow works without a state parameter in local testing
- State value is derived from predictable data (timestamp, extension version)
- State is stored in `globalState` before the flow starts (making it persistent and reusable)

**Phase to address:**
OAuth implementation phase — must be part of the initial implementation, not a follow-up hardening pass.

---

### Pitfall 5: Sidebar Analytics Tab Blocked by PostHog's CSP / X-Frame-Options

**What goes wrong:**
The analytics tab attempts to embed PostHog saved insights using an iframe pointed at `app.posthog.com`. The iframe fails silently or shows a blank panel because PostHog sets `X-Frame-Options: SAMEORIGIN` or a `frame-ancestors` CSP that blocks cross-origin embedding. The feature looks broken to every user.

**Why it happens:**
VS Code webviews are iframes themselves, running in a sandboxed context. Even if the extension's own CSP allows `frame-src`, the remote server (PostHog) controls whether it can be embedded. PostHog's application frontend is not designed to be iframed by third-party tools. The public sharing/embedding feature (`posthog.com/shared/...`) is the only iframe-friendly endpoint.

**How to avoid:**
Do not attempt to embed the authenticated PostHog app UI in an iframe. Instead:
1. Use PostHog's REST API to fetch saved insight data and render it natively in the webview
2. If embedding is required, use only publicly-shared insight URLs (`/shared/<token>`) which are designed for embedding
3. Provide a "Open in PostHog" link as the primary interaction, with data fetched via API for in-sidebar display

Verify the chosen approach against PostHog's `X-Frame-Options` headers before committing to an architecture.

**Warning signs:**
- Blank iframe in development testing
- Browser devtools console showing `Refused to frame` errors
- PostHog app responds with `X-Frame-Options: SAMEORIGIN`

**Phase to address:**
Analytics tab implementation phase — architecture decision must be made before any webview HTML is written.

---

### Pitfall 6: Tree-Sitter Language Removal Leaves Dead WASM Files and Stale supportedLanguages

**What goes wrong:**
Python, Go, and Ruby support is removed from the TypeScript code, but the corresponding WASM files remain in `wasm/` and the languages remain in `treeSitter.supportedLanguages`. Providers continue to be registered for those language IDs, and users with `.py`, `.go`, `.rb` files see ghost completions or decorations.

**Why it happens:**
`treeSitterService.ts` defines `supportedLanguages` as a derived list from the language families registered. If the language family objects are removed from TypeScript but the WASM binaries remain, nothing breaks at compile time. The `languageSelector` in `extension.ts` will no longer include those languages (if correctly removed), but the WASM files inflate the extension bundle unnecessarily (typically 1-3MB per language grammar).

**How to avoid:**
When removing Python/Go/Ruby language families from `treeSitterService.ts`:
1. Delete `wasm/tree-sitter-python.wasm`, `wasm/tree-sitter-go.wasm`, `wasm/tree-sitter-ruby.wasm`
2. Remove the language families from the language config map in `treeSitterService.ts`
3. Remove associated query strings (`PY_QUERIES`, `GO_QUERIES`, `RB_QUERIES`)
4. Verify `treeSitter.supportedLanguages` only returns `['javascript', 'typescript', 'tsx']`
5. Check `webpack.config.js` for any copy-plugin rules that bundle the removed WASM files

Run `pnpm package` and inspect the `.vsix` size — it should drop noticeably after WASM removal.

**Warning signs:**
- `.vsix` bundle size does not decrease after removing language support
- `treeSitter.isSupported('python')` returns `true` after removal
- WASM files still present in `dist/` after build

**Phase to address:**
Dead code / language scope reduction phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `errorCache` parameter in `SidebarProvider` constructor as optional but unused | Avoids touching SidebarProvider during removal | Confused future developers, dead optional parameter | Never — remove it cleanly |
| Reuse PostHog Code's OAuth client_id | No PostHog OAuth app registration needed immediately | Auth will break if PostHog Code changes its app; no extension-specific scopes | Never — register a separate app |
| Store OAuth token in `globalState` for simplicity | Synchronous reads, no async | Security failure, marketplace rejection | Never |
| Keep `hogql` language registration in package.json but comment it out | Easy to re-enable | Stale entries confuse the manifest, waste parse time | Never — delete entirely |
| Add analytics tab as iframe pointing to authenticated PostHog UI | Fast to implement | Will fail at runtime due to X-Frame-Options | Never |
| Skip PKCE for the initial OAuth implementation | Less code, simpler flow | CSRF risk if redirect URI can be guessed; PostHog OAuth may require it | Never for production |
| Leave Python/Go/Ruby WASM files in place to "support later" | Avoids touching webpack config | Inflates extension bundle by 3-6MB; slower activation | Only if re-adding within same milestone |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| PostHog OAuth | Using `localhost` as redirect URI without registering it in the PostHog OAuth app first | Register the OAuth application with exact redirect URI before implementing the flow |
| PostHog OAuth | Assuming PostHog supports `vscode://` URI scheme as redirect URI | Confirm supported redirect URI schemes with PostHog; use localhost loopback if `vscode://` is unsupported |
| PostHog OAuth | Copying client_id from PostHog Code's constants | Register a separate OAuth app for Codehog with its own client_id and redirect URIs |
| PostHog Insights API | Fetching insights without specifying a project environment ID | Use `/api/environments/{id}/` prefix (the codebase already does this for other endpoints) |
| VS Code SecretStorage | Reading the secret synchronously | `getApiKey()` is async — `secretStorage.get()` returns a Promise; the existing AuthService already handles this correctly |
| VS Code URI Handler | Registering the URI handler after `openExternal` opens the browser | Register `vscode.window.registerUriHandler` during `activate()`, not lazily when auth starts — VS Code may receive the callback before the handler is registered |
| Webview CSP | Using `unsafe-inline` for scripts to avoid nonce management | Always use nonce-based CSP (`script-src 'nonce-${nonce}'`); the existing codebase already does this correctly |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Analytics tab fetches all insights on every sidebar open | Sidebar feels slow; PostHog API rate limits hit | Cache insights in `eventCacheService`-style service; refresh on demand, not on mount | With more than ~20 saved insights |
| Session CodeLens auto-refresh running after deactivation | Memory leak, orphaned timers in test | `sessionCodeLensProvider.startAutoRefresh()` returns a Disposable — already pushed to `context.subscriptions`; verify this is maintained after any auth refactor | Immediately on extension deactivate if improperly handled |
| Tree-sitter parses all open documents on every cache update | Visible decoration lag in editors with many open files | The existing 200ms debounce covers this; do not remove it during refactoring | With 10+ open TS/JS files simultaneously |
| OAuth token refresh on every API call | API rate limits from PostHog; slow decorations | Store `expires_at` in globalState; only refresh when `Date.now() > expires_at - 60_000` | Immediately if token expiry is not tracked |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing OAuth access token in `globalState` (plain JSON on disk) | Token readable by any local process; leaked in diagnostics | Use `context.secrets.store()` exclusively for all token values |
| Using `Math.random()` for OAuth state or PKCE code verifier | Predictable values enable CSRF attacks | Use `crypto.randomBytes(16).toString('hex')` for state and `crypto.randomBytes(32).toString('base64url')` for PKCE verifier |
| Logging token values during OAuth flow debugging | Tokens appear in VS Code extension host output channel | Never log token values; log only their presence (`token received: [REDACTED]`) |
| Constructing HogQL queries with unsanitized user values | SQL-injection-equivalent in HogQL analytics queries | The codebase already has `escapeHogQLString()`; use it consistently in analytics tab queries |
| Embedding PostHog app UI in webview iframe with `allow-scripts` sandbox | Allows PostHog JS to execute in extension context | Never iframe authenticated PostHog app UI; use API data only |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| OAuth flow opens browser but shows no feedback in VS Code while waiting | User thinks the extension is broken; tries to auth multiple times | Show a progress notification ("Waiting for PostHog authentication in browser...") that cancels if user dismisses it |
| Auth landing page redirects to OAuth but keeps old API key UI | Mixed signals about which auth method is current | Display auth method currently in use (API key vs OAuth); don't show both simultaneously |
| Analytics tab loads with no skeleton state | Blank panel while data fetches; looks broken | Show loading skeleton / spinner immediately; populate when data arrives |
| Code generation inserts types into wrong file | Unexpected file opened; cursor jumps | Confirm generation target before writing; default to a new file adjacent to the workspace root |
| Removing stale commands (HogQL, insertCapture) with no migration notice | Users who had keybindings for those commands see silent failures | Removed commands do not need migration notices — they were "Active" items never shipped in stable; omit `deprecated` handling |

---

## "Looks Done But Isn't" Checklist

- [ ] **OAuth sign-in:** Verify sign-out correctly deletes both access AND refresh tokens from SecretStorage — not just the API key
- [ ] **OAuth sign-in:** Verify `isAuthenticated()` returns `false` before tokens are exchanged (not just when the browser opens)
- [ ] **HogQL removal:** Confirm `language-configuration.json` and `syntaxes/hogql.tmLanguage.json` are deleted from the repo, not just un-referenced
- [ ] **HogQL removal:** Confirm the `posthog.openHogQLEditor` and `posthog.runHogQLFile` commands no longer appear in the Command Palette
- [ ] **captureCodeActionProvider removal:** Confirm `posthog.insertCapture` is not listed in `package.json` `contributes.commands`
- [ ] **captureCodeActionProvider removal:** Confirm the code action no longer appears when hovering a function
- [ ] **errorCacheService removal:** Confirm `SidebarProvider` constructor no longer accepts `errorCache` parameter
- [ ] **Python/Go/Ruby removal:** Confirm WASM files removed from `wasm/` directory
- [ ] **Python/Go/Ruby removal:** Confirm `treeSitter.isSupported('python')` returns `false`
- [ ] **Analytics tab:** Verify insights load with a populated PostHog project (not just with an empty project)
- [ ] **Code generation:** Verify generated TypeScript types compile without errors in the user's project
- [ ] **Auth landing page:** Verify the page renders correctly in both light and dark VS Code themes

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong redirect URI registered | LOW | Update PostHog OAuth app redirect URI; no code change needed if URI was already correct in code |
| Access token leaked to globalState | HIGH | Force sign-out of all users; rotate the OAuth application secret; ship a patch that migrates globalState tokens to SecretStorage on next launch |
| stale package.json contributions shipped | LOW | Remove from `package.json`; bump patch version; publish; VS Code auto-updates within 24h |
| WASM files not removed from bundle | LOW | Delete files; rebuild; re-publish; no user-visible impact beyond smaller bundle |
| Analytics iframe blocked | MEDIUM | Switch from iframe to API-fetched data rendering; requires new API calls + new webview HTML |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| OAuth redirect URI not registered | Phase: OAuth planning (before code) | Confirm PostHog OAuth app exists with correct redirect URI |
| package.json contributions outliving code | Phase: Dead code removal | `pnpm compile` passes; Command Palette audit |
| OAuth tokens in globalState | Phase: OAuth implementation (AuthService refactor) | grep codebase for `globalState.update` with token values |
| Missing OAuth state validation | Phase: OAuth implementation | Code review checklist; unit test for state mismatch rejection |
| Sidebar analytics iframe blocked | Phase: Analytics tab design | HTTP HEAD check against PostHog insight URL for X-Frame-Options |
| Dead WASM files remaining | Phase: Language scope reduction | `ls wasm/` after removal; `.vsix` size comparison |

---

## Sources

- VS Code Remote Extension documentation on URI handlers and `vscode.env.asExternalUri`: https://code.visualstudio.com/api/advanced-topics/remote-extensions (HIGH confidence — official docs)
- VS Code OAuth redirect URI mismatch issue (trailing slash): https://github.com/microsoft/vscode/issues/260425 (MEDIUM confidence — community issue with official resolution)
- PostHog Code OAuth configuration (client_id, redirect URIs, public client type): https://github.com/PostHog/code/blob/main/docs/LOCAL-DEVELOPMENT.md (MEDIUM confidence — official PostHog repo)
- VS Code Authentication Provider implementation guide: https://www.eliostruyf.com/create-authentication-provider-visual-studio-code/ (MEDIUM confidence — well-documented community source)
- VS Code disposables and subscription leak pattern: https://github.com/microsoft/vscode/issues/140697 (HIGH confidence — official VS Code repo)
- VS Code Webview CSP and iframe blocking: https://code.visualstudio.com/api/extension-guides/webview (HIGH confidence — official docs)
- VS Code webview iframe blocking issue: https://github.com/microsoft/vscode/issues/209543 (MEDIUM confidence — official repo issue)
- Trail of Bits VS Code webview security escape: https://blog.trailofbits.com/2023/02/21/vscode-extension-escape-vulnerability/ (HIGH confidence — security research with official CVE)
- Codebase inspection: `extension.ts`, `authService.ts`, `HogQLEditorProvider.ts`, `captureCodeActionProvider.ts`, `treeSitterService.ts`, `package.json` (HIGH confidence — direct source)

---
*Pitfalls research for: VS Code extension refactoring — OAuth addition, feature removal, dead code cleanup*
*Researched: 2026-03-30*
