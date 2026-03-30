---
phase: 01-dead-code-removal
verified: 2026-03-30T15:30:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 1: Dead Code Removal Verification Report

**Phase Goal:** The extension bundle contains only code that is used; no dead features appear in the Command Palette, sidebar, or package.json contributions
**Verified:** 2026-03-30T15:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                              | Status     | Evidence                                                                      |
|----|----------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------|
| 1  | Command Palette shows no HogQL editor commands                                                      | VERIFIED   | No `openHogQLEditor`/`runHogQLFile` in package.json commands array            |
| 2  | Command Palette shows no smart capture insertion command                                             | VERIFIED   | No `insertCapture` in package.json commands array                             |
| 3  | Sidebar shows no Errors tab or error-related UI                                                     | VERIFIED   | layout.ts has only 3 tabs: Analytics, Flags, Experiments; no `section-errors` |
| 4  | TypeScript compilation produces zero errors across all four plans                                    | VERIFIED   | `pnpm compile` exits 0; webpack compiled successfully                        |
| 5  | No error tracking code in any source file                                                           | VERIFIED   | All grep checks returned empty for error tracking symbols                    |
| 6  | No HogQL editor code in any source file                                                             | VERIFIED   | All grep checks returned empty for HogQL symbols                             |
| 7  | No smart capture code in any source file                                                            | VERIFIED   | All grep checks returned empty for capture code action symbols               |
| 8  | wasm/ contains only JS/TS/TSX grammars and the tree-sitter runtime (4 files)                        | VERIFIED   | `ls wasm/`: tree-sitter.wasm, tree-sitter-javascript.wasm, tree-sitter-typescript.wasm, tree-sitter-tsx.wasm |
| 9  | grammars/ contains only JS/TS/TSX grammars (3 files)                                                | VERIFIED   | `ls grammars/`: tree-sitter-javascript.wasm, tree-sitter-typescript.wasm, tree-sitter-tsx.wasm |
| 10 | treeSitterService.ts has no Python, Go, or Ruby language definitions                                | VERIFIED   | LANG_FAMILIES contains only `javascript`, `javascriptreact`, `typescript`, `typescriptreact` |
| 11 | package.json contains no languages, grammars, or editor/title menu sections                          | VERIFIED   | No `languages`, `grammars`, or `editor/title` keys in contributes section    |
| 12 | SidebarProvider constructor has exactly 6 parameters (no errorCache)                                | VERIFIED   | Constructor: extensionUri, authService, postHogService, flagCache, experimentCache?, detailPanel? |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact                                   | Plan  | Status     | Details                                                                       |
|--------------------------------------------|-------|------------|-------------------------------------------------------------------------------|
| `src/views/HogQLEditorProvider.ts`         | 01-01 | DELETED    | File does not exist — deletion confirmed                                      |
| `syntaxes/hogql.tmLanguage.json`           | 01-01 | DELETED    | File does not exist — deletion confirmed; syntaxes/ dir is empty              |
| `src/extension.ts`                         | 01-01 | VERIFIED   | No HogQL, error tracking, or capture imports/instantiations/registrations     |
| `src/constants.ts`                         | 01-01 | VERIFIED   | No `OPEN_HOGQL_EDITOR`, `RUN_HOGQL_FILE`, or `INSERT_CAPTURE` entries         |
| `package.json`                             | 01-01 | VERIFIED   | No `hogql`, `insertCapture`, `openHogQLEditor`, `runHogQLFile` anywhere       |
| `src/services/errorCacheService.ts`        | 01-02 | DELETED    | File does not exist — deletion confirmed                                      |
| `src/providers/errorDecorationProvider.ts` | 01-02 | DELETED    | File does not exist — deletion confirmed                                      |
| `src/services/postHogService.ts`           | 01-02 | VERIFIED   | No `getErrorTrackingIssues`, `getErrorOccurrences`, `getErrorStackTrace`, `findFirstInAppFrame`; imports clean |
| `src/models/types.ts`                      | 01-02 | VERIFIED   | No `ErrorOccurrence`, `ErrorTrackingIssue`, `StackFrame`, or `ExceptionEntry` |
| `src/views/SidebarProvider.ts`             | 01-02 | VERIFIED   | No `ErrorCacheService`, `errorCache`, `loadErrors`, `jumpToError`, `openErrorPanel`, `resolveFrame`, `StackFrame` |
| `src/views/DetailPanelProvider.ts`         | 01-02 | VERIFIED   | No `showError`, `bindErrorMessages`, `getErrorScript`, `ErrorTrackingIssue`   |
| `src/views/webview/layout.ts`              | 01-02 | VERIFIED   | No `section-errors`, `errors-filter`, `errors-local-only`; 3 tabs only        |
| `src/views/webview/script.ts`              | 01-02 | VERIFIED   | No `renderErrors`, `showErrorDetail`, `loadErrors`, `errors-local-only`, `localIssueIds`; `allData` has 3 keys |
| `src/providers/captureCodeActionProvider.ts` | 01-03 | DELETED  | File does not exist — deletion confirmed                                      |
| `wasm/tree-sitter-python.wasm`             | 01-04 | DELETED    | File does not exist                                                           |
| `wasm/tree-sitter-go.wasm`                 | 01-04 | DELETED    | File does not exist                                                           |
| `wasm/tree-sitter-ruby.wasm`               | 01-04 | DELETED    | File does not exist                                                           |
| `grammars/tree-sitter-python.wasm`         | 01-04 | DELETED    | File does not exist                                                           |
| `grammars/tree-sitter-go.wasm`             | 01-04 | DELETED    | File does not exist                                                           |
| `grammars/tree-sitter-ruby.wasm`           | 01-04 | DELETED    | File does not exist                                                           |
| `src/services/treeSitterService.ts`        | 01-04 | VERIFIED   | LANG_FAMILIES has 4 entries only; no PY_/GO_/RB_ method sets or query objects; wasm refs are JS/TS/TSX only |

---

### Key Link Verification

| From                              | To                              | Via                      | Status  | Details                                                          |
|-----------------------------------|---------------------------------|--------------------------|---------|------------------------------------------------------------------|
| `src/extension.ts`                | `src/constants.ts`              | Commands import          | WIRED   | Commands object contains only valid remaining command IDs        |
| `src/extension.ts`                | `src/views/SidebarProvider.ts`  | `new SidebarProvider()`  | WIRED   | 6-argument constructor call matches current SidebarProvider signature |
| `src/views/SidebarProvider.ts`    | `src/services/postHogService.ts`| method calls             | WIRED   | Calls `getFeatureFlags`, `getExperiments`, `getInsights` — no error methods |
| `src/services/treeSitterService.ts` | `wasm/`                       | LANG_FAMILIES wasm props | WIRED   | Only `tree-sitter-javascript.wasm`, `tree-sitter-typescript.wasm`, `tree-sitter-tsx.wasm` referenced |
| `webpack.config.js`               | `grammars/`                     | CopyPlugin `grammars/*.wasm` | WIRED | Pattern copies remaining 3 JS/TS/TSX wasm files; no Python/Go/Ruby to copy |

---

### Requirements Coverage

| Requirement | Plan(s)       | Description                                                                    | Status    | Evidence                                                            |
|-------------|---------------|--------------------------------------------------------------------------------|-----------|---------------------------------------------------------------------|
| CLEAN-01    | 01-02         | Remove error tracking code (errorCacheService, errorDecorationProvider, sidebar error tab) | SATISFIED | All files deleted, all references removed, no errors tab in sidebar |
| CLEAN-02    | 01-01         | Remove HogQL editor (HogQLEditorProvider, .hogql language registration, commands) | SATISFIED | HogQLEditorProvider.ts deleted, hogql.tmLanguage.json deleted, no hogql in package.json |
| CLEAN-03    | 01-03         | Remove smart capture insertion (captureCodeActionProvider, related commands)    | SATISFIED | captureCodeActionProvider.ts deleted, no insertCapture in package.json or source |
| CLEAN-04    | 01-04         | Remove Python, Go, Ruby tree-sitter grammars and WASM files                    | SATISFIED | 6 WASM files deleted, treeSitterService.ts has only JS/TS/TSX definitions |
| CLEAN-05    | 01-01, 01-03  | Remove all package.json contributions for dropped features                      | SATISFIED | No hogql, insertCapture, languages, grammars, editor/title sections remain |

**Orphaned requirements:** None. All 5 Phase 1 requirements are claimed by plans and verified satisfied.

---

### Anti-Patterns Found

None found. No TODOs, FIXMEs, placeholder returns, or empty implementations detected in modified files.

---

### Human Verification Required

No human verification needed for this phase. All changes are structural deletions and source edits verifiable by grep and compile.

---

## Gaps Summary

No gaps. All 12 observable truths are verified. All 5 requirements (CLEAN-01 through CLEAN-05) are fully satisfied. The extension bundle contains only code that is used, with no dead features in the Command Palette, sidebar, or package.json contributions.

---

_Verified: 2026-03-30T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
