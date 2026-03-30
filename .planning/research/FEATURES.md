# Feature Research

**Domain:** PostHog VS Code extension — developer tools analytics/feature flag IDE integration
**Researched:** 2026-03-30
**Confidence:** HIGH (existing codebase validated, competitor analysis complete, VS Code API verified)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Inline flag decorations | GitLens, Error Lens have normalized inline-code metadata; every flag tool shows status in context | LOW | Already exists — rollout %, variant count |
| Flag key autocomplete | Any IDE integration for a string-key API must complete those keys | LOW | Already exists — flagCompletionProvider |
| Cmd+click navigation to PostHog | LaunchDarkly extension does this; standard link-provider pattern | LOW | Already exists — flagLinkProvider |
| Sidebar flag list with status | LaunchDarkly's Flag Explorer is the reference; tree view with live status is expected | MEDIUM | Already exists — sidebar flags view |
| Hover detail on flag key | LaunchDarkly shows tooltip on hover; users expect this after autocomplete | LOW | Not in current codebase — notable gap |
| Authentication that works reliably | OAuth is the modern standard; API-key-only auth feels like a step down | MEDIUM | Active — OAuth flow to be added |
| Clear onboarding / auth landing | Empty sidebar or cryptic error on fresh install breaks trust immediately | LOW | Active — better auth landing page |
| Search / filter on flag list | Any list > 20 items needs filtering; LaunchDarkly has this | LOW | Active — sidebar search/filter |
| Event name autocomplete | Same rationale as flag autocomplete; posthog.capture() calls need it | LOW | Already exists — eventCompletionProvider |
| Stale flag detection | Rolled-out flags left in code are a real maintenance problem; detection has high ROI | MEDIUM | Already exists — staleFlagService |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but expected to be absent from competitors.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Flag payload TypeScript type generation | PostHog flags can carry arbitrary JSON payloads; today developers cast to `any` or hand-write types. Auto-generating typed interfaces from live flag data eliminates a real daily friction point — LaunchDarkly has no equivalent | HIGH | Active — code generation feature; generate `.d.ts` or inline interface, write to file or clipboard |
| Inline event sparklines + 7d volume | No other VS Code analytics extension shows event volume inline at the call site; connects "did I instrument this correctly?" to real production data | MEDIUM | Already exists — eventDecorationProvider |
| Experiment Bayesian results in-editor | Seeing p-values and uplift inline while writing experiment guard code is unique; no competitor does this | HIGH | Already exists — experimentCacheService + variant highlight |
| Session CodeLens ("X sessions / Y users") | Seeing session volume above a posthog.capture() call makes instrumentation quality visible without leaving the editor | MEDIUM | Already exists — sessionCodeLensProvider |
| Analytics tab showing saved insights | Bringing PostHog's insight charts into the sidebar makes the extension a genuine analytics hub, not just a flag checker | HIGH | Active — sidebar analytics tab |
| Event property autocomplete with top values | Completing property names AND showing common values is a step beyond LaunchDarkly's autocomplete | MEDIUM | Already exists — eventPropertyCompletionProvider |
| "Create flag" code action from unknown key | Auto-creating a flag in PostHog from a string literal with no matching flag is a one-click DX win | MEDIUM | Already exists — flagCodeActionProvider |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multi-language support (Python, Go, Ruby) | Users in polyglot repos want coverage everywhere | Tree-sitter grammar loading per language multiplies testing surface, maintenance burden, and WASM size; early expansion before JS/TS is solid will fragment quality | Commit to JS/TS excellence in v1; add one language only after validation with real user demand |
| HogQL query editor in VS Code | Power users want SQL access without browser tab switching | Niche audience, competes with PostHog's own polished query UI, high implementation complexity for low incremental value | Deep-link to PostHog's query UI instead |
| Smart capture insertion (auto-adding posthog.capture()) | Feels like productivity boost | Too magical — inserts code users didn't explicitly write, produces unexpected diffs, creates friction when the suggestion is wrong | Autocomplete on existing calls is the right UX; insertion belongs in Copilot/AI territory |
| Error tracking inline in editor | Relevant to developers debugging | High complexity, duplicates what Sentry/Rollbar extensions already do well, not PostHog's core; dilutes extension focus | Keep error tracking in the PostHog web UI; the extension stays focused on flags/events/experiments |
| Real-time flag polling at high frequency | "Show me live flag state" sounds useful | Hammers the PostHog API, creates rate-limit risk, drains battery on laptops, not meaningfully different from 30s polling | Poll on a reasonable interval (30–60s), refresh on user action |
| Full PostHog dashboard in sidebar | Power users want to avoid browser | VS Code viewport is too narrow for dashboards; rendering complex charts in a webview degrades performance and fights VS Code's theme | Show lightweight saved insights (sparklines, KPIs), not full dashboards |
| Offline / local-flag mode | Zero-latency flag resolution while disconnected | Requires local storage sync strategy, stale data risk, conflict resolution; scope creep that delays core value | Graceful degradation (cached last-known state) is sufficient |

## Feature Dependencies

```
OAuth flow
    └──enables──> Sidebar analytics tab (saved insights require authenticated session scope)
    └──enables──> Better auth UX (OAuth replaces API-key landing with a proper flow)

Flag payload type generation
    └──requires──> Flag list (must know flag keys + payload schemas from cache)
    └──requires──> File system write access OR clipboard API (output channel)

Sidebar search/filter
    └──requires──> Sidebar flag/experiment list views (must have list before filtering it)

Experiment Bayesian results
    └──requires──> Experiment cache (fetches experiment + variant statistics)
    └──enhances──> Variant highlight (highlights code paths per variant with statistical context)

Session CodeLens
    └──requires──> Event cache (maps posthog.capture() calls to session counts via HogQL)
    └──enhances──> Event decorations (co-locates session data with event volume)

Stale flag detection
    └──requires──> Flag cache (needs full flag list with status)
    └──requires──> Tree-sitter AST (scans codebase for flag references)
```

### Dependency Notes

- **OAuth requires PostHog to support vscode:// redirect URIs.** PostHog's OAuth implementation uses authorization-code flow with PKCE (confirmed via handbook). The redirect URI question must be validated: if PostHog does not allow `vscode://` scheme callbacks, a proxy redirect server is required. This is the single highest-risk dependency in the active milestone.
- **Flag payload type generation requires flag cache:** The flag list with payload schema data must be loaded before generation is triggered. This is already satisfied by the existing flagCacheService.
- **Analytics tab requires OAuth scopes:** The saved insights endpoint may require scopes beyond what a personal API key provides. Validate scope requirements during OAuth implementation.

## MVP Definition

### Launch With (v1 — this milestone)

- [x] Better auth landing page — first impression, zero cost to fix
- [ ] OAuth authentication flow — unblocks analytics tab, modernizes auth UX
- [ ] Sidebar search/filter on flag and experiment lists — table stakes for any list > 20 items
- [ ] Flag payload TypeScript type generation — highest-differentiation new feature, solves daily pain
- [ ] Sidebar analytics tab (saved insights) — extends extension from flag tool to analytics hub
- [ ] Remove dropped features (error tracking, HogQL editor, smart capture, Python/Go/Ruby) — reduces bundle size, removes confusion

### Add After Validation (v1.x)

- [ ] Hover tooltip on flag key — LaunchDarkly has this; notable gap vs. competitor
- [ ] Flag toggle directly from extension — LaunchDarkly differentiator; high complexity but high value for rapid iteration

### Future Consideration (v2+)

- [ ] Additional language support (one language at a time after JS/TS is solid)
- [ ] Flag variant code coverage heatmap — interesting but requires metrics infrastructure
- [ ] Experiment creation from extension — high complexity, low frequency action

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Better auth landing page | HIGH | LOW | P1 |
| Sidebar search/filter | HIGH | LOW | P1 |
| Remove dropped features | MEDIUM | LOW | P1 |
| OAuth authentication flow | HIGH | MEDIUM | P1 |
| Flag payload type generation | HIGH | MEDIUM | P1 |
| Sidebar analytics tab | MEDIUM | HIGH | P1 |
| Hover tooltip on flag key | MEDIUM | LOW | P2 |
| Flag toggle from extension | HIGH | HIGH | P2 |
| Additional language support | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | LaunchDarkly VS Code ext | Codehog (current) | Codehog (target) |
|---------|--------------------------|-------------------|------------------|
| Inline flag decorations | Flag Lens (disabled by default) | Always-on rollout % and variant count | Same — always on |
| Flag autocomplete | Yes | Yes | Yes |
| Hover tooltip | Yes (rich detail) | No | P2 backlog |
| Sidebar flag list | Yes — Flag Explorer | Yes | Yes + search/filter |
| "Flags in File" view | Yes | Partial (decorations only) | Decorations sufficient |
| Quick Links to dashboard | Yes | Cmd+click | Cmd+click |
| Flag toggle from editor | Yes | No | P2 backlog |
| Auth method | Personal API Token | API key (manual) | OAuth + API key fallback |
| Event analytics inline | No | Yes — sparklines + volume | Yes — differentiator |
| Session CodeLens | No | Yes | Yes — differentiator |
| Experiment results inline | No | Yes — Bayesian stats | Yes — differentiator |
| Stale flag detection | Code References (separate CLI) | Built-in AST scan | Yes — differentiator |
| Type generation from flags | No | No | Yes — v1 new feature |
| Analytics tab (insights) | No | No | Yes — v1 new feature |
| Search/filter lists | No | No | Yes — v1 new feature |

**Assessment:** LaunchDarkly leads on hover tooltips and flag toggle. Codehog leads on event analytics, session data, experiment results, and stale detection. The flag payload type generation and analytics tab features have no competitor equivalent — these are genuine differentiators if shipped well.

## OAuth Implementation Notes

PostHog supports OAuth 2.0 authorization code flow with PKCE (confirmed, handbook source). Key implementation considerations:

1. **Redirect URI:** Use `vscode.env.asExternalUri()` to construct the callback URI. VS Code's URI handler (`vscode.window.registerUriHandler`) receives the callback. If PostHog does not whitelist `vscode://` schemes, a lightweight HTTPS proxy redirect at a fixed domain is required.
2. **PKCE:** Use authorization code flow with PKCE — no client secret stored in extension.
3. **Token storage:** Use VS Code's `SecretStorage` API (already used by authService.ts) for token persistence.
4. **Scopes:** Request minimum necessary scopes. Validate that saved-insights endpoint is accessible with OAuth token at the same scope level as personal API key.
5. **Fallback:** Keep personal API key as auth option for self-hosted PostHog instances where OAuth app registration may not be configured.

## Sources

- LaunchDarkly VS Code extension documentation: https://launchdarkly.com/docs/integrations/vscode/
- LaunchDarkly VS Code Marketplace listing: https://marketplace.visualstudio.com/items?itemName=LaunchDarklyOfficial.launchdarkly
- VS Code UX Guidelines (views, sidebars, webviews): https://code.visualstudio.com/api/ux-guidelines/overview
- VS Code Authentication API: https://code.visualstudio.com/api/references/vscode-api
- VS Code URI Handler / OAuth pattern: https://code.visualstudio.com/api/advanced-topics/remote-extensions
- PostHog OAuth development guide: https://posthog.com/handbook/engineering/oauth-development-guide
- PostHog feature flags + payloads: https://posthog.com/docs/feature-flags/creating-feature-flags
- Webview UI Toolkit deprecation (Jan 2025): https://github.com/microsoft/vscode-webview-ui-toolkit
- VS Code Tree View API: https://code.visualstudio.com/api/extension-guides/tree-view
- VS Code authenticationprovider-sample: https://github.com/microsoft/vscode-extension-samples/blob/main/authenticationprovider-sample/src/authProvider.ts

---
*Feature research for: PostHog VS Code extension (Codehog) — milestone additions*
*Researched: 2026-03-30*
