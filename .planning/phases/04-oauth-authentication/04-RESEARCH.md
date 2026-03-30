# Phase 4: OAuth Authentication - Research

**Researched:** 2026-03-30
**Domain:** VS Code extension OAuth PKCE flow + PostHog as OAuth provider
**Confidence:** HIGH (VS Code side), LOW-MEDIUM (PostHog OAuth registration specifics)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `vscode.window.registerUriHandler` to receive OAuth callback at `vscode://posthog.posthog-vscode/callback`
- Use `vscode.env.asExternalUri` to construct the callback URI (works in Codespaces/remote SSH/vscode.dev)
- PKCE authorization code flow with S256 challenge (no client secret stored in extension)
- Generate code_verifier with `crypto.randomBytes(32)`, derive challenge with `crypto.createHash('sha256')`
- Generate state parameter with `crypto.randomBytes(16).toString('hex')` — store in memory only, validate on callback, discard after single use
- PostHog OAuth endpoints: `{host}/oauth/authorize` and `{host}/oauth/token` (must be confirmed with PostHog team)
- Open browser via `vscode.env.openExternal(authorizeUri)`
- Access token stored in SecretStorage (`posthog.oauthAccessToken`)
- Refresh token stored in SecretStorage (`posthog.oauthRefreshToken`)
- Auth method stored in globalState (`posthog.authMethod`: `'api_key' | 'oauth'`)
- Token expiry stored in globalState (`posthog.tokenExpiry`: ISO timestamp)
- On each API request: check expiry, refresh if needed before proceeding
- Existing API key storage remains unchanged
- Landing page shows two buttons: "Sign In with PostHog" (OAuth, primary) and "Sign In with API Key" (secondary/fallback)
- Both methods set `isAuthenticated = true` and populate the same project context
- Sign out clears whichever auth method was used
- New AuthService methods: `setOAuthTokens(access, refresh, expiry)`, `getOAuthAccessToken()`, `refreshOAuthToken()`, `getAuthMethod()`, `setAuthMethod(method)`
- Modify `getApiKey()` to return OAuth access token when auth method is 'oauth'
- Register UriHandler in `extension.ts` `activate()`

### Claude's Discretion
- Exact OAuth endpoint paths (may need adjustment based on PostHog's actual endpoints)
- Token refresh interval strategy (eager vs lazy refresh)
- Whether to show a loading indicator during OAuth flow
- Exact error message wording

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-02 | User can sign in via OAuth (PostHog PKCE authorization code flow) | VS Code UriHandler + PKCE pattern confirmed. PostHog endpoints `{host}/oauth/authorize` and `{host}/oauth/token` confirmed via handbook reference; registration is external dependency. |
| AUTH-03 | OAuth tokens are stored exclusively in VS Code SecretStorage | SecretStorage API confirmed HIGH confidence. Access token under `posthog.oauthAccessToken`, refresh token under `posthog.oauthRefreshToken`. |
| AUTH-04 | OAuth callback validates state parameter to prevent CSRF | State = `crypto.randomBytes(16).toString('hex')`, stored in memory only, discarded after single use. Mismatch = silent reject. |
| AUTH-05 | User can still sign in via personal API key as fallback | Existing `SIGN_IN` command and `authCommands.ts` flow is untouched. Landing page retains "Sign In with API Key" button alongside new OAuth button. |
| AUTH-06 | User can sign out and switch between auth methods | Sign out command extended to clear both auth method paths. Auth method stored in globalState; switching requires sign out + re-sign in via preferred method. |
</phase_requirements>

---

## Summary

Phase 4 adds a PKCE OAuth 2.0 authorization code flow to the Codehog VS Code extension with PostHog as the OAuth provider. The VS Code side of this implementation is well-understood and follows established patterns used by GitHub, GitLab, and Azure extensions. The PostHog server side has one external dependency that is a confirmed blocker: the extension must be registered as an OAuth application with PostHog before the flow can complete.

The technical work falls into three clean areas: (1) extend `AuthService` with OAuth token methods, (2) register a `UriHandler` in `activate()` that wires the callback into an in-flight auth promise, (3) update the webview landing page with a second sign-in button. The `PostHogService.request()` method requires no changes because `getApiKey()` will be made transparent — it returns the OAuth access token when the auth method is OAuth.

The critical external risk is that PostHog's OAuth server uses `django-oauth-toolkit`, which validates `redirect_uri` strictly. The `vscode://` URI scheme is non-standard HTTP/HTTPS. Whether PostHog's Django OAuth Toolkit configuration permits non-HTTP redirect URIs is unconfirmed. A concrete fallback strategy is documented below.

**Primary recommendation:** Implement the full OAuth flow optimistically using `vscode://posthog.posthog-vscode/callback` as redirect URI, but wrap the OAuth sign-in command behind a runtime check that degrades gracefully to API key if the redirect URI is rejected. Do not block implementation on PostHog registration confirmation — build the code, gate its exposure.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vscode.window.registerUriHandler` | built-in (VS Code ^1.109) | Receive OAuth callback from browser | Only VS Code API that receives external URI redirects; works in Codespaces/remote via `asExternalUri` |
| `vscode.env.asExternalUri` | built-in (VS Code ^1.109) | Produce a callback URI that works in all environments | Adapts `vscode://` URI to `https://vscode.dev/redirect` when running in browser-based VS Code |
| `vscode.env.openExternal` | built-in (VS Code ^1.109) | Open browser to PostHog authorize URL | Platform-appropriate browser launch; required for auth flows |
| `vscode.SecretStorage` | built-in (VS Code ^1.109) | Store access and refresh tokens in OS keychain | OS-backed encrypted storage; already used for API key in this codebase |
| `crypto` (Node built-in) | Node runtime | PKCE code_verifier, code_challenge, state generation | No dependency needed; `randomBytes` and `createHash` are all that is required |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vscode.Memento` (globalState) | built-in | Store non-sensitive auth metadata (auth method, token expiry) | Any data that is not a secret; already used for host, projectId, isAuthenticated |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `registerUriHandler` + `asExternalUri` | localhost loopback server | Loopback breaks in Codespaces and remote SSH; `asExternalUri` handles all environments automatically |
| Built-in `crypto` | `pkce-challenge` npm package | npm package adds a dependency for 8 lines of code; crypto is already in the Node runtime |
| Per-request expiry check + refresh | `authentication.registerAuthenticationProvider` | `AuthenticationProvider` adds cross-window session sync but is architecturally heavier; the existing `AuthService` pattern is simpler and sufficient for this extension's scope |

**Installation:** No new packages required. All APIs are built-in to VS Code and Node.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── extension.ts                ← register UriHandler here, wire new SIGN_IN_OAUTH command
├── services/
│   └── authService.ts          ← extend with OAuth token methods (no new file needed)
├── commands/
│   └── authCommands.ts         ← add SIGN_IN_OAUTH command handler
├── constants.ts                ← add new StorageKeys + Commands
└── views/webview/
    ├── layout.ts               ← add "Sign In with PostHog" button (primary), keep API key button
    ├── styles.ts               ← style OAuth button as primary CTA
    └── script.ts               ← handle btn-sign-in-oauth click → postMessage
```

### Pattern 1: In-Flight Promise for OAuth Callback

The UriHandler runs asynchronously from the OAuth sign-in command. The correct pattern is to store a promise resolver in memory that the UriHandler resolves when the callback arrives.

**What:** The sign-in command creates a Promise that resolves when `handleUri` is called. The Promise is stored on the AuthService instance. The UriHandler calls the stored resolver when the auth code arrives.

**When to use:** Every VS Code extension OAuth flow — this is the standard pattern.

```typescript
// Source: VS Code auth provider pattern (HIGH confidence)

// In AuthService
private _pendingOAuthResolve: ((code: string) => void) | undefined;
private _pendingOAuthReject: ((err: Error) => void) | undefined;

waitForOAuthCode(): Promise<string> {
    return new Promise((resolve, reject) => {
        this._pendingOAuthResolve = resolve;
        this._pendingOAuthReject = reject;
        // 5-minute timeout
        setTimeout(() => {
            this._pendingOAuthReject?.(new Error('OAuth timeout'));
            this._pendingOAuthResolve = undefined;
            this._pendingOAuthReject = undefined;
        }, 5 * 60 * 1000);
    });
}

handleOAuthCallback(code: string, state: string): void {
    if (state !== this._pendingState) {
        // Reject silently — CSRF protection
        this._pendingOAuthReject?.(new Error('State mismatch'));
        return;
    }
    this._pendingOAuthResolve?.(code);
    this._pendingOAuthResolve = undefined;
    this._pendingOAuthReject = undefined;
    this._pendingState = undefined;
}
```

### Pattern 2: PKCE Generation

```typescript
// Source: RFC 9700 + Node crypto built-in (HIGH confidence)
import * as crypto from 'crypto';

function generatePkce(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(32).toString('base64url'); // 43 chars, RFC minimum
    const challenge = crypto.createHash('sha256')
        .update(verifier)
        .digest('base64url');
    return { verifier, challenge };
}

function generateState(): string {
    return crypto.randomBytes(16).toString('hex'); // 32 hex chars
}
```

### Pattern 3: Callback URI Construction

```typescript
// Source: VS Code API docs + vscode-pull-request-github PR #1098 (HIGH confidence)
// extension ID = publisher.name from package.json = "PostHog.posthog-vscode"
const callbackUri = await vscode.env.asExternalUri(
    vscode.Uri.parse(`${vscode.env.uriScheme}://PostHog.posthog-vscode/callback`)
);
// In VS Code stable: vscode://PostHog.posthog-vscode/callback
// In VS Code Insiders: vscode-insiders://PostHog.posthog-vscode/callback
// In vscode.dev/Codespaces: https://vscode.dev/redirect?... (proxy)
```

**Critical:** `vscode.env.uriScheme` changes between `vscode`, `vscode-insiders`, and `code-oss`. Always use `vscode.env.uriScheme` — never hardcode `vscode://`.

### Pattern 4: Transparent getApiKey()

PostHogService calls `authService.getApiKey()` for every request. Making it transparent means zero changes to PostHogService:

```typescript
// In AuthService (modified)
async getApiKey(): Promise<string | undefined> {
    const method = this.getAuthMethod();
    if (method === 'oauth') {
        return this.secretStorage.get(StorageKeys.OAUTH_ACCESS_TOKEN);
    }
    return this.secretStorage.get(StorageKeys.API_KEY);
}
```

### Pattern 5: Token Refresh Before Request

Lazy refresh on 401 is fragile (retries complicate the flow). Proactive expiry check before each request is correct:

```typescript
// In PostHogService.request() — add at top of method
private async ensureFreshToken(): Promise<void> {
    if (this.authService.getAuthMethod() !== 'oauth') return;
    const expiry = this.authService.getTokenExpiry();
    if (!expiry) return;
    // Refresh 60 seconds early to avoid clock-skew failures
    if (Date.now() > new Date(expiry).getTime() - 60_000) {
        await this.authService.refreshOAuthToken();
    }
}
```

### Anti-Patterns to Avoid

- **Storing tokens in globalState:** globalState is unencrypted JSON on disk. Any token value must go in SecretStorage only.
- **Hardcoding `vscode://` scheme:** Use `vscode.env.uriScheme` — the scheme differs in Insiders builds.
- **Registering UriHandler lazily (inside the sign-in command):** VS Code may receive the callback before the handler is registered. Register in `activate()` unconditionally.
- **Using `Math.random()` for state or PKCE verifier:** Predictable. Use `crypto.randomBytes()` only.
- **Reusing PostHog Code's client_id (`DC5uRLVbGI02YQ82grxgnK6Qn12SXWpCqdPb60oZ`):** That is PostHog's Electron desktop app. Codehog requires its own separate OAuth app registration.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OS keychain storage | Custom token encryption | `vscode.SecretStorage` | OS-backed; handles keychain permissions, migration, cross-platform |
| Callback URI for remote envs | Hardcoded URI strings | `vscode.env.asExternalUri` | Handles vscode.dev, Codespaces, remote SSH, Gitpod automatically |
| PKCE math | Custom base64url encoding | `crypto.randomBytes().toString('base64url')` | Node >= 16 built-in base64url encoding; RFC-correct |
| Browser launch | Shell `open` command | `vscode.env.openExternal` | Platform-correct; respects user's default browser setting |
| OAuth state nonce | UUID library | `crypto.randomBytes(16).toString('hex')` | Cryptographically random; no dependency |

**Key insight:** Every component of PKCE OAuth that feels custom is already built into VS Code's extension API and Node's crypto module. The only novel code is the token exchange HTTP call and AuthService extension.

---

## PostHog OAuth Specifics

### Confirmed Endpoints (MEDIUM confidence — from PostHog handbook references)

| Endpoint | URL | Notes |
|----------|-----|-------|
| Authorization | `{host}/oauth/authorize` | Standard OAuth2 authorize endpoint |
| Token exchange | `{host}/oauth/token` | POST with `code`, `code_verifier`, `grant_type=authorization_code` |
| Token refresh | `{host}/oauth/token` | POST with `refresh_token`, `grant_type=refresh_token` |
| Introspection | `{host}/oauth/introspect/` | Check token validity; requires `introspection` scope |

### Confirmed Scopes (HIGH confidence — from `posthog/posthog` `frontend/src/lib/scopes.tsx`)

| Scope | Access Granted |
|-------|---------------|
| `feature_flag:read` | Read feature flags |
| `experiment:read` | Read experiments |
| `insight:read` | Read saved insights |
| `project:read` | Read project info (needed for project selection on sign-in) |
| `openid` | User identity (ID token) |
| `profile` | Basic user info |

**Recommended scope string for authorization request:**
```
feature_flag:read experiment:read insight:read project:read
```

### Forced Project Selection Parameter (MEDIUM confidence)

PostHog supports `required_access_level=project` in the authorization URL to force the user to select a single team/project during the OAuth flow. This would eliminate the post-OAuth project picker step:

```
{host}/oauth/authorize?...&required_access_level=project
```

If this works as documented, it means the OAuth flow can complete project selection inline — the extension would not need to show a separate project picker after token exchange.

### EXTERNAL DEPENDENCY: OAuth App Registration (UNCONFIRMED — LOW confidence)

PostHog's OAuth server uses `django-oauth-toolkit`. Whether it accepts `vscode://` custom scheme redirect URIs is unconfirmed. Known facts:

- PostHog Code (Electron desktop app) uses `http://localhost:8237/callback` and `http://localhost:8239/callback` — both HTTP, not a custom scheme
- Django OAuth Toolkit validates redirect URIs against a configured `ALLOWED_REDIRECT_URI_SCHEMES` list (defaults to `['http', 'https']`)
- Custom schemes like `vscode://` require explicit configuration in Django OAuth Toolkit settings

**This is a hard blocker.** The extension cannot complete the OAuth flow until PostHog registers an OAuth app with the correct redirect URI. The two possible redirect URI strategies are:

| Strategy | Redirect URI | Pros | Cons |
|----------|-------------|------|------|
| **VS Code UriHandler (preferred)** | `vscode://PostHog.posthog-vscode/callback` | Works in remote/Codespaces via `asExternalUri`; no local server | Requires PostHog to allowlist `vscode://` scheme in django-oauth-toolkit config |
| **Localhost loopback (fallback)** | `http://127.0.0.1:<dynamic-port>/callback` | Supported by every OAuth provider | Breaks in Codespaces and remote SSH; requires a local HTTP server |

**Recommendation:** Request UriHandler strategy first. If PostHog confirms `vscode://` is not supportable, implement localhost loopback using `http.createServer()` on a dynamic port.

---

## Common Pitfalls

### Pitfall 1: UriHandler Registered Too Late
**What goes wrong:** The OAuth browser redirect arrives before the UriHandler is registered. The callback is dropped silently.
**Why it happens:** Developers register the handler inside the sign-in command handler, which runs after browser open.
**How to avoid:** Register `vscode.window.registerUriHandler` inside `activate()` unconditionally — before any command runs.
**Warning signs:** Browser completes redirect, VS Code shows "extension not found to handle URI" or does nothing.

### Pitfall 2: State Parameter Not Validated
**What goes wrong:** CSRF attack — attacker replays an auth code from a different session.
**Why it happens:** State check feels like boilerplate; happy path works without it.
**How to avoid:** Generate state with `crypto.randomBytes(16).toString('hex')` before opening browser. Compare in `handleUri`. Reject mismatches silently (do not show error details — that would reveal the expected state).
**Warning signs:** OAuth flow "works" in tests even when state param is omitted from the callback URL.

### Pitfall 3: Token Expiry Not Tracked
**What goes wrong:** The extension makes API calls with an expired access token, gets 401s, and the user appears logged out without explanation.
**Why it happens:** Developers store only the access token, not the `expires_in` response field.
**How to avoid:** On token exchange, calculate `expiry = new Date(Date.now() + expires_in * 1000).toISOString()` and store in `globalState`. Check before each request in `PostHogService.request()`.
**Warning signs:** API calls fail after 1 hour (typical PostHog access token lifetime) with 401.

### Pitfall 4: Sign Out Only Clears One Auth Method
**What goes wrong:** User switches from OAuth to API key. Sign out only deletes the API key. The OAuth refresh token remains in SecretStorage and can be reused.
**Why it happens:** The sign-out command was written for API key only.
**How to avoid:** Sign out command must clear ALL auth storage regardless of current method: delete `posthog.apiKey`, `posthog.oauthAccessToken`, `posthog.oauthRefreshToken` from SecretStorage, and reset `posthog.authMethod` and `posthog.tokenExpiry` in globalState.

### Pitfall 5: vscode:// Scheme Hardcoded
**What goes wrong:** Extension fails in VS Code Insiders (`vscode-insiders://`) or Cursor (`cursor://`) because the redirect URI doesn't match what `asExternalUri` produces.
**Why it happens:** Developer hardcodes `vscode://` as the redirect URI prefix.
**How to avoid:** Always use `${vscode.env.uriScheme}://PostHog.posthog-vscode/callback` as the base URI. The `asExternalUri` call adapts it to the actual environment.
**Warning signs:** UriHandler never fires; browser redirect goes to wrong scheme.

### Pitfall 6: Progress Notification Missing During OAuth Flow
**What goes wrong:** User clicks "Sign In with PostHog", browser opens, extension shows no status. User clicks again, starting a second concurrent flow. State mismatch causes both to fail.
**Why it happens:** No UI feedback during the async wait period.
**How to avoid:** Show `vscode.window.withProgress({ location: vscode.ProgressLocation.Notification }, ...)` while waiting for the callback. Cancelling the progress notification should call `_pendingOAuthReject()` to clean up the in-flight state.

---

## Code Examples

### Complete PKCE + State Generation
```typescript
// Source: RFC 9700 + Node crypto (HIGH confidence)
import * as crypto from 'crypto';

function generatePkce(): { verifier: string; challenge: string } {
    // verifier: 32 random bytes → base64url = 43 chars (above RFC minimum of 43)
    const verifier = crypto.randomBytes(32).toString('base64url');
    // challenge: SHA-256 of verifier, base64url-encoded
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

function generateState(): string {
    return crypto.randomBytes(16).toString('hex'); // 32 hex chars
}
```

### UriHandler Registration in activate()
```typescript
// Source: VS Code API docs (HIGH confidence)
// Register BEFORE any command that triggers OAuth

const uriHandler: vscode.UriHandler = {
    handleUri(uri: vscode.Uri) {
        const params = new URLSearchParams(uri.query);
        const code = params.get('code');
        const state = params.get('state');
        if (code && state) {
            authService.handleOAuthCallback(code, state);
        }
    }
};
context.subscriptions.push(
    vscode.window.registerUriHandler(uriHandler)
);
```

### Authorization URL Construction
```typescript
// Source: PostHog OAuth Development Guide + VS Code URI pattern (MEDIUM confidence)
async function buildAuthorizeUrl(
    host: string,
    clientId: string,
    callbackUri: string,
    codeChallenge: string,
    state: string
): Promise<string> {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUri,
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        scope: 'feature_flag:read experiment:read insight:read project:read',
        state,
        // Optional: force single project selection inline
        // required_access_level: 'project',
    });
    return `${host}/oauth/authorize?${params.toString()}`;
}
```

### Token Exchange POST
```typescript
// Source: Standard OAuth 2.0 token endpoint (HIGH confidence)
async function exchangeCodeForTokens(
    host: string,
    clientId: string,
    code: string,
    codeVerifier: string,
    redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const response = await fetch(`${host}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
        }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${text}`);
    }
    return response.json();
}
```

### Token Refresh
```typescript
// Source: Standard OAuth 2.0 refresh token grant (HIGH confidence)
async function refreshAccessToken(
    host: string,
    clientId: string,
    refreshToken: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
    const response = await fetch(`${host}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: refreshToken,
        }),
    });
    if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
    }
    return response.json();
}
```

### New Constants
```typescript
// Add to constants.ts
export const StorageKeys = {
    // Existing (unchanged)
    API_KEY: 'posthog.apiKey',
    HOST: 'posthog.host',
    PROJECT_ID: 'posthog.projectId',
    IS_AUTHENTICATED: 'posthog.isAuthenticated',
    // New OAuth
    OAUTH_ACCESS_TOKEN: 'posthog.oauthAccessToken',    // SecretStorage
    OAUTH_REFRESH_TOKEN: 'posthog.oauthRefreshToken',  // SecretStorage
    AUTH_METHOD: 'posthog.authMethod',                 // globalState: 'api_key' | 'oauth'
    TOKEN_EXPIRY: 'posthog.tokenExpiry',               // globalState: ISO timestamp string
} as const;

export const Commands = {
    // Existing (unchanged)
    SIGN_IN: 'posthog.signIn',
    SIGN_OUT: 'posthog.signOut',
    // New
    SIGN_IN_OAUTH: 'posthog.signInOAuth',
} as const;
```

### Landing Page Button Layout (layout.ts)
```html
<!-- Primary OAuth button (new) -->
<button class="sign-in-btn sign-in-btn--primary" id="btn-sign-in-oauth">
    Sign In with PostHog
</button>
<!-- Secondary API key button (existing id preserved) -->
<button class="sign-in-btn sign-in-btn--secondary" id="btn-sign-in">
    Sign In with API Key
</button>
<p class="welcome-hint">API key works for self-hosted instances</p>
```

**CRITICAL:** `id="btn-sign-in"` is an immutable contract in `script.ts`. Do not rename it. Add the new OAuth button as a sibling, not a replacement.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Localhost loopback server for OAuth | `vscode.window.registerUriHandler` + `asExternalUri` | VS Code 1.54 (stable since 1.63) | Works in Codespaces and remote SSH; no local HTTP server needed |
| `implicit` grant type (token in redirect fragment) | `authorization_code` with PKCE | RFC 9700 (2023) replaced RFC 7636 (2015) | PKCE is now the required approach for public clients; implicit flow is deprecated |
| `vscode.authentication.registerAuthenticationProvider` optional | Strongly recommended for cross-window session sync | VS Code 1.54+ | Provides free session sync across windows and native VS Code "Sign In" UI integration; this phase does not use it (AuthService handles sessions directly) |

**Deprecated/outdated:**
- Implicit OAuth grant type: deprecated per RFC 9700; PostHog may not support it.
- `@vscode/webview-ui-toolkit`: archived January 6 2025; not relevant to this phase.

---

## Fallback Strategy If PostHog Does Not Support `vscode://` Redirect URIs

If PostHog's Django OAuth Toolkit configuration rejects `vscode://` as a redirect URI scheme, the fallback is a **localhost loopback server** on a dynamic port.

```typescript
// Fallback pattern (only if vscode:// rejected by PostHog server)
import * as http from 'http';

function startLoopbackServer(): Promise<{ port: number; code: Promise<string> }> {
    let resolveCode: (code: string) => void;
    const codePromise = new Promise<string>(resolve => { resolveCode = resolve; });

    const server = http.createServer((req, res) => {
        const url = new URL(req.url!, `http://127.0.0.1`);
        const code = url.searchParams.get('code');
        if (code) {
            res.end('<h1>Authentication complete. Return to VS Code.</h1>');
            resolveCode(code);
            server.close();
        }
    });

    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as any).port;
            resolve({ port, code: codePromise });
        });
    });
}
```

This fallback breaks in Codespaces and remote SSH (where `127.0.0.1` is not the local machine). If fallback is needed, document that OAuth is only available in local VS Code installations; API key is the fallback for remote environments.

---

## Open Questions

1. **PostHog OAuth app registration**
   - What we know: Endpoints `/oauth/authorize` and `/oauth/token` exist. PostHog Code desktop app uses `http://localhost:8237/callback`.
   - What's unclear: Whether PostHog will register a VS Code extension OAuth app with a `vscode://` redirect URI; whether django-oauth-toolkit allows non-HTTP schemes.
   - Recommendation: File the registration request with PostHog team immediately. Implement the code optimistically. Gate the "Sign In with PostHog" button behind a config value (`posthog.oauthClientId`) that can be set to empty string to hide the button until registration is complete.

2. **PostHog OAuth client_id**
   - What we know: The extension will need its own `client_id` from PostHog.
   - What's unclear: The actual value — it will only be known after PostHog registers the app.
   - Recommendation: Store `CLIENT_ID` as a constant in `constants.ts` with a placeholder value. Ship the code with the real value once registration is confirmed.

3. **Token expiry duration**
   - What we know: PostHog returns `expires_in` in the token response (standard OAuth); PostHog refresh tokens can expire after extended inactivity.
   - What's unclear: Exact access token lifetime (typical: 1 hour; PostHog-specific unconfirmed).
   - Recommendation: Always store the `expires_in` value from the token response and use it. Do not assume a fixed duration.

4. **Project selection after OAuth**
   - What we know: `required_access_level=project` parameter may force project selection inline during OAuth.
   - What's unclear: Whether this parameter is stable and what the token response includes (project_id in token claims?).
   - Recommendation: Do not rely on `required_access_level` for project selection. After token exchange, call `getProjects()` and run the existing project picker flow — same as the API key path. This is simpler and guaranteed correct.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected in codebase |
| Config file | none — Wave 0 must create |
| Quick run command | `pnpm test` (once configured) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-02 | PKCE verifier/challenge generation produces RFC-correct values | unit | `pnpm test -- --grep "PKCE"` | Wave 0 |
| AUTH-02 | State parameter is 32 hex chars from crypto | unit | `pnpm test -- --grep "generateState"` | Wave 0 |
| AUTH-03 | `setOAuthTokens` stores access token in SecretStorage, not globalState | unit | `pnpm test -- --grep "setOAuthTokens"` | Wave 0 |
| AUTH-04 | State mismatch in `handleOAuthCallback` rejects promise | unit | `pnpm test -- --grep "state mismatch"` | Wave 0 |
| AUTH-04 | Correct state in `handleOAuthCallback` resolves promise | unit | `pnpm test -- --grep "state match"` | Wave 0 |
| AUTH-05 | `getApiKey()` returns API key when auth method is `api_key` | unit | `pnpm test -- --grep "getApiKey api_key"` | Wave 0 |
| AUTH-05 | `getApiKey()` returns OAuth access token when auth method is `oauth` | unit | `pnpm test -- --grep "getApiKey oauth"` | Wave 0 |
| AUTH-06 | Sign out clears both OAuth tokens and API key from SecretStorage | unit | `pnpm test -- --grep "sign out clears"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm lint && pnpm compile`
- **Per wave merge:** `pnpm compile && pnpm test`
- **Phase gate:** Full compile + lint + test green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/test/authService.test.ts` — unit tests for new OAuth methods; covers AUTH-02 through AUTH-06
- [ ] `src/test/suite/index.ts` — test runner entry point (standard VS Code test setup)
- [ ] Framework install: `pnpm add --save-dev @vscode/test-electron mocha @types/mocha` — standard VS Code extension test stack

---

## Sources

### Primary (HIGH confidence)
- VS Code API: `vscode.window.registerUriHandler`, `vscode.env.asExternalUri`, `vscode.env.openExternal`, `vscode.env.uriScheme` — https://code.visualstudio.com/api/references/vscode-api
- VS Code Remote Extensions guide — https://code.visualstudio.com/api/advanced-topics/remote-extensions
- VS Code URI Handler sample — https://github.com/microsoft/vscode-extension-samples/blob/main/uri-handler-sample/README.md
- Node.js `crypto` module: `randomBytes`, `createHash` — built-in, RFC 9700 compliant
- Codebase inspection: `authService.ts`, `authCommands.ts`, `extension.ts`, `constants.ts`, `layout.ts`, `package.json`

### Secondary (MEDIUM confidence)
- PostHog scopes list: `posthog/posthog` `frontend/src/lib/scopes.tsx` — feature_flag:read, experiment:read, insight:read, project:read confirmed
- PostHog OAuth endpoint pattern `{host}/oauth/authorize`, `{host}/oauth/token`, `{host}/oauth/introspect/` — PostHog handbook reference (https://posthog.com/handbook/engineering/oauth-development-guide)
- PostHog `required_access_level=project` query parameter — handbook reference
- PostHog Code desktop OAuth app: `client_id=DC5uRLVbGI02YQ82grxgnK6Qn12SXWpCqdPb60oZ`, localhost redirect URIs — https://github.com/PostHog/code/blob/main/docs/LOCAL-DEVELOPMENT.md
- VS Code `vscode.env.uriScheme` OAuth pattern — https://github.com/microsoft/vscode-pull-request-github/pull/1098/files
- VS Code URI scheme redirect format issue — https://github.com/microsoft/vscode/issues/260425
- Elio Struyf authentication provider guide — https://www.eliostruyf.com/create-authentication-provider-visual-studio-code/

### Tertiary (LOW confidence — flagged for validation)
- PostHog token `expires_in` value (access token lifetime unknown — must read from response at runtime)
- Whether `vscode://` scheme is allowed in PostHog's django-oauth-toolkit configuration (unconfirmed, requires PostHog team)
- Whether `required_access_level=project` returns project_id in token claims (undocumented)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All VS Code APIs are stable at ^1.109, Node crypto is built-in
- Architecture: HIGH — Pattern is established across VS Code auth providers (GitHub, GitLab, Azure)
- PostHog OAuth endpoints/scopes: MEDIUM — Endpoints confirmed via handbook reference; scopes confirmed via source code
- PostHog OAuth registration: LOW — External dependency, unconfirmed redirect URI scheme support
- Pitfalls: HIGH — Derived from direct codebase inspection + VS Code API documentation

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable APIs) / Until PostHog registration is confirmed (LOW items)
