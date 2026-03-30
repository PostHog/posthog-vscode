---
phase: 01-dead-code-removal
plan: "01"
subsystem: ui
tags: [hogql, vscode-extension, dead-code, cleanup]

# Dependency graph
requires: []
provides:
  - Extension with HogQL editor feature fully removed from source, manifest, and constants
affects: [02-dead-code-removal, ui, extension]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/extension.ts
    - src/constants.ts
    - src/services/postHogService.ts
    - package.json

key-decisions:
  - "Removed runHogQLQuery from postHogService.ts since it was only called by HogQLEditorProvider (not used anywhere else)"
  - "Removed editor/title menus section entirely since the only entry was the hogql run button"
  - "Removed languages and grammars arrays entirely since the only entries were for hogql"

patterns-established: []

requirements-completed: [CLEAN-02, CLEAN-05]

# Metrics
duration: 1min
completed: 2026-03-30
---

# Phase 1 Plan 1: Remove HogQL Editor Feature Summary

**Deleted HogQLEditorProvider and hogql grammar/language contributions, eliminating all HogQL editor dead code from source, constants, postHogService, and package.json manifest.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-30T14:55:34Z
- **Completed:** 2026-03-30T14:57:11Z
- **Tasks:** 1
- **Files modified:** 4 modified, 2 deleted

## Accomplishments
- Deleted `src/views/HogQLEditorProvider.ts` and `syntaxes/hogql.tmLanguage.json`
- Removed `OPEN_HOGQL_EDITOR` and `RUN_HOGQL_FILE` command constants from `constants.ts`
- Removed HogQL import, instantiation, and two command registrations from `extension.ts`
- Removed `runHogQLQuery` method from `postHogService.ts`
- Removed 2 commands, `editor/title` menus section, `languages` array, and `grammars` array from `package.json`
- TypeScript compilation produces zero errors (`pnpm compile` exits 0)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove HogQL editor feature** - `0f4c7d5` (feat)

**Plan metadata:** _(created after this summary)_

## Files Created/Modified
- `src/extension.ts` - Removed HogQL import, instantiation, and 2 command registrations
- `src/constants.ts` - Removed OPEN_HOGQL_EDITOR and RUN_HOGQL_FILE entries
- `src/services/postHogService.ts` - Removed runHogQLQuery method
- `package.json` - Removed openHogQLEditor/runHogQLFile commands, editor/title menu, languages array, grammars array
- `src/views/HogQLEditorProvider.ts` - Deleted
- `syntaxes/hogql.tmLanguage.json` - Deleted

## Decisions Made
- Removed `runHogQLQuery` from `postHogService.ts` since it was exclusively called from `HogQLEditorProvider` and is now dead code
- Removed the `editor/title` menus section entirely (its only entry was the hogql run button)
- Removed `languages` and `grammars` arrays entirely (their only entries were for hogql)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 1 plan 1 complete; codebase compiles cleanly with no HogQL editor traces
- Ready for next dead-code-removal plan

## Self-Check: PASSED

- HogQLEditorProvider.ts: DELETED
- hogql.tmLanguage.json: DELETED
- 01-01-SUMMARY.md: FOUND
- Commit 0f4c7d5: FOUND

---
*Phase: 01-dead-code-removal*
*Completed: 2026-03-30*
