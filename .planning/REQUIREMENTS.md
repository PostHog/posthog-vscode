# Requirements: Codehog v1

**Defined:** 2026-03-30
**Core Value:** Developers can see PostHog data (flags, events, experiments, sessions) inline in their code without leaving the editor.

## v1 Requirements

### Cleanup

- [x] **CLEAN-01**: Remove error tracking code (errorCacheService, errorDecorationProvider, sidebar error tab)
- [x] **CLEAN-02**: Remove HogQL editor (HogQLEditorProvider, .hogql language registration, commands)
- [x] **CLEAN-03**: Remove smart capture insertion (captureCodeActionProvider, related commands)
- [x] **CLEAN-04**: Remove Python, Go, Ruby tree-sitter grammars and WASM files
- [x] **CLEAN-05**: Remove all package.json contributions for dropped features (commands, menus, languages)

### Authentication

- [x] **AUTH-01**: User sees a polished landing page in the sidebar when not authenticated
- [x] **AUTH-02**: User can sign in via OAuth (PostHog PKCE authorization code flow)
- [x] **AUTH-03**: OAuth tokens are stored exclusively in VS Code SecretStorage
- [x] **AUTH-04**: OAuth callback validates state parameter to prevent CSRF
- [x] **AUTH-05**: User can still sign in via personal API key as fallback
- [x] **AUTH-06**: User can sign out and switch between auth methods

### Sidebar UX

- [x] **SIDE-01**: User can search/filter feature flags list by name
- [x] **SIDE-02**: User can search/filter experiments list by name
- [x] **SIDE-03**: Sidebar tabs: Flags, Experiments, Analytics (saved insights)

### Analytics

- [x] **ANLY-01**: User can view list of saved insights in the Analytics sidebar tab
- [x] **ANLY-02**: Saved insights display as lightweight cards with chart visualizations
- [x] **ANLY-03**: Charts render via Chart.js (trends, funnels, retention)
- [ ] **ANLY-04**: Insights show loading skeleton states while fetching

### Code Generation

- [x] **CGEN-01**: User can generate TypeScript type definitions from flag payloads via Command Palette
- [x] **CGEN-02**: Generated types are written to a `.posthog.d.ts` file in the workspace root
- [x] **CGEN-03**: Generated types include all active flag keys with their payload shapes

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
| CLEAN-01 | Phase 1 | Complete |
| CLEAN-02 | Phase 1 | Complete |
| CLEAN-03 | Phase 1 | Complete |
| CLEAN-04 | Phase 1 | Complete |
| CLEAN-05 | Phase 1 | Complete |
| AUTH-01 | Phase 2 | Complete |
| SIDE-01 | Phase 2 | Complete |
| SIDE-02 | Phase 2 | Complete |
| SIDE-03 | Phase 2 | Complete |
| CGEN-01 | Phase 3 | Complete |
| CGEN-02 | Phase 3 | Complete |
| CGEN-03 | Phase 3 | Complete |
| AUTH-02 | Phase 4 | Complete |
| AUTH-03 | Phase 4 | Complete |
| AUTH-04 | Phase 4 | Complete |
| AUTH-05 | Phase 4 | Complete |
| AUTH-06 | Phase 4 | Complete |
| ANLY-01 | Phase 5 | Complete |
| ANLY-02 | Phase 5 | Complete |
| ANLY-03 | Phase 5 | Complete |
| ANLY-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 — traceability confirmed against ROADMAP.md*
