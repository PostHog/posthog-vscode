---
phase: 01-dead-code-removal
plan: "04"
subsystem: tree-sitter
tags: [dead-code, wasm, tree-sitter, language-support]
dependency_graph:
  requires: [01-03]
  provides: [CLEAN-04]
  affects: [src/services/treeSitterService.ts, wasm/, grammars/]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - src/services/treeSitterService.ts
decisions:
  - "Removed Python, Go, and Ruby tree-sitter grammar support; v1 supports only JavaScript, TypeScript, JSX, and TSX"
  - "wasm/ and grammars/ directories are in .gitignore; WASM deletions not tracked in git but confirmed on disk"
metrics:
  duration: "~2 minutes"
  completed: "2026-03-30"
  tasks_completed: 2
  files_modified: 1
---

# Phase 01 Plan 04: Remove Python/Go/Ruby Tree-Sitter Grammar Support Summary

**One-liner:** Removed Python, Go, and Ruby WASM grammar files and all corresponding language definitions from treeSitterService.ts, reducing wasm/ directory from 6.0M to 3.3M.

## What Was Done

Removed multi-language tree-sitter support that was out of scope for v1. The extension now only supports JavaScript, TypeScript, JSX (javascriptreact), and TSX (typescriptreact).

### Task 1: Delete Python, Go, Ruby WASM files

Deleted 6 WASM files from disk:
- `wasm/tree-sitter-python.wasm` (not git-tracked, in .gitignore)
- `wasm/tree-sitter-go.wasm`
- `wasm/tree-sitter-ruby.wasm`
- `grammars/tree-sitter-python.wasm`
- `grammars/tree-sitter-go.wasm`
- `grammars/tree-sitter-ruby.wasm`

Both `wasm/` and `grammars/` were cleaned. The webpack CopyPlugin uses `grammars/*.wasm` as source, so cleaning grammars/ prevents re-copy on next build. Post-compile verification confirmed the CopyPlugin only outputs 3 JS/TS/TSX grammars.

**wasm/ size:** 6.0M before → 3.3M after (~2.7MB reduction)

### Task 2: Remove language definitions from treeSitterService.ts

Removed 159 lines from `src/services/treeSitterService.ts`:
- `PY_CAPTURE_METHODS`, `PY_FLAG_METHODS`, `PY_ALL_METHODS` constants
- `GO_CAPTURE_METHODS`, `GO_FLAG_METHODS`, `GO_ALL_METHODS` constants
- `RB_CAPTURE_METHODS`, `RB_FLAG_METHODS`, `RB_ALL_METHODS` constants
- `PYTHON_QUERIES` object (entire tree-sitter query set for Python)
- `GO_QUERIES` object (entire tree-sitter query set for Go)
- `RUBY_QUERIES` object (entire tree-sitter query set for Ruby)
- `python`, `go`, `ruby` entries from `LANG_FAMILIES` map

The `supportedLanguages` getter and `isSupported()` method derive dynamically from `LANG_FAMILIES` — no changes needed there.

## Verification Results

- `pnpm compile` exits 0 (webpack compiled successfully in ~700ms)
- `wasm/` contains exactly 4 files: tree-sitter.wasm, tree-sitter-javascript.wasm, tree-sitter-typescript.wasm, tree-sitter-tsx.wasm
- `grammars/` contains exactly 3 files: tree-sitter-javascript.wasm, tree-sitter-typescript.wasm, tree-sitter-tsx.wasm
- `grep -cE 'python|ruby|go' src/services/treeSitterService.ts` returns 0

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 + 2 | 70f11da | chore(01-04): remove Python, Go, Ruby tree-sitter language support |

## Deviations from Plan

None - plan executed exactly as written.

Note: Tasks 1 and 2 were committed together in a single commit because `wasm/` and `grammars/` are in `.gitignore` and are not git-tracked, so Task 1 produced no staged changes by itself. The combined commit accurately captures both tasks.

## Self-Check: PASSED

- src/services/treeSitterService.ts: FOUND (modified, 159 lines deleted)
- Commit 70f11da: FOUND
- wasm/tree-sitter-python.wasm: MISSING (deleted as intended)
- wasm/tree-sitter-go.wasm: MISSING (deleted as intended)
- wasm/tree-sitter-ruby.wasm: MISSING (deleted as intended)
- grammars/tree-sitter-python.wasm: MISSING (deleted as intended)
- grammars/tree-sitter-go.wasm: MISSING (deleted as intended)
- grammars/tree-sitter-ruby.wasm: MISSING (deleted as intended)
