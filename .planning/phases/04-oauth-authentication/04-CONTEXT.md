# Phase 4: OAuth Authentication - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Add OAuth PKCE authentication flow with PostHog as the provider. Personal API key sign-in must remain fully functional as an alternative. User can sign in via OAuth (browser opens, redirects back to VS Code) or via API key (existing flow). User can sign out and switch between methods.

</domain>

<decisions>
## Implementation Decisions

### OAuth flow mechanics
- Use `vscode.window.registerUriHandler` to receive OAuth callback at `vscode://posthog.posthog-vscode/callback`
- Use `vscode.env.asExternalUri` to construct the callback URI (works in Codespaces/remote SSH/vscode.dev)
- PKCE authorization code flow with S256 challenge (no client secret stored in extension)
- Generate code_verifier with `crypto.randomBytes(32)`, derive challenge with `crypto.createHash('sha256')`
- Generate state parameter with `crypto.randomBytes(16).toString('hex')` — store in memory only, validate on callback, discard after single use
- PostHog OAuth endpoints: `{host}/oauth/authorize` and `{host}/oauth/token` (must be confirmed with PostHog team)
- Open browser via `vscode.env.openExternal(authorizeUri)`

### Token storage
- Access token stored in SecretStorage (`posthog.oauthAccessToken`)
- Refresh token stored in SecretStorage (`posthog.oauthRefreshToken`)
- Auth method stored in globalState (`posthog.authMethod`: `'api_key' | 'oauth'`)
- Token expiry stored in globalState (`posthog.tokenExpiry`: ISO timestamp)
- On each API request: check expiry, refresh if needed before proceeding
- Existing API key storage remains unchanged

### Auth method switching
- Landing page shows two buttons: "Sign In with PostHog" (OAuth, primary) and "Sign In with API Key" (secondary/fallback)
- Both methods set `isAuthenticated = true` and populate the same project context
- Sign out clears whichever auth method was used
- User can sign out and choose a different method
- Switching method doesn't require re-selecting the project if it's already set

### AuthService extension
- Add new methods: `setOAuthTokens(access, refresh, expiry)`, `getOAuthAccessToken()`, `refreshOAuthToken()`, `getAuthMethod()`, `setAuthMethod(method)`
- Modify `getApiKey()` to return OAuth access token when auth method is 'oauth'
- This keeps PostHogService transparent — it just calls `getApiKey()` regardless of auth method
- Register UriHandler in `extension.ts` `activate()`

### Error handling and fallback
- If OAuth callback fails: show error message, user can retry or fall back to API key
- If token refresh fails: show re-authentication prompt, don't silently break
- If PostHog doesn't support `vscode://` URI scheme: document in README, suggest API key as alternative
- State parameter mismatch: reject silently (security — don't show detailed error)
- Network errors during token exchange: show user-friendly error with retry option

### Claude's Discretion
- Exact OAuth endpoint paths (may need adjustment based on PostHog's actual endpoints)
- Token refresh interval strategy (eager vs lazy refresh)
- Whether to show a loading indicator during OAuth flow
- Exact error message wording

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth system (files to modify)
- `src/services/authService.ts` — Current auth service with SecretStorage + Memento pattern
- `src/commands/authCommands.ts` — Current sign-in/sign-out command implementations
- `src/services/postHogService.ts` — Uses `authService.getApiKey()` for all API calls
- `src/constants.ts` — StorageKeys, Commands

### Landing page (to add OAuth button)
- `src/views/webview/layout.ts` — Welcome screen HTML (has "Sign In with API Key" button)
- `src/views/webview/styles.ts` — Welcome screen CSS
- `src/views/webview/script.ts` — Auth state handling, message passing

### Requirements
- `.planning/REQUIREMENTS.md` — AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06

### Research (OAuth specifics)
- `.planning/research/STACK.md` — OAuth stack recommendations
- `.planning/research/ARCHITECTURE.md` — OAuth component boundaries
- `.planning/research/PITFALLS.md` — OAuth security pitfalls (redirect URI, state validation, token storage)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AuthService` class: already uses SecretStorage for API key — extend with OAuth token methods
- `postHogService.request<T>()`: uses `authService.getApiKey()` — if `getApiKey()` transparently returns OAuth token, zero changes needed
- `registerAuthCommands()`: returns `vscode.Disposable[]` — add OAuth sign-in command alongside existing API key flow
- Welcome screen `#btn-sign-in`: existing API key button — add OAuth button alongside it

### Established Patterns
- SecretStorage for sensitive data (API key) — same for OAuth tokens
- globalState (Memento) for non-sensitive metadata — same for auth method flag
- `setAuthenticated(true/false)` as central auth state toggle — reuse for OAuth
- Commands registered in `registerAuthCommands()` and returned as disposables

### Integration Points
- `extension.ts:activate()` — register UriHandler here
- `authService.ts` — extend with OAuth methods
- `authCommands.ts` — add OAuth sign-in command
- `postHogService.ts` — may need token refresh interception
- `layout.ts` — add "Sign In with PostHog" button to welcome screen
- `script.ts` — add OAuth button click handler with `vscode.postMessage`
- `SidebarProvider.ts` — handle new OAuth-related messages

</code_context>

<specifics>
## Specific Ideas

- PostHog OAuth app registration is an EXTERNAL DEPENDENCY — must be confirmed before implementation
- If PostHog doesn't support `vscode://` redirect URIs, need a fallback strategy (localhost redirect server or proxy)
- The OAuth flow should feel seamless — click button, browser opens, redirects back, done
- API key flow must keep working exactly as it does now — OAuth is additive, not a replacement

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-oauth-authentication*
*Context gathered: 2026-03-30*
