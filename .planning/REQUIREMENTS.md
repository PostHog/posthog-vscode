# Requirements: Codehog v1

**Defined:** 2026-03-30
**Core Value:** Developers can see PostHog data (flags, events, experiments, sessions) inline in their code without leaving the editor.

## v1 Requirements

### Cleanup

- [ ] **CLEAN-01**: Remove error tracking code (errorCacheService, errorDecorationProvider, sidebar error tab)
- [x] **CLEAN-02**: Remove HogQL editor (HogQLEditorProvider, .hogql language registration, commands)
- [ ] **CLEAN-03**: Remove smart capture insertion (captureCodeActionProvider, related commands)
- [ ] **CLEAN-04**: Remove Python, Go, Ruby tree-sitter grammars and WASM files
- [x] **CLEAN-05**: Remove all package.json contributions for dropped features (commands, menus, languages)

### Authentication

- [ ] **AUTH-01**: User sees a polished landing page in the sidebar when not authenticated
- [ ] **AUTH-02**: User can sign in via OAuth (PostHog PKCE authorization code flow)
- [ ] **AUTH-03**: OAuth tokens are stored exclusively in VS Code SecretStorage
- [ ] **AUTH-04**: OAuth callback validates state parameter to prevent CSRF
- [ ] **AUTH-05**: User can still sign in via personal API key as fallback
- [ ] **AUTH-06**: User can sign out and switch between auth methods

### Sidebar UX

- [ ] **SIDE-01**: User can search/filter feature flags list by name
- [ ] **SIDE-02**: User can search/filter experiments list by name
- [ ] **SIDE-03**: Sidebar tabs: Flags, Experiments, Analytics (saved insights)

### Analytics

- [ ] **ANLY-01**: User can view list of saved insights in the Analytics sidebar tab
- [ ] **ANLY-02**: Saved insights display as lightweight cards with chart visualizations
- [ ] **ANLY-03**: Charts render via Chart.js (trends, funnels, retention)
- [ ] **ANLY-04**: Insights show loading skeleton states while fetching

### Code Generation

- [ ] **CGEN-01**: User can generate TypeScript type definitions from flag payloads via Command Palette
- [ ] **CGEN-02**: Generated types are written to a `.posthog.d.ts` file in the workspace root
- [ ] **CGEN-03**: Generated types include all active flag keys with their payload shapes

## v2 Requirements

### Enhanced Intelligence

- **HOVR-01**: User sees hover tooltip with flag detail when hovering over flag key string
- **TOGL-01**: User can toggle a flag directly from the extension

### Language Support

- **LANG-01**: Python support for PostHog calls detection
- **LANG-02**: Go support for PostHog calls detection

## Out of Scope

| Feature | Reason |
|---------|--------|
| HogQL query editor | Niche feature, competes with PostHog's own polished query UI |
| Smart capture insertion | Too magical, inserts code users didn't write, creates unexpected diffs |
| Error tracking inline | Duplicates Sentry/Rollbar, not PostHog's core, dilutes focus |
| Full dashboard embedding | VS Code viewport too narrow, webview performance degrades |
| Real-time high-frequency polling | Hammers API, drains battery, 30-60s interval sufficient |
| Offline/local flag mode | Scope creep, cached last-known state sufficient |
| Multi-language v1 | JS/TS only for v1, validate before expanding |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLEAN-01 | Phase 1 | Pending |
| CLEAN-02 | Phase 1 | Complete |
| CLEAN-03 | Phase 1 | Pending |
| CLEAN-04 | Phase 1 | Pending |
| CLEAN-05 | Phase 1 | Complete |
| AUTH-01 | Phase 2 | Pending |
| SIDE-01 | Phase 2 | Pending |
| SIDE-02 | Phase 2 | Pending |
| SIDE-03 | Phase 2 | Pending |
| CGEN-01 | Phase 3 | Pending |
| CGEN-02 | Phase 3 | Pending |
| CGEN-03 | Phase 3 | Pending |
| AUTH-02 | Phase 4 | Pending |
| AUTH-03 | Phase 4 | Pending |
| AUTH-04 | Phase 4 | Pending |
| AUTH-05 | Phase 4 | Pending |
| AUTH-06 | Phase 4 | Pending |
| ANLY-01 | Phase 5 | Pending |
| ANLY-02 | Phase 5 | Pending |
| ANLY-03 | Phase 5 | Pending |
| ANLY-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 — traceability confirmed against ROADMAP.md*
