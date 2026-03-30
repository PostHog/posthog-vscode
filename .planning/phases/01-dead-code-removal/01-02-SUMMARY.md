---
phase: 01-dead-code-removal
plan: 02
subsystem: ui
tags: [vscode-extension, dead-code, error-tracking, webview, cleanup]

# Dependency graph
requires:
  - phase: 01-dead-code-removal
    provides: "Plan 01 dead-code removals (HogQL editor, related providers)"
provides:
  - Error tracking completely removed from all layers: services, providers, views, webview HTML/JS
  - SidebarProvider constructor with 6 parameters (no errorCache)
  - Sidebar with Analytics, Flags, Experiments tabs only (no Errors tab)
  - TypeScript compiles cleanly with zero errors
affects: [02-feature-flags, 03-experiments, 04-analytics, 05-session-replay]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/extension.ts
    - src/services/postHogService.ts
    - src/models/types.ts
    - src/views/SidebarProvider.ts
    - src/views/DetailPanelProvider.ts
    - src/views/webview/layout.ts
    - src/views/webview/script.ts

key-decisions:
  - "Removed ErrorCacheService and ErrorDecorationProvider entirely (no longer needed)"
  - "Removed StackFrame and ExceptionEntry from models/types.ts (no remaining consumers after error removal)"
  - "Removed resolveFilePath from SidebarProvider (only called by loadErrors which was removed)"

patterns-established: []

requirements-completed: [CLEAN-01, CLEAN-05]

# Metrics
duration: 7min
completed: 2026-03-30
---

# Phase 1 Plan 2: Remove Error Tracking Summary

**Error tracking removed from all layers — services, types, providers, sidebar, detail panel, and webview HTML/JS — TypeScript compiles cleanly**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-30T14:59:26Z
- **Completed:** 2026-03-30T15:06:14Z
- **Tasks:** 2
- **Files modified:** 7 (plus 2 deleted)

## Accomplishments
- Deleted `errorCacheService.ts` and `errorDecorationProvider.ts` entirely
- Removed all 4 error-related methods from `postHogService.ts` (getErrorTrackingIssues, getErrorStackTrace, getErrorOccurrences, findFirstInAppFrame)
- Removed ErrorTrackingIssue, ErrorOccurrence, StackFrame, ExceptionEntry from `models/types.ts`
- Removed error tracking wiring from `extension.ts` (imports, instantiation, startup load, registration)
- Cleaned all error code from SidebarProvider, DetailPanelProvider, layout.ts, and script.ts
- Sidebar now has three tabs: Analytics, Flags, Experiments — no Errors tab

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove error tracking source files, extension wiring, service methods, and types** - `f867f45` (feat)
2. **Task 2: Remove error tracking from SidebarProvider, DetailPanelProvider, and webview files** - `45fa777` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/services/errorCacheService.ts` - DELETED
- `src/providers/errorDecorationProvider.ts` - DELETED
- `src/extension.ts` - Removed error imports, instantiation, startup load, and registration
- `src/services/postHogService.ts` - Removed 4 error methods and 4 error type imports
- `src/models/types.ts` - Removed ErrorTrackingIssue, ErrorOccurrence, StackFrame, ExceptionEntry interfaces
- `src/views/SidebarProvider.ts` - Removed errorCache param, error message handlers, loadErrors/jumpToError/openErrorPanel/resolveFrame/resolveFilePath methods
- `src/views/DetailPanelProvider.ts` - Removed showError, bindErrorMessages, getErrorScript and related imports
- `src/views/webview/layout.ts` - Removed Errors nav tab, errors-filter div, section-errors div
- `src/views/webview/script.ts` - Removed renderErrors, showErrorDetail, errors allData key, localIssueIds, errors message handler, errors-local-only listener

## Decisions Made
- Removed StackFrame and ExceptionEntry from models/types.ts since all consumers (postHogService error methods, SidebarProvider resolveFrame, DetailPanelProvider bindErrorMessages) were also being removed
- Removed resolveFilePath from SidebarProvider since it was only called by loadErrors (which was removed)
- Kept the jump-to-code concept out — it's only viable if error tracking is in scope

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Compile errors after Task 1 (in SidebarProvider and DetailPanelProvider) were expected and fully resolved by Task 2 as planned.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Error tracking is cleanly removed across all layers. Extension compiles and bundles with zero errors.
- The sidebar now shows only the three v1 tabs: Analytics, Flags, Experiments.
- Ready to proceed to Plan 03 or any remaining dead-code removal plans.

---
*Phase: 01-dead-code-removal*
*Completed: 2026-03-30*
