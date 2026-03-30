# Project Research Summary

**Project:** Codehog — PostHog VS Code Extension (milestone additions)
**Domain:** VS Code developer tooling — PostHog IDE integration
**Researched:** 2026-03-30
**Confidence:** MEDIUM-HIGH (VS Code APIs: HIGH; PostHog OAuth specifics: LOW)

## Executive Summary

Codehog is a brownfield VS Code extension adding four capabilities on top of a stable existing codebase: OAuth authentication, a sidebar analytics tab, flag payload TypeScript type generation, and UX cleanup (search/filter, auth landing redesign, dead code removal). The existing architecture — layered into services, providers, views, and commands — is already the correct pattern and needs extension, not replacement. All new features fit cleanly into the current structure: a `codegenService.ts` pure function, extended `authService.ts` storage keys, webview template edits, and a `UriHandler` registration in `activate()`.

The recommended approach is to work through the milestone in dependency order: clean up dead code first (removes noise), then improve the auth landing (visual only, no dependencies), then add sidebar search/filter (pure webview JS), then implement code generation (depends only on the already-stable flag cache), and finally implement OAuth (the most complex feature with an external dependency on PostHog OAuth app registration). The analytics tab improvements are already architecturally correct and need polish only.

The single highest-risk item in this milestone is the PostHog OAuth app registration. PostHog's OAuth flow exists and uses PKCE authorization code flow, but the redirect URI scheme (`vscode://`) must be explicitly registered with the PostHog team before any auth code is written. Until that registration is confirmed, the personal API key flow must remain fully functional as a fallback. All other milestone items can proceed independently of this risk.

---

## Key Findings

### Recommended Stack

The existing stack (TypeScript 5.9, webpack 5, web-tree-sitter, VS Code API 1.109+) is unchanged. New capabilities require zero new runtime npm dependencies. PKCE generation uses Node's built-in `crypto` module. Chart.js for analytics visualizations loads from CDN in the webview HTML (no bundle impact). TypeScript type generation uses template literals — no ts-morph or AST library needed (those add 2–4 MB for a feature that is pure string manipulation). The deprecated `@vscode/webview-ui-toolkit` must not be introduced; the existing vanilla JS + VS Code CSS variables pattern is correct and continues.

**Core technologies for new capabilities:**
- `vscode.window.registerUriHandler` + `vscode.env.asExternalUri` — OAuth callback receipt; the only pattern that works across Codespaces, remote SSH, and vscode.dev
- `vscode.authentication.registerAuthenticationProvider` — native VS Code session lifecycle, cross-window sync via `onDidChangeSessions`, OS keychain storage
- Node.js built-in `crypto` — PKCE code verifier and challenge generation; no external package needed
- Chart.js 4.x via CDN — trend, funnel, and retention chart rendering in webview; skip bundling
- `vscode.workspace.fs.writeFile` — codegen file output; must use VS Code filesystem API (not Node `fs`) to work in remote workspaces

### Expected Features

The full feature analysis is in `.planning/research/FEATURES.md`. Summary:

**Must have (this milestone — table stakes or active items):**
- Better auth landing page — first impression; zero implementation cost
- OAuth authentication flow — unblocks analytics tab; modernizes auth
- Sidebar search/filter — table stakes for any list over 20 items; LaunchDarkly already has it
- Flag payload TypeScript type generation — highest-differentiation new feature; no competitor equivalent
- Sidebar analytics tab improvements — extends extension from flag checker to analytics hub
- Dead code removal (HogQL editor, captureCodeActionProvider, errorCache, Python/Go/Ruby languages) — cleans the bundle and removes user-visible confusion

**Should have (post-launch validation):**
- Hover tooltip on flag key — LaunchDarkly has this; currently a gap
- Flag toggle directly from extension — high value, high complexity; defer for validation

**Defer (v2+):**
- Additional language support (one language at a time after JS/TS is validated)
- Flag variant code coverage heatmap
- Experiment creation from extension

**Anti-features to avoid permanently:** HogQL query editor in VS Code, smart capture auto-insertion, error tracking inline, real-time high-frequency flag polling, full PostHog dashboard embedding.

### Architecture Approach

The current five-layer architecture (orchestrator → services → providers → views → webview sandbox) is already correct and requires extension only. New components are: `services/codegenService.ts` (pure function, no VS Code API calls), extended `authService.ts` storage keys for OAuth tokens and auth method, a `UriHandler` registered at `activate()` time, and HTML/CSS template edits to `views/webview/layout.ts`, `styles.ts`, and `script.ts` for auth landing and search/filter. No new architectural boundaries are needed.

**Key components and changes for this milestone:**
1. `authService.ts` (EXTEND) — add `OAUTH_REFRESH_TOKEN` and `AUTH_METHOD` storage keys; both tokens stored in SecretStorage only
2. `codegenService.ts` (NEW) — pure `generateFlagTypes(flags): string` function; called by command handler, tested without VS Code
3. `featureFlagCommands.ts` (EXTEND) — add `GENERATE_FLAG_TYPES` command; handles file write via `vscode.workspace.fs`
4. `authCommands.ts` (EXTEND) — add OAuth sign-in command; registers UriHandler flow
5. `views/webview/` templates (EXTEND) — auth landing redesign, search/filter UX
6. `extension.ts` (EXTEND) — wire UriHandler in `activate()`, register new commands

**Build order (dependency-driven):**
1. Dead code removal (no dependencies)
2. Auth landing redesign (no dependencies, HTML/CSS only)
3. Sidebar search/filter (no dependencies, webview JS only)
4. Code generation (depends on flag cache — already stable)
5. OAuth flow (depends on PostHog OAuth app registration — external dependency)
6. Analytics tab polish (depends on OAuth for full scope; functional with API key)

### Critical Pitfalls

Full pitfall analysis is in `.planning/research/PITFALLS.md`. Top risks:

1. **OAuth redirect URI not registered with PostHog** — PostHog OAuth will reject every callback with `redirect_uri_mismatch` if the VS Code extension is not registered as an OAuth app with the exact redirect URI scheme. Do not write any OAuth code until PostHog confirms the redirect URI and issues a `client_id`. This must be resolved pre-implementation.

2. **package.json contributions outliving their implementation** — When removing HogQL editor, captureCodeActionProvider, and error tracking, all three surfaces must be cleaned atomically: `package.json` `contributes`, `extension.ts` wiring, and the feature files themselves. Forgetting `package.json` leaves ghost commands in the Command Palette. Run a Command Palette audit after each removal.

3. **OAuth tokens stored in globalState instead of SecretStorage** — Tokens in `globalState` are stored as plain JSON on disk. All access tokens and refresh tokens must go exclusively to `context.secrets` (SecretStorage). Only non-sensitive metadata (expiry timestamp, auth method) may use globalState.

4. **Missing OAuth state parameter validation (CSRF)** — The state parameter must be a cryptographically random value (`crypto.randomBytes(16).toString('hex')`), stored in memory only (not persisted), validated on callback, and discarded after single use. Omitting this allows callback injection attacks.

5. **Dead WASM files inflating bundle after language removal** — Removing Python/Go/Ruby from TypeScript code leaves WASM grammars in `wasm/` and webpack copy rules intact. Delete `tree-sitter-python.wasm`, `tree-sitter-go.wasm`, `tree-sitter-ruby.wasm`; remove from `webpack.config.js` copy rules. Verify `.vsix` size drops after build.

---

## Implications for Roadmap

Based on the combined research, five phases fit this milestone cleanly. The order is driven by: (a) eliminating dead code before adding new code, (b) unblocking visual testing before wiring logic, (c) tackling independent work before the externally-blocked OAuth, and (d) keeping the highest-complexity feature last.

### Phase 1: Dead Code Removal and Language Scope Reduction

**Rationale:** Removing dropped features first eliminates noise from the codebase before any new code is added. HogQL editor, captureCodeActionProvider, error tracking, and Python/Go/Ruby support are all marked for removal. Doing this atomically (all three surfaces per feature: `package.json`, `extension.ts`, feature files) is cleaner than interleaving with additions. Reduces WASM bundle by 3–6 MB.

**Delivers:** Smaller bundle, cleaner Command Palette, zero dead code in subsequent changes.

**Addresses:** FEATURES.md anti-features removal; dead WASM files pitfall.

**Avoids:** Pitfall 2 (package.json outliving code), Pitfall 6 (dead WASM files).

**Research flag:** Standard patterns. No phase research needed — this is file deletion with a manifest audit checklist.

### Phase 2: Auth Landing UX and Sidebar Search/Filter

**Rationale:** Both are pure webview changes (HTML/CSS/JS in template files). No new services. No external dependencies. They can be built and visually tested without OAuth being wired. Auth landing is the first impression for every new user; fixing it early means every subsequent test session starts correctly.

**Delivers:** Improved first-run experience, search/filter on flag and experiment lists.

**Addresses:** FEATURES.md "better auth landing page" (P1) and "sidebar search/filter" (P1).

**Avoids:** Pitfall of creating new view components for small UX changes (use existing `#welcome-screen` conditional pattern).

**Research flag:** Standard patterns. No phase research needed — existing webview template pattern applies directly.

### Phase 3: Flag Payload TypeScript Type Generation

**Rationale:** The highest-differentiation new feature with no competitor equivalent. Depends only on `flagCacheService` (already stable and unchanged). Implementing it as a pure function in `codegenService.ts` before OAuth means it can be tested and validated independently. The command handler writes to `vscode.workspace.fs` — must not use Node `fs` (Pitfall 3 in architecture anti-patterns).

**Delivers:** `posthog-flags.d.ts` generated from live flag data; Command Palette entry "PostHog: Generate Flag Types".

**Addresses:** FEATURES.md differentiator "Flag payload TypeScript type generation" (P1).

**Uses:** Template literal generation (no ts-morph), `vscode.workspace.fs.writeFile()`.

**Implements:** `codegenService.ts` (new pure function service) + `featureFlagCommands.ts` extension.

**Research flag:** Standard patterns. VS Code filesystem API and template literal codegen are well-documented. No phase research needed.

### Phase 4: OAuth Authentication Flow

**Rationale:** The most complex feature and the one with an external dependency. Must not start until PostHog confirms the OAuth app registration and redirect URI. Once unblocked, extends `authService.ts` with two new storage keys, adds a `UriHandler` registered at activation time, and wires the PKCE authorize/callback/token exchange flow. Personal API key path must remain fully functional throughout — OAuth is additive.

**Delivers:** "Sign in with PostHog" OAuth flow with PKCE; token stored in SecretStorage; fallback API key path unchanged.

**Addresses:** FEATURES.md "OAuth authentication flow" (P1); all three OAuth-related security pitfalls.

**Avoids:** Pitfall 1 (redirect URI registration), Pitfall 3 (tokens in globalState), Pitfall 4 (missing state validation).

**Research flag:** Needs phase research / pre-implementation validation. The PostHog OAuth app registration, exact endpoint URLs, and supported redirect URI schemes must be confirmed before implementation begins. If `vscode://` URI scheme is unsupported, a fallback to `https://vscode.dev/redirect` or a localhost loopback must be evaluated.

### Phase 5: Analytics Tab and Sidebar Polish

**Rationale:** The analytics tab architecture is already correct (lazy load on tab switch, insights cached, detail panel wired). This phase polishes the rendering: Chart.js via CDN for trend/funnel charts, loading skeleton states, and any improvements to the insight card layout. Chart.js CSP must be updated to allow `cdn.jsdelivr.net`. PostHog's `X-Frame-Options` blocks iframe embedding — data must be fetched via REST API and rendered natively (no iframe approach).

**Delivers:** Polished analytics tab with Chart.js charts, loading states, and improved insight cards.

**Addresses:** FEATURES.md "sidebar analytics tab" (P1 new feature).

**Uses:** Chart.js 4.x via CDN; existing `postHogService.getInsights()` endpoint.

**Avoids:** Pitfall 5 (iframe blocked by X-Frame-Options).

**Research flag:** Low risk but verify Chart.js CDN CSP update works in the webview sandbox before committing to it. If CDN is blocked, bundle Chart.js instead (`pnpm add chart.js`). Analytics scope requirements with OAuth vs API key also need a quick validation pass.

### Phase Ordering Rationale

- Phases 1–3 have no external dependencies and can proceed immediately.
- Phase 4 (OAuth) is gated on PostHog coordination — this external dependency is the only item that could block the milestone timeline.
- Phase 5 benefits from OAuth being in place (full analytics scope) but is architecturally independent and can proceed with API key auth.
- The ordering also reflects risk: highest-confidence work (deletion, UI polish, codegen) ships first; highest-uncertainty work (OAuth) ships when unblocked.

### Research Flags

**Needs phase research / pre-implementation validation:**
- **Phase 4 (OAuth):** PostHog OAuth app registration status, supported redirect URI schemes (`vscode://` vs localhost vs `vscode.dev/redirect`), exact endpoint URLs (`/oauth/authorize`, `/oauth/token`), and minimum required scopes. This is LOW confidence in current research and must be resolved before any implementation.

**Standard patterns (skip research-phase):**
- **Phase 1 (Dead code removal):** Mechanical deletion with manifest audit. No unknowns.
- **Phase 2 (Auth landing + search/filter):** Webview template edits; existing pattern applies directly.
- **Phase 3 (Code generation):** Pure function + VS Code filesystem write; well-documented.
- **Phase 5 (Analytics tab):** Existing data flow unchanged; Chart.js is standard.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core VS Code APIs confirmed against official docs and extension samples; Chart.js is standard; crypto module is built-in |
| Features | HIGH | Existing codebase validated directly; LaunchDarkly competitor analyzed; feature boundaries are clear |
| Architecture | HIGH | Current codebase structure is correct; new components fit cleanly; all patterns are established |
| Pitfalls | MEDIUM-HIGH | VS Code pitfalls confirmed via official docs and repo issues; PostHog OAuth specifics are MEDIUM confidence only |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **PostHog OAuth app registration (LOW confidence):** Whether PostHog will register the VS Code extension as an OAuth client, which redirect URI schemes they support, and exact endpoint URLs are unknown. This is the only item that cannot proceed to implementation without external confirmation. Handle by: contact PostHog team before Phase 4 begins; keep API key path as permanent fallback.

- **Analytics tab OAuth scope requirements (MEDIUM confidence):** Whether the saved insights endpoint (`/api/projects/{id}/insights/?saved=true`) requires scopes beyond a personal API key is unconfirmed. Handle by: test the endpoint with an existing API key token in Phase 5 before assuming OAuth scope is required.

- **Chart.js CDN CSP in VS Code webview (MEDIUM confidence):** Loading scripts from `cdn.jsdelivr.net` in a VS Code webview requires a CSP `script-src` update. The existing nonce-based CSP is correct but needs the CDN domain added. Handle by: validate the CSP update works in the Extension Development Host before finalizing Phase 5 implementation.

---

## Sources

### Primary (HIGH confidence)
- VS Code Webview API — https://code.visualstudio.com/api/extension-guides/webview — CSP, postMessage, iframe restrictions
- VS Code Extension Samples (authenticationprovider-sample) — https://github.com/microsoft/vscode-extension-samples — SecretStorage + EventEmitter pattern
- VS Code Remote Extensions API — https://code.visualstudio.com/api/advanced-topics/remote-extensions — UriHandler, `asExternalUri`
- VS Code Disposables and subscription leak — https://github.com/microsoft/vscode/issues/140697
- Webview UI Toolkit deprecation — https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561 — archived Jan 6 2025
- Existing codebase inspection — `/Users/fcgomes/codehog/src/` — direct source analysis (HIGH confidence)
- Chart.js v4 — https://www.chartjs.org/docs/

### Secondary (MEDIUM confidence)
- VS Code Auth Provider pattern — https://www.eliostruyf.com/create-authentication-provider-visual-studio-code/ — `registerAuthenticationProvider`, UriHandler flow
- PostHog OAuth development guide — https://posthog.com/handbook/engineering/oauth-development-guide — internal dev guide; OAuth2 flow confirmed
- PostHog Code OAuth configuration — https://github.com/PostHog/code/blob/main/docs/LOCAL-DEVELOPMENT.md — client_id and redirect URIs for Electron app (do not reuse)
- VS Code OAuth redirect URI mismatch — https://github.com/microsoft/vscode/issues/260425
- PKCE recommendation (RFC 9700) — S256 requirement confirmed

### Tertiary (LOW confidence)
- PostHog OAuth endpoint URLs (`/oauth/authorize`, `/oauth/token`) — inferred from handbook; not publicly documented for third-party app registration; must be confirmed directly with PostHog team

---

*Research completed: 2026-03-30*
*Ready for roadmap: yes*
