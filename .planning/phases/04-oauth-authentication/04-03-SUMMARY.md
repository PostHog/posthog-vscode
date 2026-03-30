---
phase: 04-oauth-authentication
plan: 03
subsystem: ui
tags: [oauth, webview, welcome-screen, sign-in, posthog-brand]

# Dependency graph
requires:
  - phase: 02-auth-landing-and-sidebar-ux
    provides: "Welcome screen layout with id=welcome-screen and id=btn-sign-in (immutable contracts)"
  - phase: 04-oauth-authentication
    plan: 01
    provides: "SidebarProvider signInOAuth message handler"
provides:
  - "Welcome screen with two sign-in buttons: OAuth primary (btn-sign-in-oauth) and API key secondary (btn-sign-in)"
  - "signInOAuth postMessage from webview to extension host"
affects: [04-oauth-authentication]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-button sign-in pattern: primary (solid blue) + secondary (outline) with shared base class"

key-files:
  created: []
  modified:
    - src/views/webview/layout.ts
    - src/views/webview/styles.ts
    - src/views/webview/script.ts

key-decisions:
  - "btn-sign-in-oauth added as new ID; btn-sign-in preserved on API key button (immutable contract)"
  - "sign-in-btn--primary and sign-in-btn--secondary modifier classes layered on shared sign-in-btn base"
  - "Secondary button uses transparent background with vscode-input-border for theme compatibility"

patterns-established:
  - "Primary action: solid var(--ph-blue) background, white text, margin-bottom: 8px"
  - "Secondary action: transparent background, vscode-input-border outline, slightly smaller font"

requirements-completed: [AUTH-02, AUTH-05]

# Metrics
duration: 3min
completed: 2026-03-30
---

# Phase 04 Plan 03: Welcome Screen Dual Sign-In Summary

**Welcome screen updated with two sign-in buttons: OAuth as solid-blue primary and API key as outline secondary, wired via postMessage (signInOAuth / signIn)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T17:27:17Z
- **Completed:** 2026-03-30T17:29:33Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `btn-sign-in-oauth` (OAuth primary) alongside preserved `btn-sign-in` (API key secondary) in layout.ts
- Added `.sign-in-btn--primary` and `.sign-in-btn--secondary` CSS modifier classes to styles.ts
- Wired `btn-sign-in-oauth` click to `send({ type: 'signInOAuth' })` in script.ts without touching existing API key handler

## Task Commits

Each task was committed atomically:

1. **Task 1: Add OAuth button to layout and update button styles** - `7e82226` (feat)
2. **Task 2: Add OAuth button click handler in script.ts** - `996492d` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/views/webview/layout.ts` - Added two sign-in buttons; removed old single button
- `src/views/webview/styles.ts` - Replaced single .sign-in-btn rule with base + primary/secondary modifiers
- `src/views/webview/script.ts` - Added event listener for btn-sign-in-oauth above the existing btn-sign-in listener

## Decisions Made
- `btn-sign-in` ID preserved on API key button — immutable contract from Phase 2; OAuth button gets new `btn-sign-in-oauth` ID
- Hint text changed from "Requires a PostHog personal API key" to "API key works for self-hosted instances" to frame it as a fallback rather than a requirement
- Secondary button styled with `transparent` background and `vscode-input-border` to respect VS Code theme variables

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Welcome screen now shows both auth paths; SidebarProvider (04-01) already handles `signInOAuth` message
- OAuth flow is fully wired end-to-end through the webview layer
- Remaining OAuth work (if any) depends on PostHog OAuth app registration confirmation

---
*Phase: 04-oauth-authentication*
*Completed: 2026-03-30*
