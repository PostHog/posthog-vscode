# Stack Research

**Domain:** VS Code extension — PostHog developer tooling (brownfield, milestone additions)
**Researched:** 2026-03-30
**Confidence:** MEDIUM-HIGH (core VS Code APIs: HIGH; PostHog OAuth endpoints: LOW — see notes)

---

## Context

This is a brownfield milestone research document. The existing stack is fixed:

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | VS Code Extension API | ^1.109.0 |
| Language | TypeScript | ^5.9.3 |
| Bundler | webpack | ^5.105.3 |
| Package manager | pnpm | (existing) |
| AST parsing | web-tree-sitter | ^0.24.7 |
| Credential storage | vscode.SecretStorage (OS keychain) | built-in |

The research below covers only the **new capabilities** required for this milestone: OAuth auth flow, saved insights analytics tab, flag payload type code generation, and sidebar UX improvements.

---

## Recommended Stack

### Core Technologies (New Additions)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| VS Code `registerUriHandler` + `vscode.env.asExternalUri` | built-in (1.109+) | OAuth redirect callback | The only correct way to receive OAuth callbacks in VS Code; `asExternalUri` adapts the URI automatically for tunnels, Codespaces, and vscode.dev — no localhost server needed |
| VS Code `authentication.registerAuthenticationProvider` | built-in (1.109+) | Session lifecycle management | Enables VS Code's native "Sign In" UI integration, cross-window session sync via `onDidChangeSessions`, and OS keychain storage — the standard API all major extensions use (GitHub, Azure, GitLab) |
| Node.js `crypto` module (`crypto.randomBytes`, `crypto.createHash`) | built-in to Node runtime | PKCE code_verifier + code_challenge generation | No external dependency; S256 PKCE is the correct approach for public clients (RFC 9700); `crypto` is available in the extension host process |
| Chart.js | ^4.x (CDN via webview) | Render trend/funnel charts in analytics tab | Lightest chart library that handles the insight types PostHog returns (line trends, funnels, retention); loaded via CDN URL in the webview HTML — does NOT bloat the extension bundle |

### Supporting Libraries (New Additions)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none — use template literals) | — | TypeScript interface code generation | Flag payload types are simple TypeScript interfaces generated from PostHog flag filter JSON; template literals in TypeScript are sufficient — ts-morph adds 2.5 MB to the bundle for no gain here |

### Development Tools (No Changes Needed)

| Tool | Purpose | Notes |
|------|---------|-------|
| webpack (existing) | Extension + webview bundling | Webview scripts are separate webpack entry points; Chart.js loaded via CDN skips bundle entirely |
| vscode.SecretStorage (existing) | Secure token storage | Store OAuth `access_token` and `refresh_token` here; already in use for the API key |

---

## OAuth Flow Architecture

The correct pattern for this extension is:

```
1. User triggers sign-in
2. Extension generates PKCE pair:
   code_verifier  = crypto.randomBytes(32).toString('base64url')  // 43+ chars
   code_challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
3. Extension registers UriHandler for callback:
   vscode.window.registerUriHandler({ handleUri(uri) { ... } })
4. Extension builds callback URI:
   callbackUri = await vscode.env.asExternalUri(
     vscode.Uri.parse(`${vscode.env.uriScheme}://${extensionId}/auth`)
   )
5. Extension opens browser to PostHog authorize URL:
   https://app.posthog.com/oauth/authorize
     ?client_id=<registered_client_id>
     &redirect_uri=<callbackUri>
     &response_type=code
     &code_challenge=<code_challenge>
     &code_challenge_method=S256
     &scope=feature_flags:read+experiments:read+insights:read+...
6. User authenticates in browser; PostHog redirects to callbackUri
7. UriHandler receives URI with ?code=<auth_code>
8. Extension POSTs to /oauth/token to exchange code for tokens
9. Store access_token + refresh_token in vscode.SecretStorage
10. Implement token refresh in request() interceptor on 401
```

**Critical note on PostHog OAuth app registration:** PostHog's OAuth2 flow exists (evidenced by `pha_`/`phr_` token formats and their internal OAuth Development Guide), but public documentation on client registration and exact endpoint URLs is sparse. The handbook guide at `posthog.com/handbook/engineering/oauth-development-guide` covers internal development only. **This milestone requires direct coordination with the PostHog team to register the VS Code extension as an OAuth app and confirm the authorize/token endpoint URLs.** Until that happens, the existing Personal API Key flow must remain the fallback. Confidence: LOW for the PostHog-side OAuth specifics.

---

## Analytics Tab — Insights Rendering

PostHog's `/api/projects/{id}/insights/?saved=true` returns an array of `Insight` objects (already typed in `models/types.ts`). Each insight has a `result` field that is one of:

- `TrendResult[]` — array of series with `.data` (numbers) and `.days` (labels) → line chart
- `FunnelStep[]` — ordered steps with `.count` → bar/funnel chart
- `RetentionCohort[]` — cohort rows → table or heatmap

**Rendering strategy:** Webview HTML with Chart.js loaded from CDN. Pass rendered JSON from extension host → webview via `postMessage`. No framework needed — existing vanilla JS webview pattern is correct.

```html
<!-- In webview HTML, load Chart.js from CDN (no bundle impact) -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"
        integrity="sha384-..." crossorigin="anonymous"></script>
```

CSP must be updated to allow `cdn.jsdelivr.net` as a script source when rendering charts. The existing nonce-based CSP approach still applies for inline scripts.

---

## Code Generation — Flag Payload Types

Flag payload types are TypeScript interfaces generated from PostHog's `FeatureFlag.filters` JSON. The flag object already exists in `flagCacheService`. Generation is purely string manipulation — no library needed.

Pattern:
1. Read `flag.filters.payloads` from the cached flag objects (or fetch from API if needed)
2. For each flag key, introspect the payload JSON value to infer the TypeScript type
3. Emit a single `.ts` file (or `insertSnippet` into the active editor) via `vscode.workspace.openTextDocument` + `vscode.window.showTextDocument`

Use template literal generation:
```typescript
function generateFlagTypes(flags: FeatureFlag[]): string {
    const lines = flags
        .filter(f => f.active && !f.deleted)
        .map(f => `  '${f.key}': ${inferPayloadType(f)};`)
        .join('\n');
    return `export interface PostHogFeatureFlags {\n${lines}\n}\n`;
}
```

No AST manipulation library (ts-morph, recast) needed. These add 2-4 MB to the bundle for no benefit when the output is a straightforward string template.

---

## Installation

```bash
# No new runtime dependencies needed for OAuth (uses built-in crypto + VS Code APIs)
# No new runtime dependencies for code generation (template literals)

# Chart.js is loaded via CDN in the webview — not installed as a package
# If you ever need it bundled (offline scenarios), then:
pnpm add chart.js
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Built-in `crypto` for PKCE | `pkce-challenge` npm package | Never — adds a dependency for 10 lines of crypto code |
| Chart.js via CDN | Bundle Chart.js with webpack | Only if offline extension use is a hard requirement (e.g., air-gapped environments) |
| Chart.js | D3.js | D3 is correct when you need custom SVG layouts; Chart.js covers all PostHog insight types with 1/5th the complexity |
| Chart.js | Lightweight-charts (TradingView) | Only for financial/OHLC data; not suited for funnel or retention views |
| Template literal type codegen | ts-morph | Only if generating complex multi-file TypeScript projects; overkill for flag payload interfaces |
| `vscode.AuthenticationProvider` | Manual token management | Never for new extensions — `AuthenticationProvider` gives cross-window sync and native VS Code UI integration for free |
| `vscode.env.asExternalUri` | localhost redirect server | localhost approach breaks in Codespaces and remote development; `asExternalUri` handles all environments correctly |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@vscode/webview-ui-toolkit` | Deprecated January 2025, repo archived January 6 2025; no replacement from Microsoft | Vanilla HTML/CSS with VS Code CSS variables (`--vscode-*`) — already the pattern in this codebase |
| React / Vue in webview | Adds 40-100 KB+ to webview bundle; the existing template-literal pattern is sufficient for sidebar complexity | Vanilla JS with `postMessage` — already established in `views/webview/script.ts` |
| Localhost OAuth redirect server | Breaks in Codespaces, remote SSH, and vscode.dev environments | `vscode.env.asExternalUri` + `registerUriHandler` |
| `ts-morph` or `recast` for code generation | 2-4 MB bundle bloat; only needed for complex multi-file AST transformations | TypeScript template literals — sufficient for generating interface strings |
| `pkce-challenge` or `oauth4webapi` npm packages | Adds dependencies for functionality already in Node's built-in `crypto` module | Node `crypto.randomBytes` + `crypto.createHash` |
| Storing tokens in `globalState` (Memento) | Memento is unencrypted user settings; tokens must be in the OS keychain | `vscode.SecretStorage` — already used for the API key |

---

## Stack Patterns by Variant

**If PostHog OAuth app registration is not available at milestone time:**
- Keep existing Personal API Key flow as the only auth method
- Build the OAuth flow implementation but gate it behind a feature flag or separate command
- Do not remove the API key path — it must remain as fallback for self-hosted PostHog instances that may not have OAuth configured

**If the user is on a self-hosted PostHog instance:**
- OAuth may not be configured on their instance
- The Personal API Key path must remain functional regardless
- OAuth should be presented as "Sign in with PostHog" and only offered for `app.posthog.com` or when the user confirms their instance supports it

**If chart rendering causes CSP errors:**
- Add `cdn.jsdelivr.net` to the webview's CSP `script-src` directive alongside `${webview.cspSource}`
- Alternatively, bundle Chart.js and load it as a local resource via `webview.asWebviewUri`

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| VS Code ^1.109.0 | `registerUriHandler`, `AuthenticationProvider`, `SecretStorage`, `asExternalUri` | All these APIs are stable since VS Code 1.54+ — no compatibility concerns at 1.109 |
| Chart.js ^4.x | All modern browsers + VS Code webview (Chromium-based) | Chart.js v4 requires a container element with defined dimensions; set explicit `height` on canvas |
| TypeScript ^5.9.3 | `crypto` module types in `@types/node 22.x` | `crypto.randomBytes` and `crypto.createHash` are covered by existing `@types/node` devDependency |

---

## Sources

- VS Code Webview API — https://code.visualstudio.com/api/extension-guides/webview — CSP, postMessage patterns (HIGH confidence)
- VS Code Auth Provider pattern — https://www.eliostruyf.com/create-authentication-provider-visual-studio-code/ — `registerAuthenticationProvider`, `UriHandler` flow (MEDIUM confidence)
- Microsoft vscode-extension-samples (authenticationprovider-sample) — https://github.com/microsoft/vscode-extension-samples/blob/main/authenticationprovider-sample/src/authProvider.ts — SecretStorage + EventEmitter pattern (HIGH confidence)
- `vscode.env.asExternalUri` for OAuth callbacks — VS Code API docs, GitHub issue discussions (HIGH confidence, VS Code-side only)
- PostHog OAuth2 existence — PostHog handbook OAuth guide, `pha_`/`phr_` token format references (MEDIUM confidence on existence, LOW confidence on endpoint URLs and registration process)
- PostHog Insights API — `posthog.com/docs/api/insights`, existing `Insight` type in `models/types.ts` (HIGH confidence)
- Webview UI Toolkit deprecation — https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561 — archived Jan 6 2025 (HIGH confidence)
- Chart.js v4 — https://www.chartjs.org/docs/ — trend/funnel chart support (HIGH confidence)
- PKCE best practices (RFC 9700) — S256 requirement, code_verifier entropy (HIGH confidence)
- ts-morph v27 — https://ts-morph.com/ — interface generation capability confirmed but ruled out for bundle size (MEDIUM confidence)

---

*Stack research for: Codehog VS Code extension — OAuth, analytics tab, code generation milestone*
*Researched: 2026-03-30*
