# Roadmap: Codehog v1

## Overview

This milestone takes Codehog from a working-but-bloated brownfield extension to a clean, polished v1. The journey runs in dependency order: remove dead code first to eliminate noise, then improve visual surfaces with no external dependencies, then add the highest-differentiation new feature (type generation), then tackle the highest-risk feature (OAuth with external PostHog coordination required), and finally polish the analytics tab. Every phase delivers a coherent, independently testable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Dead Code Removal** - Remove all dropped features — HogQL editor, error tracking, smart capture, and non-JS/TS language support (completed 2026-03-30)
- [ ] **Phase 2: Auth Landing and Sidebar UX** - Polished unauthenticated landing page, sidebar search/filter on flags and experiments, and three-tab sidebar structure
- [ ] **Phase 3: Flag Type Generation** - Command Palette entry generates TypeScript type definitions from live flag payloads into a `.posthog.d.ts` file
- [ ] **Phase 4: OAuth Authentication** - Full PKCE authorization code flow with PostHog as the provider; personal API key fallback preserved
- [ ] **Phase 5: Analytics Tab** - Polished Analytics sidebar tab with Chart.js visualizations, loading skeleton states, and improved insight cards

## Phase Details

### Phase 1: Dead Code Removal
**Goal**: The extension bundle contains only code that is used; no dead features appear in the Command Palette, sidebar, or package.json contributions
**Depends on**: Nothing (first phase)
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05
**Success Criteria** (what must be TRUE):
  1. Opening the Command Palette shows no commands related to error tracking, HogQL editor, or smart capture insertion
  2. The sidebar shows no error tracking tab or HogQL-related UI elements
  3. The .vsix bundle size is measurably smaller (3-6 MB reduction from removed WASM grammars)
  4. TypeScript compilation produces zero errors referencing removed modules
**Plans**: 4 plans

Plans:
- [ ] 01-01-PLAN.md — Remove HogQL editor feature
- [ ] 01-02-PLAN.md — Remove error tracking from all layers (services, providers, views, webview)
- [ ] 01-03-PLAN.md — Remove smart capture insertion feature
- [ ] 01-04-PLAN.md — Remove Python, Go, Ruby tree-sitter grammars and WASM files

### Phase 2: Auth Landing and Sidebar UX
**Goal**: Every new user sees a polished, on-brand landing page before signing in, and every authenticated user can find flags and experiments quickly using search
**Depends on**: Phase 1
**Requirements**: AUTH-01, SIDE-01, SIDE-02, SIDE-03
**Success Criteria** (what must be TRUE):
  1. An unauthenticated user opening the sidebar sees a branded landing page with a clear sign-in call to action
  2. A user with 50+ flags can type in a search box and see the list filter to matching results in real time
  3. A user with 50+ experiments can type in a search box and see the list filter to matching results in real time
  4. The sidebar shows three tabs — Flags, Experiments, Analytics — and switching between them persists the search state
**Plans**: TBD

### Phase 3: Flag Type Generation
**Goal**: A developer can generate accurate TypeScript type definitions from their live PostHog flags without leaving the editor
**Depends on**: Phase 2
**Requirements**: CGEN-01, CGEN-02, CGEN-03
**Success Criteria** (what must be TRUE):
  1. Running "PostHog: Generate Flag Types" from the Command Palette creates or overwrites `.posthog.d.ts` in the workspace root
  2. The generated file contains a TypeScript type for every active flag key, including payload shape where defined
  3. A developer can import the generated types in their application code and get type-safe access to flag payloads
**Plans**: TBD

### Phase 4: OAuth Authentication
**Goal**: A developer can sign in to PostHog using the standard OAuth flow without handling an API key manually; the existing API key path remains fully functional
**Depends on**: Phase 3
**Requirements**: AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06
**Success Criteria** (what must be TRUE):
  1. Clicking "Sign in with PostHog" opens the PostHog authorization page in the browser and completes sign-in without requiring the user to copy a token
  2. After OAuth sign-in, the extension works across editor restarts without re-authenticating (tokens survive session)
  3. A developer can still sign in using a personal API key as an alternative to OAuth
  4. A developer can sign out and switch between OAuth and API key auth methods
  5. The OAuth callback validates the state parameter — a replayed or forged callback is rejected silently
**Plans**: TBD

### Phase 5: Analytics Tab
**Goal**: The Analytics tab shows the developer's saved PostHog insights with chart visualizations rendered natively in the sidebar
**Depends on**: Phase 4
**Requirements**: ANLY-01, ANLY-02, ANLY-03, ANLY-04
**Success Criteria** (what must be TRUE):
  1. Opening the Analytics tab shows a list of the user's saved PostHog insights as cards
  2. Each insight card displays a Chart.js chart — trend line, funnel, or retention curve — matching the insight type
  3. While insights are loading, the tab shows skeleton placeholder cards rather than a blank state
  4. Charts render correctly in both VS Code light and dark themes
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Dead Code Removal | 4/4 | Complete   | 2026-03-30 |
| 2. Auth Landing and Sidebar UX | 0/? | Not started | - |
| 3. Flag Type Generation | 0/? | Not started | - |
| 4. OAuth Authentication | 0/? | Not started | - |
| 5. Analytics Tab | 0/? | Not started | - |
