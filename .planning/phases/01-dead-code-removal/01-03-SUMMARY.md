---
phase: 01-dead-code-removal
plan: 03
subsystem: ui
tags: [vscode-extension, code-actions, typescript, cleanup]

# Dependency graph
requires:
  - phase: 01-dead-code-removal/01-02
    provides: Error tracking removal (SidebarProvider, errorTrackingProvider, types cleaned)
provides:
  - Smart capture insertion feature fully removed from source, manifest, and constants
affects: [extension.ts, constants.ts, package.json]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/extension.ts
    - src/constants.ts
    - package.json
  deleted:
    - src/providers/captureCodeActionProvider.ts

key-decisions:
  - "Deleted captureCodeActionProvider.ts entirely - no salvageable logic for v1"

patterns-established: []

requirements-completed: [CLEAN-03, CLEAN-05]

# Metrics
duration: 5min
completed: 2026-03-30
---

# Phase 01 Plan 03: Smart Capture Removal Summary

**Deleted CaptureCodeActionProvider and posthog.insertCapture command — source file, extension wiring, constants, and package.json contribution all removed**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-30T15:10:00Z
- **Completed:** 2026-03-30T15:15:00Z
- **Tasks:** 1
- **Files modified:** 4 (1 deleted, 3 edited)

## Accomplishments
- Deleted `src/providers/captureCodeActionProvider.ts` (111 lines of dead code)
- Removed `CaptureCodeActionProvider` import, instantiation, and `registerCodeActionsProvider` call from `extension.ts`
- Removed `registerCaptureCommands()` spread from `context.subscriptions.push()` in `extension.ts`
- Removed `INSERT_CAPTURE: 'posthog.insertCapture'` from `constants.ts`
- Removed `posthog.insertCapture` command contribution from `package.json`
- TypeScript compilation confirmed clean with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove smart capture insertion feature** - `3e12cbf` (chore)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/providers/captureCodeActionProvider.ts` - DELETED (smart capture code action + registerCaptureCommands)
- `src/extension.ts` - Removed import, instantiation, and two registrations
- `src/constants.ts` - Removed INSERT_CAPTURE command ID
- `package.json` - Removed posthog.insertCapture command contribution

## Decisions Made
None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dead code removal phase complete (Plans 01, 02, 03 all done)
- Extension compiles cleanly with no HogQL editor, error tracking, or smart capture code remaining
- Ready to proceed to Phase 2

---
*Phase: 01-dead-code-removal*
*Completed: 2026-03-30*
